import { open } from 'node:fs/promises';

/*
 * [MODULE_TYPES.in]: {
 *   load: 'function',
 *   unload: 'function',
 *   setContext: 'function',
 *   setCollector: 'function',
 * },
 *
 * This is an example input module that reads from a file (config.filename).
 * The file should contain a JSON object per line, each object representing
 * an input event (either BBB/raw format or webhooks format).
 *
 * To enable it, add the following entry to the `modules` section of your
 * config.yml:
 * ```
 *  ../../example/modules/in-file.js:
 *   type: in
 *   config:
 *     fileName: </path/to/file>
 *     delay: 1000
 * ```
 *
 */

const timeout = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export default class InFile {
  static _defaultCollector () {
    throw new Error('Collector not set');
  }

  constructor (context, config = {}) {
    this.type = "in";
    this.config = config;
    this.setContext(context);
    this.loaded = false;

    this._fileHandle = null;
  }

  _validateConfig () {
    if (this.config == null) {
      throw new Error("config not set");
    }

    if (this.config.fileName == null) {
      throw new Error("config.fileName not set");
    }

    if (this.config.delay == null) {
      this.config.delay = 1000;
    }

    return true;
  }

  async _readFile () {
    if (this._fileHandle == null) {
      this._fileHandle = await open(this.config.fileName, 'r');
    }

    const lines = this._fileHandle.readLines();

    for await (const line of lines) {
      await timeout(this.config.delay);
      this._dispatch(line);
    }
  }

  _dispatch (event) {
    this.logger.debug(`read event from file: ${event}`);

    try {
      const parsedEvent = JSON.parse(event);
      this._collector(parsedEvent);
    } catch (error) {
      this.logger.error('error processing message:', error);
    }
  }

  async load () {
    try {
      this._validateConfig();
      setTimeout(() => {
        this._readFile().catch((error) => {
          this.logger.error('error reading file:', error);
        });
      }, 0);
      this.loaded = true;
    } catch (error) {
      this.logger.error('error loading InFile:', error);
      throw error;
    }
  }

  async unload () {
    if (this._fileHandle != null) {
      await this._fileHandle.close();
      this._fileHandle = null;
    }

    this.setCollector(InFile._defaultCollector);
  }

  setContext (context) {
    this.context = context;
    this.logger = context.getLogger();

    return context;
  }

  setCollector (collector) {
    this.logger.debug('InFile.setCollector:', { collector });
    this._collector = collector;
  }
}
