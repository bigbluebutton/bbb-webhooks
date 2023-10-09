import CallbackEmitter from './callback-emitter.js';
import HookCompartment from '../../db/redis/hooks.js';

/**
 * WebHooks.
 * @class
 * @classdesc Relays incoming events to registered webhook URLs.
 * @property {Context} context - This module's context as provided by the main application.
 * @property {BbbWebhooksLogger} logger - The logger.
 * @property {object} config - This module's configuration object.
 */
class WebHooks {
  /**
   * constructor.
   * @param {Context} context - This module's context as provided by the main application.
   * @param {object} config - This module's configuration object.
   */
  constructor(context, config) {
    this.context = context;
    this.logger = context.getLogger();
    this.config = config;
  }

  /**
   * _processRaw - Dispatch raw events to hooks that expect raw data.
   * @param {object} hook - The hook to which the event should be dispatched
   * @param {object} rawEvent - A raw event to be dispatched.
   * @returns {Promise} - A promise that resolves when all hooks have been notified.
   * @private
   */
  _processRaw(hook, rawEvent) {
    if (hook == null || !hook?.payload?.getRaw || !this.config.getRaw) return Promise.resolve();

    this.logger.info('dispatching raw event to hook', { callbackURL: hook.payload.callbackURL });

    return this.dispatch(rawEvent, hook).catch((error) => {
      this.logger.error('failed to enqueue', { calbackURL: hook.payload.callbackURL, error: error.stack });
    });
  }

  /**
   * _extractIntMeetingID - Extract the internal meeting ID from mapped or raw events.
   * @param {object} message - A mapped or raw event object.
   * @returns {string} - The internal meeting ID.
   * @private
   */
  _extractIntMeetingID(message) {
    // Webhooks events
    return message?.data?.attributes?.meeting["internal-meeting-id"]
      // Raw messages from BBB
      || message?.envelope?.routing?.meetingId
      || message?.header?.body?.meetingId
      || message?.core?.body?.props?.meetingProp?.intId
      || message?.core?.body?.meetingId;
  }

  /**
   * _extractExternalMeetingID - Extract the external meeting ID from a mapped event.
   * @param {object} message - A mapped event object.
   * @returns {string} - The external meeting ID.
   * @private
   */
  _extractExternalMeetingID(message) {
    return message?.data?.attributes?.meeting["external-meeting-id"];
  }

  /**
   * dispatch - Dispatch an event to the target hook.
   * @param {object} event - The event to be dispatched (raw or mapped)
   * @param {StorageItem} hook - The hook to which the event should be dispatched
   *                      (as a StorageItem object).
   *                      The event will *not* be dispatched if the hook is invalid,
   *                      or if the event is not in the list of events to be sent
   *                      for that hook.
   * @returns {Promise} - A promise that resolves when the event has been dispatched.
   * @public
   * @async
   */
  dispatch(event, hook) {
    return new Promise((resolve, reject) => {
      // Check for an invalid event - skip if that's the case
      if (event == null) return;
      // CHeck if the event is in the list of events to be sent (if list was specified)
      if (hook.payload.eventID != null
        && (event?.data?.id == null
          || (!hook.payload.eventID.some((ev) => ev == event.data.id.toLowerCase())))
      ) {
        this.logger.info(`${hook.payload.callbackURL} skipping event because not in event list`, { eventID: event.data.id });
        return;
      }

      const emitter = new CallbackEmitter(
        hook.payload.callbackURL,
        event,
        hook.payload.permanent,
        this.config.server.domain, {
          permanentIntervalReset: this.config.permanentIntervalReset,
          secret: this.config.server.secret,
          auth2_0: this.config.server.auth2_0,
          requestTimeout: this.config.requestTimeout,
          retryIntervals: this.config.retryIntervals,
        }
      );

      emitter.start();
      emitter.on(CallbackEmitter.EVENTS.SUCCESS, () => {
        this.logger.info(`successfully dispatched to ${hook.payload.callbackURL}`);
        emitter.stop();
        return resolve();
      });
      emitter.once(CallbackEmitter.EVENTS.STOPPED, () => {
        this.logger.warn(`too many failed attempts to perform a callback call, removing the hook for: ${hook.payload.callbackURL}`);
        emitter.stop();
        // TODO just disable
        return hook.destroy().then(resolve).catch(reject);
      });
    });
  }

  /**
   * onEvent - Handles incoming events received by the main application (relayed
   *           from this module's entrypoint, OutWebHooks).
   * @param {object} event - A mapped webhook event object.
   * @param {object} raw - A raw webhook event object.
   * @returns {Promise} - A promise that resolves when all hooks have been notified.
   * @public
   * @async
   */
  onEvent(event, raw) {
    const meetingID = this._extractIntMeetingID(event);
    let hooks = HookCompartment.get().getAllGlobalHooks();

    // filter the hooks that need to receive this event
    // add hooks that are registered for this specific meeting
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

      if (!hook.payload.getRaw) {
        this.logger.info('dispatching event to hook', { callbackURL: hook.payload.callbackURL });
        return this.dispatch(event, hook).catch((error) => {
          this.logger.error('failed to enqueue', { calbackURL: hook.payload.callbackURL, error: error.stack });
        });
      } else {
        return this._processRaw(hook, raw);
      }
    }));
  }
}
export default WebHooks;
