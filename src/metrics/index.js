import config from 'config';
import PrometheusAgent from './prometheus-agent.js';
import { Counter } from 'prom-client';
import { newLogger } from '../common/logger.js';

const logger = newLogger('prometheus');

const {
  enabled: METRICS_ENABLED = false,
  host: METRICS_HOST = '127.0.0.1',
  port: METRICS_PORT = '3004',
  path: METRICS_PATH = '/metrics',
  collectDefaultMetrics: COLLECT_DEFAULT_METRICS,
} = config.has('prometheus') ? config.get('prometheus') : { enabled: false };

let METRICS, AGENT;
const PREFIX = 'bbb_webhooks_';
const METRIC_NAMES = {
  OUTPUT_QUEUE_SIZE: `${PREFIX}output_queue_size`,
  MODULE_STATUS: `${PREFIX}module_status`,
  EVENT_PROCESS_FAILURES: `${PREFIX}event_process_failures`,
  EVENT_DISPATCH_FAILURES: `${PREFIX}event_dispatch_failures`,
}

/**
 * injectMetrics - Inject a metrics dictionary into the Prometheus agent.
 * @param {PrometheusAgent} agent - Prometheus agent
 * @param {object} metricsDictionary - Metrics dictionary (key: metric name, value: prom-client metric object)
 * @returns {boolean} - True if metrics were injected, false otherwise
 * @public
 */
const injectMetrics = (agent, metricsDictionary) => {
  agent.injectMetrics(metricsDictionary);
  return true;
}

/**
 * buildDefaultMetrics - Build the default metrics dictionary.
 * @returns {object} - Metrics dictionary (key: metric name, value: prom-client metric object)
 * @public
 */
const buildDefaultMetrics = () => {
  if (METRICS == null) {
    METRICS = {
      // TODO to be implemented
      //[METRIC_NAMES.MODULE_STATUS]: new Gauge({
      //  name: METRIC_NAMES.MODULE_STATUS,
      //  help: 'Status of each module',
      //  labelNames: ['module', 'moduleType'],
      //}),

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

/**
 * getExporter - Start the Prometheus agent.
 * @returns {PrometheusAgent} - Prometheus agent
 * @public
 */
const getExporter = () => {
  if (AGENT && AGENT.started) return AGENT;

  if (AGENT == null) {
    AGENT = new PrometheusAgent(METRICS_HOST, METRICS_PORT, {
      path: METRICS_PATH,
      prefix: PREFIX,
      collectDefaultMetrics: COLLECT_DEFAULT_METRICS,
      logger,
    });
  }

  if (METRICS_ENABLED && injectMetrics(AGENT, buildDefaultMetrics())) {
    AGENT.start();
  }

  return AGENT;
}

export default {
  METRICS_ENABLED,
  METRIC_NAMES,
  METRICS,
  injectMetrics,
  getExporter,
};

