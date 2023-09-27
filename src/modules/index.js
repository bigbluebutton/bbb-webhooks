'use strict';

import config from 'config';
import { newLogger } from '../common/logger.js';
import ModuleWrapper from './module-wrapper.js';
import Context from './context.js';
import {
  MODULE_TYPES,
  validateModulesConf,
  validateModuleConf
} from './definitions.js';

const UNEXPECTED_TERMINATION_SIGNALS = ['SIGABRT', 'SIGBUS', 'SIGSEGV', 'SIGILL'];
const BASE_CONFIGURATION = {
  server: {
    domain: config.get('bbb.serverDomain'),
    secret: config.get('bbb.sharedSecret'),
    auth2_0: config.get('bbb.auth2_0'),
  },
  redis: {
    host: config.get('redis.host'),
    port: config.get('redis.port'),
    password: config.has('redis.password') ? config.get('redis.password') : undefined,
  },
}

export default class ModuleManager {
  static moduleTypes = MODULE_TYPES;

  static flattenModulesConfig(config) {
    // A configuration entry can either be an object (single module) or an array
    // (multiple modules of different types, eg input and output)
    // Need to flatten those into a single array of [name, description] tuples
    // so we can sort them by priority
    return Object.entries(config).flatMap(([name, description]) => {
      if (Array.isArray(description)) {
        return description.map((d) => [name, d]);
      } else {
        return [[name, description]];
      }
    });
  }

  constructor(modulesConfig) {
    this.modulesConfig = ModuleManager.flattenModulesConfig(modulesConfig);
    this.modules = {};
    validateModulesConf(this.modulesConfig);
    this.logger = newLogger('module-manager');
  }

    _buildContext(configuration) {
    configuration.config = { ...BASE_CONFIGURATION, ...configuration.config };
    return new Context(configuration);
  }

  getModulesByType(type) {
    return Object.values(this.modules).filter((module) => module.type === type);
  }

  getInputModules() {
    return this.getModulesByType(ModuleManager.moduleTypes.in);
  }

  getOutputModules() {
    return this.getModulesByType(ModuleManager.moduleTypes.out);
  }

  getDBModules() {
    return this.getModulesByType(ModuleManager.moduleTypes.db);
  }

  _sortModulesByPriority(a, b) {
    // Sort modules by priority: db modules first, then input modules, then output modules
    const aD = a[1]
    const bD = b[1]

    if (aD.type === ModuleManager.moduleTypes.db && bD.type !== ModuleManager.moduleTypes.db) {
      return -1;
    } else if (aD.type !== ModuleManager.moduleTypes.db && bD.type === ModuleManager.moduleTypes.db) {
      return 1;
    } else if (aD.type === ModuleManager.moduleTypes.in && bD.type === ModuleManager.moduleTypes.out) {
      return -1;
    } else if (aD.type === ModuleManager.moduleTypes.out && bD.type === ModuleManager.moduleTypes.in) {
      return 1;
    } else {
      return 0;
    }
  }

  async load() {
    const sortedModules = this.modulesConfig.sort(this._sortModulesByPriority);

    for (const [name, description] of sortedModules) {
      try {
        const fullConfiguration = { name, ...description };
        validateModuleConf(fullConfiguration);
        const context = this._buildContext(fullConfiguration);
        const module = new ModuleWrapper(name, description.type, context, context.configuration.config);
        await module.load()
        this.modules[module.id] = module;
        this.logger.info(`module ${name} loaded`);
      } catch (error) {
        this.logger.error(`failed to load module ${name}`, error);
      }
    }

    process.on('SIGTERM', async () => {
      await this.stopModules();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      await this.stopModules();
      process.exit(0);
    });

    process.on('uncaughtException', async (error) => {
      this.logger.error("CRITICAL: uncaught exception, shutdown", { error: error.stack });
      await this.stopModules();
      if (process.env.NODE_ENV !== 'production') process.exit(1);
    });

    // Added this listener to identify unhandled promises, but we should start making
    // sense of those as we find them
    process.on('unhandledRejection', (reason) => {
      this.logger.error("CRITICAL: Unhandled promise rejection", { reason: reason.toString(), stack: reason.stack });
      if (process.env.NODE_ENV !== 'production') process.exit(1);
    });

    return {
      inputModules: this.getInputModules(),
      outputModules: this.getOutputModules(),
      dbModules: this.getDBModules(),
    };
  }

  trackModuleShutdown (proc) {
    // Tries to restart process on unsucessful exit
    proc.process.on('exit', (code, signal) => {
      const shouldRestart = this.runningState === 'RUNNING'
        && (code === 1 || UNEXPECTED_TERMINATION_SIGNALS.includes(signal));
      if (shouldRestart) {
        this.logger.error("received exit event from child process, restarting it",
          { code, signal, pid: proc.process.pid, process: proc.path });
        proc.restart();
      } else {
        this.logger.warn("received final exit event from child process, process shutdown",
          { code, signal, pid: proc.process.pid, process: proc.path });
        proc.stop();
      }
    });
  }

  async stopModules () {
    this.runningState = "STOPPING";

    for (var proc in this.modules) {
      if (Object.prototype.hasOwnProperty.call(this.modules, proc)) {
        let procObj = this.modules[proc];
        if (typeof procObj.stop === 'function') procObj.stop()
      }
    }

    this.runningState = "STOPPED";
  }
}
