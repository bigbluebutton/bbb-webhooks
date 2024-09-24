import promclient from 'prom-client';
import HttpServer from './http-server.js';

/**
 * PrometheusScrapeAgent.
 * @class
 */
class PrometheusScrapeAgent {
  /**
   * constructor.
   * @param {string} host - Host to bind to for the metrics HTTP server
   * @param {number} port - Port to bind to for the metrics HTTP server
   * @param {object} options - Options object
   * @param {string} options.path - Path to expose metrics on
   * @param {string} options.prefix - Prefix to add to all metrics
   * @param {number} options.collectionTimeout - Timeout for collecting metrics
   * @param {boolean} options.collectDefaultMetrics - Whether to collect prom-client default metrics
   * @param {object} options.logger - Logger object
   * @returns {PrometheusScrapeAgent} - PrometheusScrapeAgent object
   */
  constructor (host, port, options = {}) {
    this.host = host;
    this.port = port;
    this.metrics = {};
    this.started = false;

    this.path = options.path || '/metrics';
    this.metricsPrefix = options.prefix || '';
    this.collectionTimeout = options.collectionTimeout || 10000;
    this.collectDefaultMetrics = options.collectDefaultMetrics || false;
    this.logger = options.logger || console;
  }

  /**
   * getMetric - Get a metric by name.
   * @param {string} name - Name of the metric
   * @returns {promclient.Metric} - Metric object
   */
  getMetric (name) {
    return this.metrics[name];
  }

  /**
   * _collect - Collect metrics and expose them on the metrics HTTP server.
   * @private
   * @param {http.ServerResponse} response - HTTP server response to write metrics to
   * @async
   */
  async _collect (response) {
    try {
      const _response = await this.collect(response);
      const content = await promclient.register.metrics();
      _response.writeHead(200, { 'Content-Type': promclient.register.contentType });
      _response.end(content);
    } catch (error) {
      this.logger.error('Prometheus: error collecting metrics', error);
      response.writeHead(500)
      response.end("Error collecting metrics");
    }
  }

  /**
   * collect - Override this method to add a custom collector.
   * @param {http.ServerResponse} response - HTTP response
   * @returns {Promise} - Promise object
   * @async
   * @abstract
   */
  collect (response) {
    return Promise.resolve(response);
  }

  /**
   * defaultMetricsHandler - Default request handler for metrics HTTP server.
   * @param {http.IncomingMessage} request - HTTP request
   * @param {http.ServerResponse} response - HTTP response
   */
  defaultMetricsHandler (request, response) {
    switch (request.method) {
      case 'GET':
        if (request.url === this.path) {
          this._collect(response);
          return;
        }
        response.writeHead(404).end();
        break;
      default:
        response.writeHead(501)
        response.end();
        break;
    }
  }

  /**
   * start - Start the metrics HTTP server.
   * @param {Function} requestHandler - Request handler for metrics HTTP server
   */
  start (requestHandler = this.defaultMetricsHandler.bind(this)) {
    if (this.collectDefaultMetrics) promclient.collectDefaultMetrics({
      prefix: this.metricsPrefix,
      timeout: this.collectionTimeout,
    });

    this.metricsServer = new HttpServer(this.host, this.port, requestHandler, {
      logger: this.logger,
    });
    this.metricsServer.start();
    this.metricsServer.listen();
    this.started = true;
  }

  /**
   * injectMetrics - Inject new metrics into the metrics dictionary.
   * @param {object} metricsDictionary - Metrics dictionary
   */
  injectMetrics (metricsDictionary) {
    this.metrics = { ...this.metrics, ...metricsDictionary }
  }

  /**
   * increment - Increment a metric COUNTER
   * @param {string} metricName - Name of the metric
   * @param {object} labelsObject - An object containing labels and their values for the metric
   */
  increment (metricName, labelsObject) {
    if (!this.started) return;

    const metric = this.metrics[metricName];
    if (metric) {
      metric.inc(labelsObject)
    }
  }

  /**
   * decrement - Decrement a metric COUNTER
   * @param {string} metricName - Name of the metric
   * @param {object} labelsObject - An object containing labels and their values for the metric
   */
  decrement (metricName, labelsObject) {
    if (!this.started) return;

    const metric = this.metrics[metricName];
    if (metric) {
      metric.dec(labelsObject)
    }
  }

  /**
   * set - Set a metric GAUGE to a value
   * @param {string} metricName - Name of the metric
   * @param {number} value - Value to set the metric to
   * @param {object} labelsObject - An object containing labels and their values for the metric
   */
  set (metricName, value, labelsObject = {}) {
    if (!this.started) return;

    const metric = this.metrics[metricName];
    if (metric) {
      metric.set(labelsObject, value)
    }
  }

  /**
   * setCollectorWithGenerator - Override a specific metric's collector with a generator function.
   * @param {string} metricName - Name of the metric
   * @param {Function} generator - Generator function to be called on each collect
   */
  setCollectorWithGenerator (metricName, generator) {
    const metric = this.getMetric(metricName);
    if (metric) {
      /**
       * metric.collect.
       */
      metric.collect = () => {
        metric.set(generator());
      };
    }
  }

  /**
   * setCollector - Override a specific metric's collector with a custom collector.
   * @param {string} metricName - Name of the metric
   * @param {Function} collector - Custom collector function to be called on each collect
   */
  setCollector (metricName, collector) {
    const metric = this.getMetric(metricName);

    if (metric) {
      metric.collect = collector.bind(metric);
    }
  }

  /**
   * reset - Reset metrics values. Resets all metrics if no metric name is provided.
   * @param {string[]} metrics - Array of metric names to reset
   */
  reset (metrics = []) {
    if (metrics == null || metrics.length === 0) {
      promclient.register.resetMetrics();
      return;
    }

    metrics.forEach(metricName => {
      const metric = this.getMetric(metricName);

      if (metric) {
        metric.reset(metricName);
      }
    });
  }
}

export default PrometheusScrapeAgent;
