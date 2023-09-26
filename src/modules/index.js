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

  constructor(modulesConfig) {
    this.modulesConfig = modulesConfig;
    this.modules = {};
    validateModulesConf(modulesConfig);
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

  async load() {
    const loaders = Object.entries(this.modulesConfig).map(([name, description]) => {
      try {
        const fullConfiguration = { name, ...description };
        validateModuleConf(fullConfiguration);
        const context = this._buildContext(fullConfiguration);
        const module = new ModuleWrapper(name, description.type, context, context.configuration.config);
        return module.load().then(() => {
          this.modules[name] = module;
          this.logger.info(`module ${name} loaded`);
        }).catch((error) => {
          this.logger.error(`failed to load module ${name}`, { error: error.stack });
        });
      } catch (error) {
        this.logger.error(`failed to load module ${name} configuration`, { error: error.stack });
        return Promise.resolve();
      }
    });

    await Promise.all(loaders);

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
      process.exit('1');
    });

    // Added this listener to identify unhandled promises, but we should start making
    // sense of those as we find them
    process.on('unhandledRejection', (reason) => {
      this.logger.error("CRITICAL: Unhandled promise rejection", { reason: reason.toString(), stack: reason.stack });
    });
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
