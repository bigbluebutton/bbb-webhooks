/*
 *  [MODULE_TYPES.OUTPUT]: {
 *   load: 'function',
 *   unload: 'function',
 *   setContext: 'function',
 *   onEvent: 'function',
 * },
 */

export default class OutXAPI {
  static _defaultCollector () {
    throw new Error('Collector not set');
  }

  constructor (context, config = {}) {
    this.type = "out";
    this.config = config;
    this.setContext(context);
    this.loaded = false;
  }

  async load () {
    this.loaded = true;
  }

  async unload () {
    this.setCollector(OutXAPI._defaultCollector);
    this.loaded = false;
  }

  setContext (context) {
    this.context = context;
    this.logger = context.getLogger();

    return context;
  }

  async onEvent (event, raw) {
    if (!this.loaded) {
      throw new Error("OutXAPI not loaded");
    }

    this.logger.debug('OutXAPI.onEvent:', event);
  }
}
