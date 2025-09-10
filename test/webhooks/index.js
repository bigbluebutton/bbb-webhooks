import { describe, it, before, after, beforeEach } from 'mocha';
import request from 'supertest';
import config from 'config';
import Utils from '../../src/out/webhooks/utils.js';
import Hook from '../../src/db/redis/hooks.js';
import Helpers from './helpers.js'
import HooksPostCatcher from './hooks-post-catcher.js';

const MODULES = config.get('modules');
const WH_CONFIG = MODULES['../out/webhooks/index.js']?.config;
const CHECKSUM_ALGORITHM = 'sha1';
const WEBHOOKS_SUITE = process.env.WEBHOOKS_SUITE ? process.env.WEBHOOKS_SUITE === 'true' : false;
const ALL_TESTS = process.env.ALL_TESTS ? process.env.ALL_TESTS === 'true' : true;

export default function suite({
  application,
  redisClient,
  sharedSecret,
  testChannel,
  force,
}) {
  if (!WEBHOOKS_SUITE && !force) return;

  before((done) => {
    done();
  });

  beforeEach((done) => {
    const hooks = Hook.get().getAllGlobalHooks();

    hooks.forEach((hook) => {
      Helpers.flushredis(hook);
    });

    done();
  })

  after((done) => {
    const hooks = Hook.get().getAllGlobalHooks();

    hooks.forEach((hook) => {
      Helpers.flushredis(hook);
    });

    done();
  });

  describe('GET /hooks/list permanent', () => {
    it('should list permanent hook', (done) => {
      let getUrl = Utils.checksumAPI(
        Helpers.url + Helpers.listUrl,
        sharedSecret, CHECKSUM_ALGORITHM
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
        sharedSecret,
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
        sharedSecret,
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
    after((done) => {
      const hooks = Hook.get().getAllGlobalHooks();
      Hook.get().removeSubscription(hooks[hooks.length-1].id)
        .then(() => { done(); })
        .catch(done);
    });

    it('should create a hook with getRaw=true', (done) => {
      let getUrl = Utils.checksumAPI(
        Helpers.url + Helpers.createUrl + Helpers.createRaw,
        sharedSecret,
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

  describe('GET /hooks/create without checksum', () => {
    it('should return 200 response with checksumError key', (done) => {
      request(Helpers.url)
        .get(Helpers.createUrl)
        .expect('Content-Type', /text\/xml/)
        .expect(200, (err, res) => {
          if (res.text.includes('checksumError')) {
            done();
          } else {
            done(new Error("Incorrect checksumError response: " + res.text));
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

      redisClient.publish(testChannel, JSON.stringify(Helpers.rawMessage));
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

      redisClient.publish(testChannel, JSON.stringify(Helpers.rawMessage));
    })
  });

  describe('GET /hooks/create with meetingID', () => {
    const meetingId = 'test-create-with-meetingID';
    const cbUrl = 'http://127.0.0.1:3012/callback';

    after((done) => {
      const callbackHook = Hook.get().findByField('callbackURL', cbUrl);

      if (callbackHook) {
        Hook.get().removeSubscription(callbackHook.id)
          .then(() => { done(); })
          .catch(done);
      } else {
        done();
      }
    });

    it('should register hook with meetingID and list it with meetingID', (done) => {
      const encodedCb = HooksPostCatcher.encodeForUrl(cbUrl);
      const createPath = `${Helpers.port}${Helpers.apiPath}create/?callbackURL=${encodedCb}&meetingID=${encodeURIComponent(meetingId)}`;
      const checksum = Utils.checksumAPI(Helpers.url + createPath, sharedSecret, CHECKSUM_ALGORITHM);
      const createUrl = `${createPath}&checksum=${checksum}`;

      request(Helpers.url)
        .get(createUrl)
        .expect('Content-Type', /text\/xml/)
        .expect(200)
        .then(() => {
          // List by meetingID and expect a hook with the provided meetingID tag
          const listPath = `${Helpers.port}${Helpers.apiPath}list/?meetingID=${encodeURIComponent(meetingId)}`;
          const listChecksum = Utils.checksumAPI(Helpers.url + listPath, sharedSecret, CHECKSUM_ALGORITHM);
          const listUrl = `${listPath}&checksum=${listChecksum}`;

          return request(Helpers.url)
            .get(listUrl)
            .expect('Content-Type', /text\/xml/)
            .expect(200)
            .then((res) => {
              const body = res.text || '';
              if (!body.includes(`<meetingID><![CDATA[${meetingId}]]></meetingID>`)) {
                throw new Error(`meetingID tag missing in list response. Body: ${body}`);
              }
              if (!body.includes(`<![CDATA[${cbUrl}]]>`)) {
                throw new Error(`callbackURL missing in list response. Body: ${body}`);
              }
            });
        })
        .then(() => done())
        .catch(done);
    });
  });

  describe('delivery to meeting-scoped hooks', () => {
    let scopedHookId, globalHookId;
    let scopedCatcher, globalCatcher;
    const meetingExtId = Helpers.rawMessageMeetingCreated.core.body.props.meetingProp.extId;
    const meetingIntId = Helpers.rawMessageMeetingCreated.core.body.props.meetingProp.intId;
    const globalExtId = 'delivery-to-meeting-scoped-hooks-other-external-id';
    const globalIntId = 'delivery-to-meeting-scoped-hooks-other-internal-id';
    const scopedCallbackUrl = 'http://127.0.0.1:3011/callback';
    const globalCallbackUrl = 'http://127.0.0.1:3013/callback';

    // Events to be used: scoped meeting-created and user-joined, and global meeting-created
    const scopedJoinEvent = JSON.parse(JSON.stringify(Helpers.rawMessageUserJoined));
    scopedJoinEvent.envelope.routing.meetingId = meetingIntId;
    const scopedEvents = [Helpers.rawMessageMeetingCreated,
      scopedJoinEvent,
    ];
    const globalEvent = JSON.parse(JSON.stringify(Helpers.rawMessageMeetingCreated));
    globalEvent.core.body.props.meetingProp.extId = globalExtId;
    globalEvent.core.body.props.meetingProp.intId = globalIntId;
    const globalEvents = [globalEvent];

    before(async () => {
      const staleScoped = Hook.get().findByField('callbackURL', scopedCallbackUrl);
      if (staleScoped?.id) await Hook.get().removeSubscription(staleScoped.id);
      const staleGlobal = Hook.get().findByField('callbackURL', globalCallbackUrl);
      if (staleGlobal?.id) await Hook.get().removeSubscription(staleGlobal.id);

      scopedCatcher = await Helpers.createHooksCatcher(scopedCallbackUrl);
      globalCatcher = await Helpers.createHooksCatcher(globalCallbackUrl);

      // Register global hook to account for global events
      const globalCbUrl = HooksPostCatcher.encodeForUrl(globalCallbackUrl);
      const globalCreatePath = `${Helpers.port}${Helpers.apiPath}create/?callbackURL=${globalCbUrl}`;
      const globalCreateChecksum = Utils.checksumAPI(Helpers.url + globalCreatePath, sharedSecret, CHECKSUM_ALGORITHM);
      const globalCreateUrl = `${globalCreatePath}&checksum=${globalCreateChecksum}`;
      await request(Helpers.url).get(globalCreateUrl).expect(200);

      // Register scoped hook to meetingExtId
      const scopedCbUrl = HooksPostCatcher.encodeForUrl(scopedCallbackUrl);
      const scopedCreatePath = `${Helpers.port}${Helpers.apiPath}create/?callbackURL=${scopedCbUrl}&meetingID=${encodeURIComponent(meetingExtId)}`;
      const scopedCreateChecksum = Utils.checksumAPI(Helpers.url + scopedCreatePath, sharedSecret, CHECKSUM_ALGORITHM);
      const scopedCreateUrl = `${scopedCreatePath}&checksum=${scopedCreateChecksum}`;
      await request(Helpers.url).get(scopedCreateUrl).expect(200);

      scopedHookId = Hook.get().findByField('callbackURL', scopedCallbackUrl)?.id || null;
      globalHookId = Hook.get().findByField('callbackURL', globalCallbackUrl)?.id || null;
    });

    after((done) => {
      Helpers.stopHooksCatcher(scopedCatcher);
      Helpers.stopHooksCatcher(globalCatcher);
      const removals = [];

      if (scopedHookId) removals.push(Hook.get().removeSubscription(scopedHookId));
      if (globalHookId) removals.push(Hook.get().removeSubscription(globalHookId));
      if (removals.length > 0) {
        Promise.allSettled(removals).then(() => done()).catch(done);
      } else {
        done();
      }
    });

    it('should only receive events for its meeting', (done) => {
      let seenScopedEvents = 0;
      let seenGlobalEvents = 0;
      let finished = false;

      const maybeFinish = () => {
        if (!finished
          && seenScopedEvents == scopedEvents.length
          && seenGlobalEvents == (globalEvents.length + scopedEvents.length)) {
          finished = true;
          scopedCatcher.removeAllListeners('callback');
          globalCatcher.removeAllListeners('callback');
          done();
        }
      };

      const onScoped = ({ event }) => {
        try {
          const parsed = JSON.parse(event);
          const extId = parsed[0]?.data?.attributes?.meeting?.['external-meeting-id'];
          const eventName = parsed[0]?.data?.id;

          if (extId === meetingExtId) seenScopedEvents++;

          // If a global meeting leaks, throw
          if (extId && extId !== meetingExtId) {
            finished = true;
            done(new Error(`scoped hook received global meeting '${extId}'`));
          } else {
            if (eventName === "meeting-created") {
              // Send a scoped user joined event to the scoped meeting
              redisClient.publish(testChannel, JSON.stringify(scopedEvents[1]));
            }
            maybeFinish();
          }
        } catch (e) {
          finished = true;
          done(e);
        }
      };

      const onGlobal = ({ event }) => {
        try {
          const parsed = JSON.parse(event);
          const extId = parsed[0]?.data?.attributes?.meeting?.['external-meeting-id'];
          const intId = parsed[0]?.data?.attributes?.meeting?.['internal-meeting-id'];

          // Global hooks should receive all events
          if (((extId === globalExtId) && (intId === globalIntId))
            || ((extId === meetingExtId) && (intId === meetingIntId))) {
            seenGlobalEvents++;
          }

          maybeFinish();
        } catch (e) {
          finished = true;
          done(e);
        }
      };

      scopedCatcher.on('callback', onScoped);
      globalCatcher.on('callback', onGlobal);

      // Seed event for target meeting
      redisClient.publish(testChannel, JSON.stringify(scopedEvents[0]));
      // Send a global event for a different meeting - override extId and intId manually
      redisClient.publish(testChannel, JSON.stringify(globalEvents[0]));
    });
  });

  describe('checksum uniqueness', () => {
    let catcher;
    let hookId = null;
    let originalAuthMode = null;
    let outWebhooksImpl = null;

    before((done) => {
      Helpers.createHooksCatcher('http://127.0.0.1:3009/callback')
        .then((c) => {
          catcher = c;
          // Force auth mode to checksum for this test
          const outModules = application.moduleManager.getOutputModules();
          const whWrapper = outModules.find((m) => m.name.includes(Object.keys(MOD_CONFIG)[0]));
          outWebhooksImpl = whWrapper && whWrapper._module;
          originalAuthMode = outWebhooksImpl?.webhooks?.config?.server?.auth2_0;

          if (outWebhooksImpl?.webhooks?.config?.server) {
            outWebhooksImpl.webhooks.config.server.auth2_0 = false;
          }

          return Hook.get().addSubscription({
            callbackURL: 'http://127.0.0.1:3009/callback',
            permanent: false,
            getRaw: false,
          });
        })
        .then(({ id, hook }) => {
          hookId = id || (hook && hook.id) || null;
          done();
        })
        .catch(done);
    });

    after((done) => {
      Helpers.stopHooksCatcher(catcher);
      try {
        // Restore original auth mode
        if (outWebhooksImpl?.webhooks?.config?.server && originalAuthMode !== null) {
          outWebhooksImpl.webhooks.config.server.auth2_0 = originalAuthMode;
        }
      } catch (e) {
        done(e);
      }

      if (hookId != null) {
        Hook.get().removeSubscription(hookId)
          .then(() => { done(); })
          .catch(done);
      } else {
        done();
      }
    });

    it('should vary checksum per different events', (done) => {
      const checksums = [];

      const collectChecksums = ({ url = '' }) => {
        try {
          const qIndex = url.indexOf('?');
          const query = qIndex >= 0 ? url.substring(qIndex + 1) : '';
          const params = new URLSearchParams(query);
          const checksum = params.get('checksum');

          if (checksum) checksums.push(checksum);

          if (checksums.length === 2) {
            if (checksums[0] !== checksums[1]) {
              done();
            } else {
              done(new Error(`checksum should differ across events, but was the same: ${checksums[0]}`));
            }
          }
        } catch (error) {
          done(error);
        }
      };

      catcher.on('callback:request', collectChecksums);

      redisClient.publish(testChannel, JSON.stringify(Helpers.rawMessage));
      redisClient.publish(testChannel, JSON.stringify(Helpers.rawMessageUserJoined));
    });
  });
}

export const MOD_CONFIG = {
  '../out/webhooks/index.js': {
    enabled: WEBHOOKS_SUITE || ALL_TESTS,
    config: {
      queueSize: 10,
      permanentURLs: [
        { url: Helpers.rawCatcherURL, getRaw: true },
        { url: Helpers.mappedCatcherURL, getRaw: false },
      ],
    },
  },
};
