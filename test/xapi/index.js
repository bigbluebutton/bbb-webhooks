import { describe, it, before, after } from 'mocha';
import { mapSamplesToEvents, validate }  from './events.js';
import PostCatcher from '../utils/post-catcher.js';

const XAPI_SUITE = process.env.XAPI_SUITE ? process.env.XAPI_SUITE === 'true' : false;
const MOCK_LRS_URL = 'http://127.0.0.1:9009';

const generateTestCase = (event, redisClient, channel) => {
  const eventId = event.data.id;

  return () => {
    let lrsCatcher = new PostCatcher(MOCK_LRS_URL, {
      useLogger: false,
      path: '/xAPI/statements',
    });

    before((done) => {
      lrsCatcher.start().then(() => {
        done();
      }).catch((err) => {
        done(err);
      });
    });

    after((done) => {
      lrsCatcher.stop();
      done();
    });

    it(`should validate ${eventId}`, (done) => {
      lrsCatcher.once('callback', (statement) => {
        try {
          // Uncomment to debug
          //console.debug("Statement received", statement);
          const valid = validate(event, statement);
          if (!valid) {
            done(new Error(`Event ${eventId} is not valid`));
          } else {
            done();
          }
        } catch (error) {
          done(error);
        }
      });

      redisClient.publish(channel, JSON.stringify(event));
    });
  };
};

export default function suite({
  redisClient,
  testChannel,
  force,
}) {
  if (!XAPI_SUITE && !force) return;
  let events = [];

  describe('xapi tests', () => {
    before((done) => {
      mapSamplesToEvents().then((mappedEvents) => {
        events = mappedEvents;
        done();
      }).catch((err) => {
        done(err);
      });
    });

    after((done) => {
      done();
    });

    it('should generate tests', () => {
      events.forEach((event) => {
        describe(`xapi: ${event.data.id}`, generateTestCase(event, redisClient, testChannel));
      });
    });
  });
}

export const MOD_CONFIG = {
  '../out/xapi/index.js': {
    enabled: XAPI_SUITE,
    config: {
      lrs: {
        lrs_endpoint: MOCK_LRS_URL,
        lrs_username: 'admin',
        lrs_password: 'admin',
      },
      uuid_namespace: '22946e5b-1860-4436-a025-cb133ca4c1d3',
    }
  }
};
