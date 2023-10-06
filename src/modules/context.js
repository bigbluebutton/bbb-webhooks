import { newLogger } from '../common/logger.js';
import config from 'config';
import { StorageCompartmentKV, StorageItem } from '../db/redis/base-storage.js';

/**
 * Context.
 * @class
 * @classdesc Context class containing utility functions and objects for submodules
 *            of the application.
 * @property {string} name - Name of the context.
 * @property {object} configuration - Configuration object.
 * @property {Map} _loggers - Map of loggers.
 */
class Context {
  /**
   * constructor.
   * @param {object} configuration - Context configuration data
   * @param {string} configuration.name - Submodule name
   * @param {object} configuration.logger - Logger object
   * @param {object} configuration.config - Submodule-specific configuration
   * @param {object} utils - Utility functions and objects
   * @param {MetricsExporter} utils.exporter - Metrics exporter
   */
  constructor(configuration, utils = {}) {
    this.name = configuration.name;
    this.configuration = config.util.cloneDeep(configuration);
    this.utils = utils;
    this._loggers = new Map();
  }

  /**
   * getLogger - Get a new logger with the given label and append it to the
   *             context's logger map.
   * @param {string} label - Label for the logger
   * @returns {BbbWebhooksLogger} - Logger object
   */
  getLogger(label = this.name) {
    if (!this._loggers.has(label)) {
      this._loggers.set(label, newLogger(label));
    }

    return this._loggers.get(label);
  }

  /**
   * destroy - Destroy the context.
   * @public
   * @returns {void}
   */
  destroy () {
    this._loggers.clear();
  }

  /**
   * keyValueCompartmentConstructor - Return a key-value compartment util class.
   * @returns {StorageCompartmentKV} - StorageCompartmentKV class
   * @public
   */
  keyValueCompartmentConstructor () {
    return StorageCompartmentKV;
  }

  /**
   * keyValueItemConstructor - Return a key-value item util class.
   * @returns {StorageItem} - StorageItem class
   * @public
   */
  keyValueItemConstructor () {
    return StorageItem;
  }

  /**
   * keyValueStorageFactory - Return a key-value storage instance
   * @param {string} prefix - Prefix for the storage compartment (namespace)
   * @param {string} setId - Redis SET ID for the storage compartment
   * @param {object} options - Options object
   * @param {StorageItem} options.itemClass - Storage item class
   * @param {string} options.aliasField - Item field to use as index (alias)
   * @returns {StorageCompartmentKV} - StorageCompartmentKV instance
   */
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

export default Context;
