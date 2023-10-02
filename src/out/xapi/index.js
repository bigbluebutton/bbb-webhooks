import XAPI from './xapi.js';
import XAPICompartment from './compartment.js';
import redis from 'redis';
import config from 'config';
/*
 *  [MODULE_TYPES.OUTPUT]: {
 *   load: 'function',
 *   unload: 'function',
 *   setContext: 'function',
 *   onEvent: 'function',
 * },
 */

export default class OutXAPI {
  static type = "out";

  static _defaultCollector () {
    throw new Error('Collector not set');
  }

  constructor (context, config = {}) {
    this.type = OutXAPI.type;
    this.config = config;
    this.setContext(context);
    this.loaded = false;
  }

  _validateConfig () {
    if (this.config == null) {
      throw new Error("config not set");
    }

    // TODO

    return true;
  }

  async load () {
    if (this._validateConfig()) {
      this.redisClient = redis.createClient({
        host: config.get('redis.host'),
        port: config.get('redis.port'),
        password: config.has('redis.password') ? config.get('redis.password') : undefined,
      });

      await this.redisClient.connect();

      this.logger.debug('OutXAPI.onEvent:', this.config );

      this.meetingStorage = new XAPICompartment(
        this.redisClient,
        this.config.redis.keys.meetingPrefix,
        this.config.redis.keys.meetings
      );

      this.xAPI = new XAPI(this.context, this.config, this.meetingStorage);
    }
    this.loaded = true;
  }

  async unload () {
    if (this.redisClient != null) {
      await this.redisClient.disconnect();
      this.redisClient = null;
    }

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

    return this.xAPI.onEvent(event, raw);
  }
}
