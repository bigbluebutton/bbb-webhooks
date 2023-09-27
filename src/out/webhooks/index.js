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

export default class OutWebHooks {
  static type = "out";

  static _defaultCollector () {
    throw new Error('Collector not set');
  }

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

  async load () {
    await this.webHooks.start(),
    await this.api.start(this.config.api.port, this.config.api.bind);
    await this.api.createPermanents();

    this.loaded = true;
  }

  async unload () {
    if (this.webHooks) {
      this.webHooks = null;
    }

    this.setCollector(OutWebHooks._defaultCollector);
    this.loaded = false;
  }

  setContext (context) {
    this.context = context;
    this.logger = context.getLogger();

    return context;
  }

  async onEvent (event, raw) {
    if (!this.loaded || !this.webHooks) {
      throw new Error("OutWebHooks not loaded");
    }

    return this.webHooks.onEvent(event, raw);
  }
}
