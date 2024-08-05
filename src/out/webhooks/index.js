import WebHooks from './web-hooks.js';
import API from './api/api.js';
import HookCompartment from '../../db/redis/hooks.js';
import { buildMetrics, METRIC_NAMES } from './metrics.js';

/*
 *  [MODULE_TYPES.OUTPUT]: {
 *   load: 'function',
 *   unload: 'function',
 *   setContext: 'function',
 *   onEvent: 'function',
 * },
 */

/**
 * OutWebHooks - Entrypoint for the Webhooks output module.
 * @class
 * @classdesc Entrypoint for the Webhooks output module - relays incoming
 *            events to the internal Webhooks dispatcher, exposes
 *            the module API implementation for the main application to use
 *            as well as manages the Webhooks API server.
 * @property {Context} context - This module's context as provided by the main application.
 * @property {BbbWebhooksLogger} logger - The logger.
 * @property {object} config - This module's configuration object.
 * @property {API} api - The Webhooks API server.
 * @property {WebHooks} webhooks - The Webhooks dispatcher.
 * @property {boolean} loaded - Whether the module is loaded or not.
 */
class OutWebHooks {
  /**
   * @type {string} - The module's API implementation.
   * @static
   */
  static type = "out";

  /**
   * constructor.
   * @param {Context} context - The main application's context.
   * @param {object} config - The module's configuration object.
   */
  constructor (context, config = {}) {
    this.type = OutWebHooks.type;
    this.config = config;
    this.setContext(context);
    this.loaded = false;
    this._exporter = this.context.utils.exporter;

    this._bootstrapExporter();
    this.webhooks = new WebHooks(
      this.context,
      this.config, {
        exporter: this._exporter,
        permanentURLs: this.config.permanentURLs,
      },
    );
    this.api = new API({
      secret: this.config.server.secret,
      exporter: this._exporter,
      permanentURLs: this.config.permanentURLs,
      supportedChecksumAlgorithms: this.config.api.supportedChecksumAlgorithms,
    });
    API.setStorage(HookCompartment);
  }

  /**
   * _collectRegisteredHooks - Collects registered hooks data for the Prometheus
   *                           exporter.
   * @private
   */
  _collectRegisteredHooks () {
    try {
      const hooks = HookCompartment.get().getAll();
      this._exporter.agent.reset([METRIC_NAMES.REGISTERED_HOOKS]);
      hooks.forEach(hook => {
        this._exporter.agent.increment(METRIC_NAMES.REGISTERED_HOOKS, {
          callbackURL: hook.payload.callbackURL,
          permanent: hook.payload.permanent,
          getRaw: hook.payload.getRaw,
          // FIXME enabled is hardecoded until enabled/disabled logic is implemented
          enabled: true,
        });
      });
    } catch (error) {
      this.logger.error('Prometheus failed to collect registered hooks', { error: error.stack });
    }
  }

  /**
   * _bootstrapExporter - Injects the module's metrics into the Prometheus
   *                     exporter.
   *                     This method is called in the constructor.
   * @private
   */
  _bootstrapExporter () {
    this._exporter.injectMetrics(buildMetrics(this._exporter));
    this._exporter.agent.setCollector(
      METRIC_NAMES.REGISTERED_HOOKS,
      this._collectRegisteredHooks.bind(this)
    );
  }

  /**
   * load - Loads the out-webhooks module by starting the API server,
   *        creating permanent hooks and resyncing the hooks DB.
   * @async
   * @returns {Promise<void>}
   */
  async load () {
    await this.api.start(this.config.api.port, this.config.api.bind);
    await this.webhooks.createPermanentHooks();

    this.loaded = true;
  }

  /**
   * unload - Unloads the out-webhooks module by stopping the API server
   * @async
   * @returns {Promise<void>}
   */
  async unload () {
    if (this.webhooks) {
      this.webhooks = null;
    }

    await this.api.stop();
    this.loaded = false;
    this.logger.info('OutWebHooks unloaded');
  }

  /**
   * setContext - Sets the applicatino context for this module.
   *              and assigns a logger instance to it.
   * @param {Context} context - The main application's context.
   * @returns {Context} The assigned context.
   */
  setContext (context) {
    this.context = context;
    this.logger = context.getLogger();

    return context;
  }

  /**
   * onEvent - Relays an incoming event to the Webhooks dispatcher.
   * @see {@link WebHooks#onEvent}
   * @async
   * @param {object} event - The mapped event object.
   * @param {object } raw - The raw event object.
   * @returns {Promise<void>}
   */
  async onEvent (event, raw) {
    if (!this.loaded || !this.webhooks) {
      throw new Error("OutWebHooks not loaded");
    }

    return this.webhooks.onEvent(event, raw);
  }
}

export default OutWebHooks;
