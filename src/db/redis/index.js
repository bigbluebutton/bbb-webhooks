import redis from 'redis';
import config from 'config';
import HookCompartment from './hooks.js';
import IDMappingC from './id-mapping.js';
import UserMappingC from './user-mapping.js';

/*
 *
 * [MODULE_TYPES.db]: {
 *  load: 'function',
 *  unload: 'function',
 *  setContext: 'function',
 *  save: 'function',
 *  read: 'function',
 *  remove: 'function',
 *  clear: 'function',
 *  }
 *
 */

export default class RedisDB {
  constructor (context, config = {}) {
    this.name = 'db-redis';
    this.type = 'db';
    this.context = this.setContext(context);
    this.config = config;
    this.logger = context.getLogger(this.name);
    this.loaded = false;

    this._redisClient = null;
  }

  _onRedisError(error) {
    this.logger.error("Redis error: ", { error });
  }

  async load() {
    const { host, port, password } = this.config;

    this._redisClient = redis.createClient({
      host,
      port,
      password,
    });
    this._redisClient.on("error", this._onRedisError.bind(this));
    await this._redisClient.connect();
    await IDMappingC.init(this._redisClient);
    await UserMappingC.init(this._redisClient);
    await HookCompartment.init(this._redisClient,
      config.get('redis.keys.hookPrefix'),
      config.get('redis.keys.hooks'),
    );
  }

  async unload() {
    if (this._redisClient) {
      await this._redisClient.disconnect();
      this._redisClient = null;
    }

    this.loaded = false;
  }

  setContext(context) {
    this.context = context;
    this.logger = context.getLogger(this.name);
  }

  async save(key, value) {
    if (!this.loaded) {
      throw new Error('DB not loaded');
    }

    try {
      await this._redisClient.set(key, JSON.stringify(value));
      return true;
    } catch (error) {
      this.logger.error(error);
      return false;
    }
  }

  async read(key) {
    if (!this.loaded) {
      throw new Error('DB not loaded');
    }

    try {
      const value = await this._redisClient.get(key);
      return JSON.parse(value);
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async remove(key) {
    if (!this.loaded) {
      throw new Error('DB not loaded');
    }

    try {
      await this._redisClient.del(key);
      return true;
    } catch (error) {
      this.logger.error(error);
      return false;
    }
  }

  async clear() {
    if (!this.loaded) {
      throw new Error('DB not loaded');
    }

    try {
      await this._redisClient.flushall();
      return true;
    } catch (error) {
      this.logger.error(error);
      return false;
    }
  }
}
