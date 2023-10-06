import WebHooks from './web-hooks.js';
import API from './api/api.js';
import HookCompartment from '../../db/redis/hooks.js';

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
 * @property {WebHooks} webHooks - The Webhooks dispatcher.
 * @property {boolean} loaded - Whether the module is loaded or not.
 */
class OutWebHooks {
  /**
   * @type {string} - The module's API implementation.
   * @static
   */
  static type = "out";

  static _defaultCollector () {
    throw new Error('Collector not set');
  }

  /**
   * constructor.
   * @param {Context} context - The main application's context.
   * @param {object} config - The module's configuration object.
   */
  constructor (context, config = {}) {
    this.type = OutWebHooks.type;
    this.config = config;
    this.setContext(context);
    this.api = new API({
      permanentURLs: this.config.permanentURLs,
      secret: this.config.server.secret,
    });
    API.setStorage(HookCompartment);
    this.webHooks = new WebHooks(this.context, this.config);
    this.loaded = false;
  }

  /**
   * load - Loads the out-webhooks module by starting the API server,
   *        creating permanent hooks and resyncing the hooks DB.
   * @async
   * @returns {Promise<void>}
   */
  async load () {
    await this.api.start(this.config.api.port, this.config.api.bind);
    await this.api.createPermanents();

    this.loaded = true;
  }

  /**
   * unload - Unloads the out-webhooks module by stopping the API server,
   *          and re-setting the collector to the default one.
   * @async
   * @returns {Promise<void>}
   */
  async unload () {
    if (this.webHooks) {
      this.webHooks = null;
    }

    this.setCollector(OutWebHooks._defaultCollector);
    this.loaded = false;
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
    if (!this.loaded || !this.webHooks) {
      throw new Error("OutWebHooks not loaded");
    }

    return this.webHooks.onEvent(event, raw);
  }
}

export default OutWebHooks;
