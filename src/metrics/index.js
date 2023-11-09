import config from 'config';
import PrometheusAgent from './prometheus-agent.js';
import {
  Counter,
  Gauge,
  Histogram,
  Summary,
  register,
} from 'prom-client';
import { newLogger } from '../common/logger.js';

const logger = newLogger('prometheus');

const {
  enabled: METRICS_ENABLED = false,
  host: METRICS_HOST = '127.0.0.1',
  port: METRICS_PORT = '3004',
  path: METRICS_PATH = '/metrics',
  collectDefaultMetrics: COLLECT_DEFAULT_METRICS,
} = config.has('prometheus') ? config.get('prometheus') : { enabled: false };

const PREFIX = 'bbb_webhooks_';
const METRIC_NAMES = {
  OUTPUT_QUEUE_SIZE: `${PREFIX}output_queue_size`,
  MODULE_STATUS: `${PREFIX}module_status`,
  EVENT_PROCESS_FAILURES: `${PREFIX}event_process_failures`,
  EVENT_DISPATCH_FAILURES: `${PREFIX}event_dispatch_failures`,
}

let METRICS = {}
let AGENT;

/**
 * injectMetrics - Inject a metrics dictionary into the Prometheus agent.
 * @param {object} metricsDictionary - Metrics dictionary (key: metric name, value: prom-client metric object)
 * @param {object} options - Options object
 * @param {PrometheusAgent} options.agent - Prometheus agent to inject the metrics into
 *                                          If not specified, the default agent will be used
 * @returns {boolean} - True if metrics were injected, false otherwise
 * @public
 * @memberof module:exporter
 */
const injectMetrics = (metricsDictionary, {
  agent = AGENT,
} = {}) => {
  agent.injectMetrics(metricsDictionary);
  return true;
}

/**
 * buildDefaultMetrics - Build the default metrics dictionary.
 * @returns {object} - Metrics dictionary (key: metric name, value: prom-client metric object)
 * @private
 * @memberof module:exporter
 */
const buildDefaultMetrics = () => {
  if (METRICS == null || Object.keys(METRICS).length === 0) {
    METRICS = {
      [METRIC_NAMES.MODULE_STATUS]: new Gauge({
        name: METRIC_NAMES.MODULE_STATUS,
        help: 'Status of each module',
        labelNames: ['module', 'moduleType'],
      }),

      // TODO to be implemented
      //[METRIC_NAMES.OUTPUT_QUEUE_SIZE]: new Gauge({
      //  name: METRIC_NAMES.OUTPUT_QUEUE_SIZE,
      //  help: 'Event queue size for each output module',
      //  labelNames: ['module'],
      //}),

      [METRIC_NAMES.EVENT_PROCESS_FAILURES]: new Counter({
        name: METRIC_NAMES.EVENT_PROCESS_FAILURES,
        help: 'Number of event processing failures',
      }),

      [METRIC_NAMES.EVENT_DISPATCH_FAILURES]: new Counter({
        name: METRIC_NAMES.EVENT_DISPATCH_FAILURES,
        help: 'Number of event dispatch failures',
        labelNames: ['outputEventId', 'module'],
      }),
    }
  }

  return METRICS;
};

AGENT = new PrometheusAgent(METRICS_HOST, METRICS_PORT, {
  path: METRICS_PATH,
  prefix: PREFIX,
  collectDefaultMetrics: COLLECT_DEFAULT_METRICS,
  logger,
});

if (METRICS_ENABLED && injectMetrics(buildDefaultMetrics())) {
  AGENT.start();
}

/**
 * @module exporter
 * @typedef {object} MetricsExporter
 * @property {boolean} METRICS_ENABLED - Whether the exporter is enabled or not
 * @property {object} METRIC_NAMES - Indexed metric names
 * @property {object} METRICS - Active metrics dictionary (key: metric name, value: prom-client metric object)
 * @property {Function} Counter - prom-client Counter class
 * @property {Function} Gauge - prom-client Gauge class
 * @property {Function} Histogram - prom-client Histogram class
 * @property {Function} Summary - prom-client Summary class
 * @property {Function} register - Register a new metric with the Prometheus agent
 * @property {Function} injectMetrics - Inject a new metrics dictionary into the Prometheus agent
 *                                      Merges with the existing dictionary
 * @property {PrometheusAgent} agent - Prometheus agent
 */

/**
 * Metrics exporter util singleton object.
 * @type {MetricsExporter}
 * @public
 * @memberof module:exporter
 */
export default {
  METRICS_ENABLED,
  METRIC_NAMES,
  METRICS,
  Counter,
  Gauge,
  Histogram,
  Summary,
  register,
  injectMetrics,
  agent: AGENT,
};

