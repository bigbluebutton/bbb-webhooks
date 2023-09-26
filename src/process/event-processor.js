import IDMapping from '../db/redis/id-mapping.js';
import { newLogger } from '../common/logger.js';
import WebhooksEvent from '../process/event.js';
import UserMapping from '../db/redis/user-mapping.js';
import Utils from '../common/utils.js';

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

  processInputEvent(event) {

    try {
      const rawEvent = this._parseEvent(event);
      const eventInstance = new WebhooksEvent(rawEvent);
      const outputEvent = eventInstance.outputEvent;

      if (!Utils.isEmpty(outputEvent)) {
        Logger.debug('raw event succesfully parsed', { rawEvent });
        const intId = outputEvent.data.attributes.meeting["internal-meeting-id"];
        IDMapping.get().reportActivity(intId);

        // First treat meeting events to add/remove ID mappings
        switch (outputEvent.data.id) {
          case "meeting-created":
            IDMapping.get().addOrUpdateMapping(intId,
              outputEvent.data.attributes.meeting["external-meeting-id"]
            ).catch((error) => {
              Logger.error(`error adding mapping: ${error}`, {
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
              intId,
              outputEvent.data.attributes.user
            ).catch((error) => {
              Logger.error(`error adding mapping: ${error}`, {
                error: error.stack,
                event,
              })
            }).finally(() => {
              this._notifyOutputModules(outputEvent, rawEvent);
            });
            break;
          case "user-left":
            UserMapping.get().removeMapping(outputEvent.data.attributes.user["internal-user-id"], () => {
              this._notifyOutputModules(outputEvent, rawEvent);
            });
            break;
          case "meeting-ended":
            IDMapping.get().removeMapping(intId, () => {
              this._notifyOutputModules(outputEvent, rawEvent);
            });
            break;
          default:
            this._notifyOutputModules(outputEvent, rawEvent);
        }
      }
    } catch (error) {
      Logger.error(`error processing event: ${error}`, {
        error: error.stack,
        event,
      });
    }
  }

  // Processes an event received from redis. Will get all hook URLs that
  // should receive this event and start the process to perform the callback.
  _notifyOutputModules(message, raw) {
    if (this.outputs == null || this.outputs.length === 0) {
      Logger.warn('no output modules registered');
      return;
    }

    this.outputs.forEach((output) => {
      output.onEvent(message, raw);
    });
  }
}
