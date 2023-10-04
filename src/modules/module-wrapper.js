'use strict';

import EventEmitter from 'events';
import { newLogger } from '../common/logger.js';
import { MODULE_TYPES, validateModuleDefinition } from './definitions.js';
import { createQueue, getQueue, deleteQueue } from './queue.js';

//  [MODULE_TYPES.INPUT]: {
//    load: 'function',
//    setContext: 'function',
//    setCollector: 'function',
//  },
//  [MODULE_TYPES.OUTPUT]: {
//    load: 'function',
//    setContext: 'function',
//    onEvent: 'function',
//  },
//  [MODULE_TYPES.DB]: {
//    load: 'function',
//    setContext: 'function',
//    create: 'function',
//    read: 'function',
//    update: 'function',
//    delete: 'function',
//  },

/**
 * ModuleWrapper.
 * @augments {EventEmitter}
 * @class
 */
class ModuleWrapper extends EventEmitter {
  /**
   * _defaultCollector - Default event colletion function.
   * @static
   * @private
   * @throws {Error} - Error thrown if the default collector is called
   * @memberof ModuleWrapper
   */
  static _defaultCollector () {
    throw new Error('Collector not set');
  }

  /**
   * constructor.
   * @param {string} name - Module name
   * @param {string} type - Module type
   * @param {Context} context - Context object
   * @param {object} config - Module-specific configuration
   * @constructs ModuleWrapper
   * @augments {EventEmitter}
   */
  constructor (name, type, context, config = {}) {
    super();
    this.name = name;
    this.type = type;
    this.id = `${name}-${type}`;
    this.context = context;
    this.config = config;
    this.logger = newLogger('module-wrapper');
    this.logger.debug(`created module wrapper for ${name}`, { type, config });

    this._module = null;
    this._queue = null;
    this._worker = null;
  }

  set config(config) {
    if (config.queue == null) {
      config.queue = {
        enabled: false,
      };
    }

    // Configuration enrichment - extend with defaults if some specific things
    // are not set (eg redis host/port for queues)
    if (config.queue?.enabled) {
      if (!config.queue.host) {
        config.queue.host = config.redis.host;
      }

      if (!config.queue.port) {
        config.queue.port = config.redis.port;
      }

      if (!config.queue.password) {
        config.queue.password = config.redis.password;
      }
    }

    this._config = config;
  }

  get config() {
    return this._config;
  }

  set type(type) {
    if (this._module) {
      throw new Error(`module ${this.name} already loaded`);
    }

    this._type = type;
  }

  get type() {
    return this._module?.type || this._type;
  }

  /**
   * _getQueueId - Get the queue ID for the module.
   * @private
   * @returns {string} - Queue ID
   * @memberof ModuleWrapper
   */
  _getQueueId() {
    return this.config.queue.id || `${this.name}-out-queue`;
  }

  /**
   * _setupOutboundQueues - Setup outbound queues for the module only if the
   *                        module is an output module and the queue is enabled.
   * @private
   * @memberof ModuleWrapper
   */
  _setupOutboundQueues() {
    if (this.type !== MODULE_TYPES.out) return;

    if (this.config.queue.enabled) {
      this.logger.debug(`setting up outbound queues for module ${this.name}`, this.config.queue);
      const queueId = this._getQueueId();
      const processor = async (job) => {
        if (job.name !== 'event') {
          this.logger.error(`job ${job.name}:${job.id} is not an event`);
          return;
        }
        const { event, raw } = job.data;
        await this._onEvent(event, raw);
      };

      const { queue, worker } = createQueue(queueId, processor, {
        host: this.config.queue.host,
        port: this.config.queue.port,
        password: this.config.queue.password,
        concurrency: this.config.queue.concurrency || 1,
        limiter: this.config.queue.limiter || undefined,
      });

      this._queue = queue;
      this._worker = worker;
      this._worker.on('failed', (job, error) => {
        if (job.name !== 'event') {
          this.logger.error(`job ${job.name}:${job.id} failed`, error);
          this.emit('eventDispatchFailed', { event: job.data?.event, raw: job.data?.raw, error });
        }
      });
      this._worker.on('error', (error) => {
        this.logger.error(`worker for queue ${queueId} received error`, error);
      });
      this.logger.info(`created queue ${queueId} for module ${this.name}`, {
        queueId,
        queueConcurrency: this.config.queue.concurrency || 1,
      });
    }
  }

  /**
   * _bootstrap - Initialize the necessary data for the module's creation
   * @private
   * @returns {Promise} - Promise object
   * @memberof ModuleWrapper
   */
  _bootstrap() {
    if (!this._module) {
      throw new Error(`module ${this.name} is not loaded`);
    }

    switch (this.type) {
      case MODULE_TYPES.in:
        this.setContext(this.context);
        this.setCollector(this.context.collector || ModuleWrapper._defaultCollector);
        return Promise.resolve();
      case MODULE_TYPES.out:
        this.setContext(this.context);
        this._setupOutboundQueues();
        return Promise.resolve();
      case MODULE_TYPES.db:
        this.setContext(this.context);
        return Promise.resolve();
      default:
        throw new Error(`module ${this.name} has an invalid type`);
    }
  }

  /**
   * setCollector - Set the event collector function for input modules.
   *                This function MUST be called by the module when it wants
   *                to send an event to the event processor.
   * @param {Function} collector - Event collector function
   * @throws {Error} - Error thrown if the module does not support setCollector
   * @memberof ModuleWrapper
   */
  setCollector(collector) {
    if (typeof collector !== 'function') {
      throw new Error(`collector must be a function`);
    }

    if (this._module?.setCollector) {
      this._module.setCollector(collector);
    } else {
      throw new Error(`module ${this.name} does not support setCollector`);
    }
  }

  /**
   * load - Load the module.
   * @returns {Promise} - Promise object that resolves to the module wrapper
   * @async
   * @memberof ModuleWrapper
   * @throws {Error} - Error thrown if the module cannot be loaded
   */
  async load() {
    // Dynamically import the module provided via this.name
    // and instantiate it with the context and config provided
    this._module = await import(this.name).then((module) => {
      // Check if the module is an array of modules
      // If so, select just the one that matches the provided type (this.type)
      if (Array.isArray(module.default)) {
        module = module.default.find((m) => m.type === this.type);
        if (!module) throw new Error(`module ${this.name} does not exist or is badly defined`);
        return new module(this.context, this.config);
      }

      return new module.default(this.context, this.config);
    }).catch((error) => {
      this.logger.error(`error loading module ${this.name}`, error);
      throw error;
    });

    // Validate the module
    if (!validateModuleDefinition(this._module)) {
      throw new Error(`module ${this.name} is not valid`);
    }

    await this._bootstrap();
    // Call the module's load() method
    await this._module.load();

    this.logger.info(`module ${this.name} loaded`);

    return this;
  }

  /**
   * unload - Unload the module.
   * @returns {Promise} - Promise object
   * @async
   * @memberof ModuleWrapper
   */
  unload() {
    this.removeAllListeners();
    this._worker = null;
    this._queue = null;
    deleteQueue(this._getQueueId());

    if (this._module?.unload) {
      return this._module.unload();
    }

    return Promise.resolve();
  }

  /**
   * setContext - Set the context for the module.
   * @param {Context} context - Context object
   * @throws {Error} - Error thrown if the module does not support setContext
   * @memberof ModuleWrapper
   * @returns {Promise} - Promise object
   */
  setContext(context) {
    if (this._module?.setContext) {
      return this._module.setContext(context);
    }

    throw new Error("Not implemented");
  }

  _onEvent(event, raw) {
    if (this._module?.onEvent) {
      return this._module.onEvent(event, raw);
    }

    throw new Error("Not implemented");
  }

  /**
   * _onEvent - Event handler middleware for output modules.
   *            Catches events dispatched by the event processor and
   *            forwards them to the module's onEvent() method.
   * @param {object} event - Event object in the format of a WebhooksEvent object
   * @param {object} raw - Raw event object
   * @memberof ModuleWrapper
   * @returns {Promise} - Promise object
   * @throws {Error} - Error thrown if the module does not support onEvent
   */
  async onEvent(event, raw) {
    if (this.type !== MODULE_TYPES.out) {
      throw new Error(`module ${this.name} is not an output module`);
    }

    if (this.config.queue.enabled) {
      const queueId = this._getQueueId();
      const { queue } = getQueue(queueId);
      await queue.add('event', { event, raw });
    } else {
      await this._onEvent(event, raw);
    }
  }
}

export default ModuleWrapper;
