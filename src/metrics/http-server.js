import http from 'node:http';

/**
 * HttpServer.
 */
class HttpServer {
  /**
   * constructor.
   * @public
   * @param {string} host - HTTP server host to bind to
   * @param {number} port - HTTP server port to bind to
   * @param {Function} callback - callback function to be called on each request
   * @param {object} options - options object
   * @param {object} options.logger - logger object
   * @returns {HttpServer} - HttpServer object
   */
  constructor(host, port, callback, {
    logger = console,
  } = {}) {
    this.host = host;
    this.port = port;
    this.requestCallback = callback;
    this.logger = logger;
  }

  /**
   * start - creates the HTTP server (without listening).
   * @public
   */
  start () {
    this.server = http.createServer(this.requestCallback)
      .on('error', this._handleError.bind(this))
      .on('clientError', this._handleError.bind(this));
  }

  /**
   * close - closes the HTTP server.
   * @public
   * @param {Function} callback - callback function to be called on close
   * @returns {http.Server} - server object
   */
  close (callback) {
    return this.server.close(callback);
  }

  /**
   * handleError - handles HTTP server 'error' and 'clientError' events.
   * @private
   * @param {Error} error - error object
   */
  _handleError (error) {
    switch (error.code) {
      case 'EADDRINUSE':
        this.logger.warn("EADDRINUSE, won't spawn HTTP server", {
          host: this.host, port: this.port,
        });
        this.server.close();
        break;
      case 'ECONNRESET':
        this.logger.warn("HTTPServer: ECONNRESET ", { errorMessage: error.message });
        break;
      default:
        this.logger.error("Unexpected HTTP server error", error);
    }
  }

  /**
   * getServerObject - returns the HTTP server object.
   * @public
   * @returns {http.Server} - server object
   */
  getServerObject() {
    return this.server;
  }

  /**
   * listen - starts listening on the HTTP server at the specified host and port.
   * @public
   * @param {Function} callback - callback function to be called on listen
   * @returns {http.Server} - server object
   */
  listen(callback) {
    this.logger.info(`HTTPServer is listening: ${this.host}:${this.port}`);
    return this.server.listen(this.port, this.host, callback);
  }
}

export default HttpServer;
