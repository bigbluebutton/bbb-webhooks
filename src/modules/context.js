import { newLogger } from '../common/logger.js';
import config from 'config';
import { StorageCompartmentKV, StorageItem } from '../db/redis/base-storage.js';

export default class Context {
  constructor(configuration) {
    this.name = configuration.name;
    this.configuration = config.util.cloneDeep(configuration);
    this._loggers = new Map();
  }

  getLogger(label = this.name) {
    if (!this._loggers.has(label)) {
      this._loggers.set(label, newLogger(label));
    }

    return this._loggers.get(label);
  }

  destroy () {
    this._loggers.clear();
  }

  keyValueCompartmentConstructor () {
    return StorageCompartmentKV;
  }

  keyValueItemConstructor () {
    return StorageItem;
  }

  keyValueStorageFactory (prefix, setId, {
    itemClass = StorageItem,
    aliasField,
  } = {}) {
    return new StorageCompartmentKV(this.redisClient, prefix, setId, {
      itemClass,
      aliasField,
    });
  }
}
