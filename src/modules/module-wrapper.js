'use strict';

import { newLogger } from '../common/logger.js';
import { MODULE_TYPES, validateModuleDefinition } from './definitions.js';
import { createQueue, getQueue } from './queue.js';

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

export default class ModuleWrapper {
  static _defaultCollector () {
    throw new Error('Collector not set');
  }

  constructor (name, type, context, config = {}) {
    this.name = name;
    this.type = type;
    this.id = `${name}-${type}`;
    this.context = context;
    this.config = config;
    this.logger = newLogger('module-wrapper');
    this.logger.debug(`created module wrapper for ${name}`, { type, config });

    this._module = null;
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

  _setupOutboundQueues() {
    if (this.type !== MODULE_TYPES.out) return;

    if (this.config.queue.enabled) {
      this.logger.debug(`setting up outbound queues for module ${this.name}`, this.config.queue);
      const queueId = this.config.queue.id || `${this.name}-out-queue`;
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
      });

      this.logger.info(`created queue ${queueId} for module ${this.name}`, {
        queueId,
        queueConcurrency: this.config.queue.concurrency || 1,
      });
    }
  }

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

  unload() {
    if (this._module?.unload) {
      return this._module.unload();
    }

    return Promise.resolve();
  }

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

  async onEvent(event, raw) {
    if (this.type !== MODULE_TYPES.out) {
      throw new Error(`module ${this.name} is not an output module`);
    }

    if (this.config.queue.enabled) {
      const queueId = this.config.queue.id || `${this.name}-out-queue`;
      const { queue } = getQueue(queueId);
      const job = await queue.add('event', { event, raw });
    } else {
      return this._onEvent(event, raw);
    }
  }
}
