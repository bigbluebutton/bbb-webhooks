import {
  v4 as uuidv4,
  v5 as uuidv5,
} from 'uuid';
import { StorageCompartmentKV } from './base-storage.js';

// The database of hooks.
// Used always from memory, but saved to redis for persistence.
//
// Format:
//   { id: Hook }
// Format on redis:
//   * a SET "...:hooks" with all ids
//   * a HASH "...:hook:<id>" for each hook with some of its attributes

// The representation of a hook and its properties. Stored in memory and persisted
// to redis.
// Hooks can be global, receiving callback calls for events from all meetings on the
// server, or for a specific meeting. If an `externalMeetingID` is set in the hook,
// it will only receive calls related to this meeting, otherwise it will be global.
// faster than the callbacks are made. In this case the events will be concatenated
// and send up to 10 events in every post
class HookCompartment extends StorageCompartmentKV {
  static itemDeserializer(data) {
    const { id, ...payload } = data;
    const parsedPayload = {
      callbackURL: payload.callbackURL,
      externalMeetingID: payload.externalMeetingID,
      // Should be an array
      eventID: payload.eventID?.split(','),
      // Should be a boolean
      permanent: payload.permanent === 'true',
      // Should be a boolean
      getRaw: payload.getRaw === 'true',
    };

    return {
      id,
      ...parsedPayload,
    };
  }

  constructor(client, prefix, setId, options = {}) {
    super(client, prefix, setId, options);
  }

  _buildPayload({
    callbackURL,
    meetingID = null,
    eventID = null,
    permanent = false,
    getRaw = false,
  }) {
    if (callbackURL == null) throw new Error('callbackURL is required');

    return {
      callbackURL,
      externalMeetingID: meetingID,
      eventID,
      permanent,
      getRaw,
    }
  }

  setOptions(options) {
    this.permanentURLs = options.permanentURLs;
  }

  getHook(id) {
    return this.find(id);
  }

  isGlobal(item) {
    return item?.externalMeetingID == null;
  }

  getExternalMeetingID(id) {
    const hook = this.getHook(id);
    return hook?.externalMeetingID;
  }

  findByExternalMeetingID(externalMeetingID) {
    return this.findByField('externalMeetingID', externalMeetingID);
  }

  async addSubscription({
    callbackURL,
    meetingID,
    eventID,
    permanent,
    getRaw,
  }) {
    const payload = this._buildPayload({
      callbackURL,
      externalMeetingID: meetingID,
      eventID: eventID?.toLowerCase().split(','),
      permanent,
      getRaw,
    });

    let hook = this.findByField('callbackURL', callbackURL);

    if (hook != null) {
      return {
        duplicated: true,
        hook,
      }
    }

    this.logger.info(`adding a hook with callback URL: [${callbackURL}]`, { payload });
    const id = permanent ? uuidv5(callbackURL, uuidv5.URL) : uuidv4();
    hook = await this.save(payload, {
      id,
      alias: callbackURL,
    });

    return {
      duplicated: false,
      hook,
    }
  }

  async removeSubscription(hookID) {
    const hook = await this.getSync(hookID);

    if (hook != null && !hook.payload.permanent) {
      let msg = `removing the hook with callback URL: [${hook.payload.callbackURL}],`;
      if (hook.externalMeetingID != null)  msg += ` for the meeting: [${hook.payload.externalMeetingID}]`;
      this.logger.info(msg);
      return this.destroy(hookID);
    }

    return Promise.resolve(false);
  }

  countSync() {
    return this.count();
  }

  getSync(id) {
    return this.find(id);
  }

  firstSync() {
    const keys = Object.keys(this.localStorage);
    if (keys.length > 0) return this.localStorage[keys[0]];
    return null;
  }

  allGlobalSync() {
    return this.getAll().filter(hook => this.isGlobal(hook));
  }

  // Initializes global methods for this model.
  initialize() {
    return this.resync();
  }
}

let Hooks = null;

const init = (redisClient, prefix, setId) => {
  if (Hooks == null) {
    Hooks = new HookCompartment(
      redisClient,
      prefix,
      setId, {
        deserializer: HookCompartment.itemDeserializer,
      },
    );
    return Hooks.initialize();
  }

  return Promise.resolve(Hooks);
}

const get = () => {
  if (Hooks == null) {
    throw new Error('Hooks not initialized');
  }

  return Hooks;
}

export default {
  init,
  get,
}
