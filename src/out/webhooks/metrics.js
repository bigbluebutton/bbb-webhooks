const METRICS_PREFIX = 'bbb_webhooks_out_hooks';
const METRIC_NAMES = {
  API_REQUESTS: `${METRICS_PREFIX}_api_requests`,
  REGISTERED_HOOKS: `${METRICS_PREFIX}_registered_hooks`,
  HOOK_FAILURES: `${METRICS_PREFIX}_hook_failures`,
  PROCESSED_EVENTS: `${METRICS_PREFIX}_processed_events`,
}

/**
 * buildMetrics - Builds out-webhooks metrics for the Prometheus exporter.
 * @param {MetricsExporter} exporter - The Prometheus exporter.
 * @returns {object} - Metrics dictionary (key: metric name, value: prom-client metric object)
 */
const buildMetrics = ({ Counter, Gauge }) => {
  return {
    [METRIC_NAMES.API_REQUESTS]: new Counter({
      name: METRIC_NAMES.API_REQUESTS,
      help: 'Webhooks API requests',
      labelNames: ['method', 'path', 'statusCode', 'returncode', 'messageKey'],
    }),

    [METRIC_NAMES.REGISTERED_HOOKS]: new Gauge({
      name: METRIC_NAMES.REGISTERED_HOOKS,
      help: 'Registered hooks',
      labelNames: ['callbackURL', 'permanent', 'getRaw', 'enabled'],
    }),

    [METRIC_NAMES.HOOK_FAILURES]: new Counter({
      name: METRIC_NAMES.HOOK_FAILURES,
      help: 'Hook failures',
      labelNames: ['callbackURL', 'reason', 'eventId'],
    }),

    [METRIC_NAMES.PROCESSED_EVENTS]: new Counter({
      name: METRIC_NAMES.PROCESSED_EVENTS,
      help: 'Processed events',
      labelNames: ['eventId', 'callbackURL'],
    }),
  }
};

export {
  METRIC_NAMES,
  buildMetrics,
};
