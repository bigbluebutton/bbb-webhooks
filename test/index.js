import { describe, before, after, beforeEach } from 'mocha';
import redis from 'redis';
import config from 'config';
import Application from '../application.js';
import WebhooksSuite, { MOD_CONFIG as WH_CONFIG } from './webhooks/index.js';
import XAPISuite, { MOD_CONFIG as XAPI_CONFIG } from './xapi/index.js';

let MODULES = config.get('modules');
MODULES = config.util.extendDeep(MODULES, WH_CONFIG, XAPI_CONFIG);

const IN_REDIS_CONFIG = MODULES['../in/redis/index.js'].config.redis;
const SHARED_SECRET = process.env.SHARED_SECRET
  || config.has('bbb.sharedSecret') ? config.get('bbb.sharedSecret') : false
  || function () { throw new Error('SHARED_SECRET not set'); }();
const ALL_TESTS = process.env.ALL_TESTS ? process.env.ALL_TESTS === 'true' : true;
const TEST_CHANNEL = 'test-channel';

describe('bbb-webhooks test suite', () => {
  const application = new Application();
  const redisClient = redis.createClient({
    host: config.get('redis.host'),
    port: config.get('redis.port'),
    password: config.has('redis.password') ? config.get('redis.password') : undefined,
  });

  before((done) => {
    IN_REDIS_CONFIG.inboundChannels = [...IN_REDIS_CONFIG.inboundChannels, TEST_CHANNEL];
    application.start()
      .then(redisClient.connect())
      .then(() => { done(); })
      .catch(done);
  });

  beforeEach((done) => {
    redisClient.flushDb();
    done();
  })

  after((done) => {
    redisClient.flushDb();
    done();
  });

  // Add tests for each module here

  describe('out/webhooks tests', () => {
    const context = {
      application,
      redisClient,
      sharedSecret: SHARED_SECRET,
      testChannel: TEST_CHANNEL,
      force: ALL_TESTS,
    };

    WebhooksSuite(context);
  });

  describe('out/xapi tests', () => {
    const context = {
      application,
      redisClient,
      sharedSecret: SHARED_SECRET,
      testChannel: TEST_CHANNEL,
      force: ALL_TESTS,
    };

    XAPISuite(context);
  });
});
