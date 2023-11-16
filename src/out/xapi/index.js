import XAPI from './xapi.js';
import { meetingCompartment, userCompartment, pollCompartment } from './compartment.js';
import { createClient } from 'redis';
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

  static _defaultCollector() {
    throw new Error('Collector not set');
  }

  constructor(context, config = {}) {
    this.type = OutXAPI.type;
    this.config = config;
    this.setContext(context);
    this.loaded = false;
  }

  _validateConfig() {
    if (this.config == null) {
      throw new Error("config not set");
    }

    // TODO

    return true;
  }

  _onRedisError(error) {
    this.logger.error("Redis client failure", error);
  }

  async load() {
    if (this._validateConfig()) {
      const { url, password, host, port } = this.config.redis || this.config;
      const redisUrl = url || `redis://${password ? `:${password}@` : ''}${host}:${port}`;
      this.redisClient = createClient({
        url: redisUrl,
      });
      this.redisClient.on('error', this._onRedisError.bind(this));
      this.redisClient.on('ready', () => this.logger.info('Redis client is ready'));

      await this.redisClient.connect();

      this.meetingStorage = new meetingCompartment(
        this.redisClient,
        this.config.redis.keys.meetingPrefix,
        this.config.redis.keys.meetings
      );

      this.userStorage = new userCompartment(
        this.redisClient,
        this.config.redis.keys.userPrefix,
        this.config.redis.keys.users
      );

      this.pollStorage = new pollCompartment(
        this.redisClient,
        this.config.redis.keys.pollPrefix,
        this.config.redis.keys.polls
      );

      this.xAPI = new XAPI(this.context, this.config, this.meetingStorage, this.userStorage, this.pollStorage);
    }
    this.loaded = true;
  }

  async unload() {
    if (this.redisClient != null) {
      await this.redisClient.disconnect();
      this.redisClient = null;
    }

    this.setCollector(OutXAPI._defaultCollector);
    this.loaded = false;
  }

  setContext(context) {
    this.context = context;
    this.logger = context.getLogger();

    return context;
  }

  async onEvent(event, raw) {
    if (!this.loaded) {
      throw new Error("OutXAPI not loaded");
    }

    return this.xAPI.onEvent(event, raw);
  }
}
