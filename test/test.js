import { describe, it, before, after, beforeEach } from 'mocha';
import request from 'supertest';
import nock from "nock";
import Utils from '../src/out/webhooks/utils.js';
import config from 'config';
import Hook from '../src/db/redis/hooks.js';
import Helpers from './helpers.js'
import Application from '../application.js';
import redis from 'redis';

const TEST_CHANNEL = 'test-channel';
const SHARED_SECRET = process.env.SHARED_SECRET || function () { throw new Error('SHARED_SECRET not set'); }();
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
    WH_CONFIG.permanentURLs = [ { url: "https://wh.requestcatcher.com", getRaw: true } ];
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
  after(() => {
    const hooks = Hook.get().getAllGlobalHooks();
    Helpers.flushall(redisClient);
    hooks.forEach((hook) => {
      Helpers.flushredis(hook);
    });
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
      );
      getUrl = Helpers.destroyPermanent + '&checksum=' + getUrl
      request(Helpers.url)
        .get(getUrl)
        .expect('Content-Type', /text\/xml/)
        .expect(200, () => {
          const hooks = Hook.get().getAllGlobalHooks();
          if (hooks && hooks[0].payload.callbackURL == WH_CONFIG.permanentURLs[0].url) {
            done();
          }
          else {
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
          }
          else {
            done(new Error("getRaw hook was not created"))
          }
        })
    })
  });

  describe('/POST mapped message', () => {
    before((done) => {
      const hooks = Hook.get().getAllGlobalHooks();
      const hook = hooks[0];
      Helpers.flushredis(hook);
      done();
    });
    after(() => {
      const hooks = Hook.get().getAllGlobalHooks();
      const hook = hooks[0];
      Helpers.flushredis(hook);
    })
    it('should post mapped message ', (done) => {
      const hooks = Hook.get().getAllGlobalHooks();
      const hook = hooks[0];
      const getpost = nock(WH_CONFIG.permanentURLs[0].url)
        .filteringRequestBody((body) => {
          let parsed = JSON.parse(body)
          return parsed[0].data.id ? "mapped" : "not mapped";
        })
        .post("/", "mapped")
        .reply(200, (res) => {
          done();
        });
      redisClient.publish(TEST_CHANNEL, JSON.stringify(Helpers.rawMessage));
    })
  });
  describe('/POST raw message', () => {
    before((done) => {
          const hooks = Hook.get().getAllGlobalHooks();
          const hook = hooks[0];
          Helpers.flushredis(hook);
      done();
    });
    after((done) => {
      const hooks = Hook.get().getAllGlobalHooks();
      Hook.get().removeSubscription(hooks[hooks.length-1].id)
        .then(() => { done(); })
        .catch(done);
      Helpers.flushredis(hooks[hooks.length-1]);
    });
    it('should post raw message ', (done) => {
      const hooks = Hook.get().getAllGlobalHooks();
      const hook = hooks[0];

      const getpost = nock(Helpers.callback)
        .filteringRequestBody( (body) => {
          if (body.indexOf("PresenterAssignedEvtMsg")) {
            return "raw message";
          }
          else { return "not raw"; }
        })
        .post("/", "raw message")
        .reply(200, () => {
          done();
        });
      const permanent = nock(WH_CONFIG.permanentURLs[0].url)
        .post("/")
        .reply(200)
      redisClient.publish(TEST_CHANNEL, JSON.stringify(Helpers.rawMessage));
    })
  });

  describe('/POST multi message', () => {
    before( () =>{
      const hooks = Hook.get().getAllGlobalHooks();
      const hook = hooks[0];
      Helpers.flushredis(hook);
      hook.queue = ["multiMessage1"];
    });
    it('should post multi message ', (done) => {
      const hooks = Hook.get().getAllGlobalHooks();
      const hook = hooks[0];
      hook.enqueue("multiMessage2")
      const getpost = nock(WH_CONFIG.permanentURLs[0].url)
        .filteringPath( (path) => {
          return path.split('?')[0];
        })
        .filteringRequestBody( (body) => {
          if (body.indexOf("multiMessage1") != -1 && body.indexOf("multiMessage2") != -1) {
            return "multiMess"
          }
          else {
            return "not multi"
          }
        })
        .post("/", "multiMess")
        .reply(200, (res) => {
          done();
        });
    })
  });
});
