import CallbackEmitter from './callback-emitter.js';
import HookCompartment from '../../db/redis/hooks.js';
import { METRIC_NAMES } from './metrics.js';

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
   * @param {object} options - Options.
   * @param {MetricsExporter} options.exporter - The exporter.
   * @param {Array} options.permanentURLs - An array of permanent webhook URLs to be registered.
   */
  constructor(context, config, {
    exporter = {},
    permanentURLs = [],
  } = {}) {
    this.context = context;
    this.logger = context.getLogger();
    this.config = config;

    this._exporter = exporter;
    this._permanentURLs = permanentURLs;
  }

  /**
   * _processRaw - Dispatch raw events to hooks that expect raw data.
   * @param {object} hook - The hook to which the event should be dispatched
   * @param {object} rawEvent - A raw event to be dispatched.
   * @returns {Promise} - A promise that resolves when all hooks have been notified.
   * @private
   */
  _processRaw(hook, rawEvent) {
    if (hook == null || !hook?.payload?.getRaw) return Promise.resolve();

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
   * _isHookPermanent - Check if a hook is permanent.
   * @param {string} callbackURL - The callback URL of the hook.
   * @returns {boolean} - Whether the hook is permanent or not.
   * @private
   */
  _isHookPermanent(callbackURL) {
    return this._permanentURLs.some(obj => {
      return obj.url === callbackURL
    });
  }

  /**
   * _shouldIgnoreEvent - Check if an event should be ignored according to
   *                      the includeEvents/excludeEvents configurations.
   * @param {object} event - The event to be checked.
   * @returns {boolean} - Whether the event should be ignored or not.
   * @private
   */
  _shouldIgnoreEvent(event) {
    const eventId = event?.data?.id;
    const filterIn = this.config.includeEvents || [];
    const filterOut = this.config.excludeEvents || [];

    if (filterIn.length > 0 && !filterIn.includes(eventId)) {
      this.logger.debug('event not included in the list of events to be sent', { eventId });
      return true;
    }

    if (filterOut.length > 0 && filterOut.includes(eventId)) {
      this.logger.debug('event included in the list of events to be ignored', { eventId });
      return true;
    }

    return false;
  }

  /**
   * createPermanentHooks - Create permanent hooks.
   * @returns {Promise} - A promise that resolves when all permanent hooks have been created.
   * @public
   * @async
   */
  async createPermanentHooks() {
    for (let i = 0; i < this._permanentURLs.length; i++) {
      try {
        const { url: callbackURL, getRaw } = this._permanentURLs[i];
        const { hook, duplicated } = await HookCompartment.get().addSubscription({
          callbackURL,
          permanent: this._isHookPermanent(callbackURL),
          getRaw,
        });

        if (duplicated) {
          this.logger.info(`permanent hook already set ${hook.id}`, { hook: hook.payload });
        } else if (hook != null) {
          this.logger.info('permanent hook created successfully');
        } else {
          this.logger.error('error creating permanent hook');
        }
      } catch (error) {
        this.logger.error(`error creating permanent hook ${error}`);
      }
    }
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
      const mappedEventId = event?.data?.id;
      const eventId = mappedEventId
        || event?.envelope?.name
        || 'unknownEvent';

      // CHeck if the event is in the list of events to be sent (if list was specified)
      if (hook.payload.eventID != null
        && (mappedEventId == null
          || (!hook.payload.eventID.some((ev) => ev == mappedEventId.toLowerCase())))
      ) {
        this.logger.info(`${hook.payload.callbackURL} skipping event because not in event list`, { eventID: eventId });
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
          checksumAlgorithm: this.config.hookChecksumAlgorithm,
          logger: this.logger,
        }
      );

      emitter.start();
      emitter.on(CallbackEmitter.EVENTS.SUCCESS, () => {
        this.logger.info(`successfully dispatched to ${hook.payload.callbackURL}`);
        emitter.stop();
        this._exporter.agent.increment(METRIC_NAMES.PROCESSED_EVENTS, {
          callbackURL: hook.payload.callbackURL,
          eventId,
        });
        return resolve();
      });

      emitter.on(CallbackEmitter.EVENTS.FAILURE, (error) => {
        this._exporter.agent.increment(METRIC_NAMES.HOOK_FAILURES, {
          callbackURL: hook.payload.callbackURL,
          reason: error.code || error.name || 'unknown',
          eventId,
        });
      });

      emitter.once(CallbackEmitter.EVENTS.STOPPED, () => {
        this.logger.warn(`too many failed attempts to perform a callback call, removing the hook for: ${hook.payload.callbackURL}`);
        emitter.stop();
        this._exporter.agent.increment(METRIC_NAMES.HOOK_FAILURES, {
          callbackURL: hook.payload.callbackURL,
          reason: 'too many failed attempts',
          eventId,
        });
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
    if (this._shouldIgnoreEvent(event)) return Promise.resolve();

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
          this.logger.error('failed to enqueue', {
            calbackURL: hook.payload.callbackURL, error: error.stack
          });
        });
      } else {
        return this._processRaw(hook, raw);
      }
    }));
  }
}
export default WebHooks;
