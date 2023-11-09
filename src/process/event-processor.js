import IDMapping from '../db/redis/id-mapping.js';
import { newLogger } from '../common/logger.js';
import WebhooksEvent from '../process/event.js';
import UserMapping from '../db/redis/user-mapping.js';
import Utils from '../common/utils.js';
import Metrics from '../metrics/index.js';
import config from 'config';

const Logger = newLogger('event-processor');

export default class EventProcessor {
  static _defaultCollector () {
    throw new Error('Collector not set');
  }

  constructor(
    inputs,
    outputs,
  ) {
    this.inputs = inputs;
    this.outputs = outputs;

    this._exporter = Metrics.agent;
  }

  _trackModuleEvents() {
    this.outputs.forEach((output) => {
      output.on('eventDispatchFailed', ({ event, raw, error }) => {
        Logger.error('error notifying output module', {
          error: error.stack,
          event,
          raw,
        });
        this._exporter.increment(Metrics.METRIC_NAMES.EVENT_DISPATCH_FAILURES, {
          outputEventId: event?.data?.id || 'unknown',
          module: output.name,
        });
      });
    });
  }

  start() {
    this.inputs.forEach((input) => {
      input.setCollector(this.processInputEvent.bind(this));
    });

    return Promise.resolve();
  }

  stop() {
    this.inputs.forEach((input) => {
      input.setCollector(EventProcessor._defaultCollector);
    });
  }

  _parseEvent(event) {
    let parsedEvent = event;

    if (typeof event === 'string') parsedEvent = JSON.parse(event);

    return parsedEvent;
  }

  // TODO move this to an event factory
  // Spoofs a user left event for a given user when a meeting ends (so that the user
  // is removed from the user mapping AND the user left event is sent to output modules).
  // This is necessary because the user left event is not sent by BBB when a meeting ends.
  _spoofUserLeftEvent(internalMeetingID, externalMeetingID, userData) {
    if (userData == null || userData.user == null) {
      Logger.warn('cannot spoof user left event, user is null');
      return;
    }

    const spoofedUserLeft = {
      data: {
        "type": "event",
        "id": "user-left",
        "attributes":{
          "meeting":{
            "internal-meeting-id": internalMeetingID,
            "external-meeting-id": externalMeetingID,
          },
          "user": userData.user,
        },
        "event":{
          "ts": Date.now()
        }
      }
    };

    this.processInputEvent(spoofedUserLeft);
  }

  async _handleMeetingEndedEvent(event) {
    const internalMeetingId = event.data.attributes.meeting["internal-meeting-id"];
    const externalMeetingId = event.data.attributes.meeting["external-meeting-id"];

    try {
      await IDMapping.get().removeMapping(internalMeetingId)
    } catch (error) {
      Logger.error(`error removing meeting mapping: ${error}`, {
        error: error.stack,
        event,
      });
    }

    try {
      const users = await UserMapping.get().getUsersFromMeeting(internalMeetingId);
      users.forEach(user => this._spoofUserLeftEvent(internalMeetingId, externalMeetingId, user));
      await UserMapping.get().removeMappingWithMeetingId(internalMeetingId);
    } catch (error) {
      Logger.error(`error removing user mappings: ${error}`, {
        error: error.stack,
        event,
      });
    }
  }

  _handleUserEmojiChangedEvent(outputEvent, rawEvent) {
    const internalUserId = outputEvent.data.attributes.user["internal-user-id"];
    const emoji = outputEvent.data.attributes.user.emoji;

    this._notifyOutputModules(outputEvent, rawEvent);

    // If the emoji changed to raiseHand, we're dealing with BBB < 2.7
    // where the events weren't separated yet. In this case, we'll
    // spoof a raiseHand event and store the state so we can
    // spoof a raiseHand: false event when user-emoji-changed is
    // called again with a different emoji.
    if (emoji === 'raiseHand') {
      const spoofedEvent = config.util.cloneDeep(outputEvent);
      spoofedEvent.data.id = 'user-raise-hand-changed';
      delete spoofedEvent.data.attributes.user.emoji;
      spoofedEvent.data.attributes.user.raiseHand = true;

      return UserMapping.get().updateWithField(
        'internalUserID',
        internalUserId, {
          user: {
            raiseHand: true,
          },
        }
      ).catch((error) => {
        Logger.error('error updating user mapping', error);}
      ).finally(() => {
        this._notifyOutputModules(spoofedEvent, rawEvent);
      });
    }

    const userInfo = UserMapping.get().getUser(internalUserId);

    // Emoji changed and raiseHand was true, so we'll spoof a raiseHand: false
    if (userInfo != null && userInfo.raiseHand === true) {
      const spoofedEvent = config.util.cloneDeep(outputEvent);
      spoofedEvent.data.id = 'user-raise-hand-changed';
      delete spoofedEvent.data.attributes.user.emoji;
      spoofedEvent.data.attributes.user.raiseHand = false;

      return UserMapping.get().updateWithField(
        'internalUserID',
        internalUserId, {
          user: {
            raiseHand: false,
          },
        }
      ).catch((error) => {
        Logger.error('error updating user mapping', error);
      }).finally(() => {
        this._notifyOutputModules(spoofedEvent, rawEvent);
      });
    }

    return Promise.resolve();
  }

  processInputEvent(event) {
    try {
      const rawEvent = this._parseEvent(event);
      const eventInstance = new WebhooksEvent(rawEvent);
      const outputEvent = eventInstance.outputEvent;

      if (!Utils.isEmpty(outputEvent)) {
        Logger.trace('raw event succesfully parsed', { rawEvent });
        const internalMeetingId = outputEvent.data.attributes.meeting["internal-meeting-id"];
        IDMapping.get().reportActivity(internalMeetingId);

        // Any kind of retrocompatibility logic, output event post-processing,
        // data storage et al. should be done here.
        switch (outputEvent.data.id) {
          case "meeting-created":
            IDMapping.get().addOrUpdateMapping(internalMeetingId,
              outputEvent.data.attributes.meeting["external-meeting-id"]
            ).catch((error) => {
              Logger.error(`error adding meeting mapping: ${error}`, {
                error: error.stack,
                event,
              });
            }).finally(() => {
              // has to be here, after the meeting was created, otherwise create calls won't generate
              // callback calls for meeting hooks
              this._notifyOutputModules(outputEvent, rawEvent);
            });
            break;
          case "user-joined":
            UserMapping.get().addOrUpdateMapping(
              outputEvent.data.attributes.user["internal-user-id"],
              outputEvent.data.attributes.user["external-user-id"],
              internalMeetingId,
              outputEvent.data.attributes.user
            ).catch((error) => {
              Logger.error(`error adding user mapping: ${error}`, {
                error: error.stack,
                event,
              })
            }).finally(() => {
              this._notifyOutputModules(outputEvent, rawEvent);
            });
            break;
          case "user-left":
            UserMapping.get().removeMapping(
              outputEvent.data.attributes.user["internal-user-id"]
            ).catch((error) => {
              Logger.error(`error removing user mapping: ${error}`, {
                error: error.stack,
                event,
              });
            }).finally(() => {
              this._notifyOutputModules(outputEvent, rawEvent);
            });
            break;
          case "user-presenter-assigned":
            UserMapping.get().updateWithField(
              'internalUserID',
              outputEvent.data.attributes.user["internal-user-id"], {
                user: {
                  presenter: true,
                },
              }
            ).catch((error) => {
              Logger.error('error updating user mapping', error);
            }).finally(() =>  {
              this._notifyOutputModules(outputEvent, rawEvent);
            });
            break;
          case "user-presenter-unassigned":
            UserMapping.get().updateWithField(
              'internalUserID',
              outputEvent.data.attributes.user["internal-user-id"], {
                user: {
                  presenter: false,
                },
              }
            ).catch((error) => {
              Logger.error('error updating user mapping', error);
            }).finally(() =>  {
              this._notifyOutputModules(outputEvent, rawEvent);
            });
            break;
          case "meeting-screenshare-started":
            UserMapping.get().updateWithField(
              'internalUserID',
              outputEvent.data.attributes.user["internal-user-id"], {
                user: {
                  screenshare: true,
                },
              }
            ).catch((error) => {
              Logger.error('error updating user mapping', error);
            }).finally(() =>  {
              this._notifyOutputModules(outputEvent, rawEvent);
            });
            break;
          case "meeting-screenshare-stopped":
            UserMapping.get().updateWithField(
              'internalUserID',
              outputEvent.data.attributes.user["internal-user-id"], {
                user: {
                  screenshare: false,
                },
              }
            ).catch((error) => {
              Logger.error('error updating user mapping', error);
            }).finally(() =>  {
              this._notifyOutputModules(outputEvent, rawEvent);
            });
            break;
          case "user-emoji-changed":
            this._handleUserEmojiChangedEvent(outputEvent, rawEvent);
            break;
          case "meeting-ended":
            this._handleMeetingEndedEvent(outputEvent).finally(() => {
              this._notifyOutputModules(outputEvent, rawEvent);
            });
            break;
          default:
            this._notifyOutputModules(outputEvent, rawEvent);
        }
      }
    } catch (error) {
      Logger.error('error processing event', {
        error: error.stack,
        event,
      });
      this._exporter.increment(Metrics.METRIC_NAMES.EVENT_PROCESS_FAILURES);
    }
  }

  // Processes an event received from redis. Will get all hook URLs that
  // should receive this event and start the process to perform the callback.
  _notifyOutputModules(message, raw) {
    if (this.outputs == null || this.outputs.length === 0) {
      Logger.warn('no output modules registered');
      return;
    }

    Logger.info('notifying output modules', {
      event: message,
    });

    this.outputs.forEach((output) => {
      output.onEvent(message, raw).catch((error) => {
        Logger.error('error notifying output module', {
          module: output.name,
          error: error?.stack,
          errorMessage: error?.message,
          event: message,
          raw,
        });
        this._exporter.increment(Metrics.METRIC_NAMES.EVENT_DISPATCH_FAILURES, {
          outputEventId: message?.data?.id || 'unknown',
          module: output.name,
        });
      });
    });
  }
}
