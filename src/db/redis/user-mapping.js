import config from 'config';
import { StorageCompartmentKV } from './base-storage.js';

class UserMappingCompartment extends StorageCompartmentKV {
  static itemDeserializer(data) {
    const { id, ...payload } = data;
    const { user, ...rest } = payload;
    const parsedPayload = {
      ...rest,
      user: JSON.parse(user),
    };

    return {
      id,
      ...parsedPayload,
    };
  }

  constructor(client, prefix, setId, options = {}) {
    super(client, prefix, setId, {
      aliasField: 'internalUserID',
      ...options,
    });
  }

  async addOrUpdateMapping(internalUserID, externalUserID, meetingId, user) {
    const payload = {
      internalUserID,
      externalUserID,
      meetingId,
      user,
    };

    const mapping = await this.save(payload, {
      alias: internalUserID,
    });
    this.logger.info(`added user mapping to the list ${internalUserID}: ${mapping.print()}`);

    return mapping;
  }

  async removeMapping(internalUserID) {
    const result = await this.destroyWithField('internalUserID', internalUserID);
    return result;
  }

  async removeMappingWithMeetingId(meetingId) {
    const result = await this.destroyWithField('meetingId', meetingId);
    return result;
  }

  async getInternalMeetingID(externalMeetingID) {
    const mapping = await this.findByField('externalMeetingID', externalMeetingID);
    return (mapping != null ? mapping.payload?.internalMeetingID : undefined);
  }

  getUsersFromMeeting(internalMeetingID) {
    const mappings = this.findAllWithField('meetingId', internalMeetingID);

    return mappings != null ? mappings.map((mapping) => mapping.payload) : [];
  }

  getMeetingPresenter (internalMeetingID) {
    const mappings = this.getUsersFromMeeting(internalMeetingID);

    return mappings.find((mapping) =>
      mapping?.user?.presenter === true || mapping?.user?.presenter === 'true'
    );
  }

  getMeetingScreenShareOwner (internalMeetingID) {
    const mappings = this.getUsersFromMeeting(internalMeetingID);

    return mappings.find((mapping) =>
      mapping?.user?.screenshare === true || mapping?.user?.screenshare === 'true'
    );
  }

  getUser(internalUserID) {
    const mapping = this.findByField('internalUserID', internalUserID);
    return (mapping != null ? mapping.payload?.user : undefined);
  }

  getExternalUserID(internalUserID) {
    const mapping = this.findByField('internalUserID', internalUserID);
    return (mapping != null ? mapping.payload?.externalUserID : undefined);
  }

  isGuest(internalUserID) {
    const user = this.getUser(internalUserID);
    return user?.guest === true || user?.guest === 'true';
  }

  // Initializes global methods for this model.
  initialize() {
    return this.resync();
  }
}

let UserMapping = null;

const init = (redisClient) => {
  if (UserMapping == null) {
    UserMapping = new UserMappingCompartment(
      redisClient,
      config.get('redis.keys.userMapPrefix'),
      config.get('redis.keys.userMaps'), {
        deserializer: UserMappingCompartment.itemDeserializer,
      }
    );
    return UserMapping.initialize();
  }

  return Promise.resolve(UserMapping);
}

const get = () => {
  if (UserMapping == null) {
    throw new Error('UserMapping not initialized');
  }

  return UserMapping;
}

export default {
  init,
  get,
}
