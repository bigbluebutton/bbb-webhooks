import config from 'config';
import Logger from '../../common/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { StorageItem, StorageCompartmentKV } from './base-storage.js';

class UserMappingCompartment extends StorageCompartmentKV {
  constructor(client, prefix, setId) {
    super(client, prefix, setId, {
      aliasField: 'internalUserID',
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

  getUser(internalUserID) {
    const mapping = this.findByField('internalUserID', internalUserID);
    return (mapping != null ? mapping.payload?.user : undefined);
  }

  getExternalUserID(internalUserID) {
    const mapping = this.findByField('internalUserID', internalUserID);
    return (mapping != null ? mapping.payload?.externalUserID : undefined);
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
      config.get('redis.keys.userMaps')
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
