import config from 'config';
import CallbackEmitter from './callback-emitter.js';
import HookCompartment from '../../db/redis/hooks.js';

// Web hooks will listen for events on redis coming from BigBlueButton and
// perform HTTP calls with them to all registered hooks.
export default class WebHooks {
  constructor(context, config) {
    this.context = context;
    this.logger = context.getLogger();
    this.config = config;
  }

  start() {
    return Promise.resolve();
  }

  _processRaw(devent) {
    let meetingID;
    let hooks = HookCompartment.get().allGlobalSync();

    // Add hooks for the specific meeting that expect raw data
    // Get meetingId for a raw message that was previously mapped by another webhook application or if it's straight from redis
    meetingID = this._extractIntMeetingID(event);

    if (meetingID != null) {
      const eMeetingID = this._extractExternalMeetingID(event);
      hooks = hooks.concat(HookCompartment.get().findByExternalMeeting(eMeetingID));
      // Notify the hooks that expect raw data
      return Promise.all(hooks.map((hook) => {
        if (hook.getRaw) {
          this.logger.info('enqueueing a raw event in the hook', { callbackURL: hook.payload.callbackURL });
          return this.dispatch(event, hook).catch((error) => {
            this.logger.error('failed to enqueue', { calbackURL: hook.callbackURL, error: error.stack });
          });
        }

        return Promise.resolve();
      }));
    }

    return Promise.resolve();
  }

  _extractIntMeetingID(message) {
    // Webhooks events
    return message?.data?.attributes?.meeting["internal-meeting-id"]
      // Raw messages from BBB
      || message?.envelope?.routing?.meetingId
      || message?.header?.body?.meetingId
      || message?.core?.body?.props?.meetingProp?.intId
      || message?.core?.body?.meetingId;
  }

  _extractExternalMeetingID(message) {
    return message?.data?.attributes?.meeting["external-meeting-id"];
  }

  dispatch(event, hook) {
    return new Promise((resolve, reject) => {
    if (event == null) return;

      if (hook.payload.eventID != null
        && (event == null
          || event.data == null
          || event.data.id == null
          || (!hook.payload.eventID.some((ev) => ev == event.data.id.toLowerCase())))
      ) {
        Logger.info(`[Hook] ${hook.payload.callbackURL} skipping event from queue because not in event list for hook: ${JSON.stringify(event)}`);
        return ;
      }

      const emitter = new CallbackEmitter(
        hook.payload.callbackURL,
        event,
        hook.payload.permanent, {
          permanentIntervalReset: this.config.permanentIntervalReset,
          domain: this.config.domain,
          secret: this.config.secret,
          auth2_0: this.config.auth2_0,
          requestTimeout: this.config.requestTimeout,
          retryIntervals: this.config.retryIntervals,
        }
      );

      emitter.start();
      emitter.on("success", resolve);
      emitter.once("stopped", () => {
        this.logger.warn(`too many failed attempts to perform a callback call, removing the hook for: ${hook.payload.callbackURL}`);
        // TODO just disable
        return hook.destroy().then(resolve).catch(resolve);
      });
    });
  }

  onEvent(event, raw) {
    let hooks = HookCompartment.get().allGlobalSync();
    // filter the hooks that need to receive this event
    // add hooks that are registered for this specific meeting
    const meetingID = this._extractIntMeetingID(event);
    if (meetingID != null) {
      const eMeetingID = this._extractExternalMeetingID(event);
      hooks = hooks.concat(HookCompartment.get().findByExternalMeetingID(eMeetingID));
    }

    if (hooks == null || hooks.length === 0) {
      this.logger.info('no hooks registered for this event');
      return Promise.resolve();
    }

    return Promise.all(hooks.map((hook) => {
      if (hook == null) return Promise.resolve();
      if (!hook.getRaw) {
        this.logger.info('dispatching raw event in the hook', { callbackURL: hook.payload.callbackURL });
        return this.dispatch(event, hook).catch((error) => {
          this.logger.error('failed to enqueue', { calbackURL: hook.callbackURL, error: error.stack });
        });
      }

      return Promise.resolve();
    })).then(() => {;
      const sendRaw = hooks.some(hook => hook && hook.getRaw);
      if (sendRaw && config.get("hooks.getRaw")) return this._processRaw(raw);

      return Promise.resolve();
    });
  }
}
