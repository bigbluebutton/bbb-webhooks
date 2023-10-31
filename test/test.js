import { describe, it, before, after, beforeEach } from 'mocha';
import request from 'supertest';
import redis from 'redis';
import config from 'config';
import Utils from '../src/out/webhooks/utils.js';
import Hook from '../src/db/redis/hooks.js';
import Helpers from './helpers.js'
import Application from '../application.js';
import HooksPostCatcher from './hooks-post-catcher.js';

const TEST_CHANNEL = 'test-channel';
const SHARED_SECRET = process.env.SHARED_SECRET
  || config.has('bbb.sharedSecret') ? config.get('bbb.sharedSecret') : false
  || function () { throw new Error('SHARED_SECRET not set'); }();
const MODULES = config.get('modules');
const WH_CONFIG = MODULES['../out/webhooks/index.js'].config;
const IN_REDIS_CONFIG = MODULES['../in/redis/index.js'].config.redis;
const CHECKSUM_ALGORITHM = 'sha1';

describe('bbb-webhooks tests', () => {
  const application = new Application();
  const redisClient = redis.createClient({
    host: config.get('redis.host'),
    port: config.get('redis.port'),
    password: config.has('redis.password') ? config.get('redis.password') : undefined,
  });

  before((done) => {
    WH_CONFIG.queueSize = 10;
    WH_CONFIG.permanentURLs = [
      { url: Helpers.rawCatcherURL, getRaw: true },
      { url: Helpers.mappedCatcherURL, getRaw: false },
    ];
    IN_REDIS_CONFIG.inboundChannels = [...IN_REDIS_CONFIG.inboundChannels, TEST_CHANNEL];
    application.start()
      .then(redisClient.connect())
      .then(() => { done(); })
      .catch(done);
  });

  beforeEach((done) => {
    const hooks = Hook.get().getAllGlobalHooks();
    Helpers.flushall(redisClient);
    hooks.forEach((hook) => {
      Helpers.flushredis(hook);
    });

    done();
  })

  after((done) => {
    const hooks = Hook.get().getAllGlobalHooks();
    Helpers.flushall(redisClient);
    hooks.forEach((hook) => {
      Helpers.flushredis(hook);
    });
    done();
  });

  describe('GET /hooks/list permanent', () => {
    it('should list permanent hook', (done) => {
      let getUrl = Utils.checksumAPI(
        Helpers.url + Helpers.listUrl,
        SHARED_SECRET, CHECKSUM_ALGORITHM
      );
      getUrl = Helpers.listUrl + '?checksum=' + getUrl

      request(Helpers.url)
        .get(getUrl)
        .expect('Content-Type', /text\/xml/)
        .expect(200, () => {
          const hooks = Hook.get().getAllGlobalHooks();
          if (hooks && hooks.some(hook => hook.payload.permanent)) {
            done();
          } else {
            done(new Error ("permanent hook was not created"));
          }
        })
    })
  });

  describe('GET /hooks/destroy', () => {
    before((done) => {
      Hook.get().addSubscription({
        callbackURL: Helpers.callback,
        permanent: false,
        getRaw: false,
      }).then(() => { done(); }).catch(done);
    });

    it('should destroy a hook', (done) => {
      const hooks = Hook.get().getAllGlobalHooks();
      const hook = hooks[hooks.length-1].id;
      let getUrl = Utils.checksumAPI(
        Helpers.url + Helpers.destroyUrl(hook),
        SHARED_SECRET,
        CHECKSUM_ALGORITHM,
      );
      getUrl = Helpers.destroyUrl(hook) + '&checksum=' + getUrl

      request(Helpers.url)
        .get(getUrl)
        .expect('Content-Type', /text\/xml/)
        .expect(200, () => {
          const hooks = Hook.get().getAllGlobalHooks();
          if (hooks && hooks.every(hook => hook.payload.callbackURL != Helpers.callback)) done();
        })
    })
  });

  describe('GET /hooks/destroy permanent hook', () => {
    it('should not destroy the permanent hook', (done) => {
      let getUrl = Utils.checksumAPI(
        Helpers.url + Helpers.destroyPermanent,
        SHARED_SECRET,
        CHECKSUM_ALGORITHM,
      ); getUrl = Helpers.destroyPermanent + '&checksum=' + getUrl
      request(Helpers.url)
        .get(getUrl)
        .expect('Content-Type', /text\/xml/)
        .expect(200, () => {
          const hooks = Hook.get().getAllGlobalHooks();
          if (hooks && hooks[0].payload.callbackURL == WH_CONFIG.permanentURLs[0].url) {
            done();
          } else {
            done(new Error("should not delete permanent"));
          }
        })
    })
  });

  describe('GET /hooks/create getRaw hook', () => {
    after( (done) => {
      const hooks = Hook.get().getAllGlobalHooks();
      Hook.get().removeSubscription(hooks[hooks.length-1].id)
        .then(() => { done(); })
        .catch(done);
    });

    it('should create a hook with getRaw=true', (done) => {
      let getUrl = Utils.checksumAPI(
        Helpers.url + Helpers.createUrl + Helpers.createRaw,
        SHARED_SECRET,
        CHECKSUM_ALGORITHM,
      );
      getUrl = Helpers.createUrl + '&checksum=' + getUrl + Helpers.createRaw

      request(Helpers.url)
        .get(getUrl)
        .expect('Content-Type', /text\/xml/)
        .expect(200, () => {
          const hooks = Hook.get().getAllGlobalHooks();
          if (hooks && hooks.some((hook) => { return hook.payload.getRaw })) {
            done();
          } else {
            done(new Error("getRaw hook was not created"))
          }
        })
    })
  });

  describe('/POST mapped message', () => {
    let catcher;

    before((done) => {
      catcher = new HooksPostCatcher(WH_CONFIG.permanentURLs[1].url);
      const hooks = Hook.get().getAllGlobalHooks();
      const hook = hooks[0];
      Helpers.flushredis(hook);
      catcher.start().then(() => {
        done();
      });
    });

    after((done) => {
      const hooks = Hook.get().getAllGlobalHooks();
      const hook = hooks[0];
      Helpers.flushredis(hook);
      catcher.stop();
      done();
    })

    it('should post mapped message ', (done) => {
      catcher.once('callback', (body) => {
        try {
          let parsed = JSON.parse(body?.event);
          if (parsed[0].data?.id) {
            done();
          } else {
            done(new Error("unmapped message"));
          }
        } catch (error) {
          done(error);
        }
      });

      redisClient.publish(TEST_CHANNEL, JSON.stringify(Helpers.rawMessage));
    })
  });

  describe('/POST raw message', () => {
    let catcher;

    before((done) => {
      catcher = new HooksPostCatcher(WH_CONFIG.permanentURLs[0].url);
      const hooks = Hook.get().getAllGlobalHooks();
      const hook = hooks[0];
      Helpers.flushredis(hook);
      catcher.start().then(() => {
        done();
      });
    });

    after((done) => {
      catcher.stop();
      const hooks = Hook.get().getAllGlobalHooks();
      Hook.get().removeSubscription(hooks[hooks.length-1].id)
        .then(() => { done(); })
        .catch(done);
      Helpers.flushredis(hooks[hooks.length-1]);
    });

    it('should post raw message ', (done) => {
      catcher.once('callback', (body) => {
        try {
          let parsed = JSON.parse(body?.event);
          if (parsed[0]?.envelope?.name == Helpers.rawMessage.envelope.name) {
            done();
          } else {
            done(new Error("message is not raw"));
          }
        } catch (error) {
          done(error);
        }
      });

      redisClient.publish(TEST_CHANNEL, JSON.stringify(Helpers.rawMessage));
    })
  });
});
