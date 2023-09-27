import { open } from 'node:fs/promises';

/*
 *  [MODULE_TYPES.OUTPUT]: {
 *   load: 'function',
 *   unload: 'function',
 *   setContext: 'function',
 *   onEvent: 'function',
 * },
 *
 * This is an example output module that writes events to a file (config.filename).
 * The file should contain one JSON object per line, each object representing
 * an bbb-webhooks event.
 *
 * To enable it, add the following entry to the `modules` section of your
 * config.yml:
 * ```
 *  ../../example/modules/out-file.js:
 *   type: out
 *   config:
 *     fileName: </path/to/file>
 * ```
 *
 */

const timeout = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export default class OutFile {
  static type = "out";

  static _defaultCollector () {
    throw new Error('Collector not set');
  }

  constructor (context, config = {}) {
    this.type = OutFile.type;
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

  async _writeEvent() {
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
      this._fileHandle = await open(this.config.fileName, 'a');
      this.loaded = true;
    } catch (error) {
      this.logger.error('error loading OutFile:', error);
      throw error;
    }
  }

  async unload () {
    if (this._fileHandle != null) {
      await this._fileHandle.close();
      this._fileHandle = null;
    }

    this.setCollector(OutFile._defaultCollector);
  }

  setContext (context) {
    this.context = context;
    this.logger = context.getLogger();

    return context;
  }

  async onEvent (event, raw) {
    if (!this.loaded || this._fileHandle == null) {
      throw new Error("OutFile not loaded");
    }

    this.logger.debug('OutFile.onEvent:', event);

    // Write events as JSON objects to FILENAME, always appending each JSON
    // is isolated and separated by a newline
    // JSON is pretty-printed if this.config.prettyPrint is true
    const writableMessage = this.config.prettyPrint
      ? JSON.stringify(event, null, 2)
      : JSON.stringify(event);

    await this._fileHandle.appendFile(writableMessage + "\n");
  }
}
