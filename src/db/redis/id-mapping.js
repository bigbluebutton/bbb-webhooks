import config from 'config';
import { StorageItem, StorageCompartmentKV } from './base-storage.js';
import UserMapping from './user-mapping.js';
import { v4 as uuidv4 } from 'uuid';

// The database of mappings. Uses the internal ID as key because it is unique
// unlike the external ID.
// Used always from memory, but saved to redis for persistence.
//
// Format:
//   {
//      internalMeetingID: {
//       id: @id
//       externalMeetingID: @externalMeetingID
//       internalMeetingID: @internalMeetingID
//       lastActivity: @lastActivity
//     }
//   }
// Format on redis:
//   * a SET "...:mappings" with all ids (not meeting ids, the object id)
//   * a HASH "...:mapping:<id>" for each mapping with all its attributes

// A simple model to store mappings for meeting IDs.
class IDMappingCompartment extends StorageCompartmentKV {
  constructor(client, prefix, setId) {
    super(client, prefix, setId, {
      aliasField: 'internalMeetingID',
    });
  }

  async addOrUpdateMapping(internalMeetingID, externalMeetingID) {
    const payload = {
      internalMeetingID: internalMeetingID,
      externalMeetingID: externalMeetingID,
      lastActivity: new Date().getTime(),
    };

    const mapping = await this.save(payload, {
      alias: internalMeetingID,
    });
    this.logger.info(`added or changed meeting mapping to the list ${externalMeetingID}: ${mapping.print()}`);

    return mapping;
  }

  async removeMapping(internalMeetingID) {
    const result = await this.destroyWithField('internalMeetingID', internalMeetingID);
    return result;
  }

  getInternalMeetingID(externalMeetingID) {
    const mapping = this.findByField('externalMeetingID', externalMeetingID);
    return (mapping != null ? mapping.payload?.internalMeetingID : undefined);
  }

  getExternalMeetingID(internalMeetingID) {
    if (this.localStorage[internalMeetingID]) {
      return this.localStorage[internalMeetingID].payload?.externalMeetingID;
    }
  }

  findByExternalMeetingID(externalMeetingID) {
    return this.findByField('externalMeetingID', externalMeetingID);
  }

  allSync() {
    return this.getAll();
  }

  // Sets the last activity of the mapping for `internalMeetingID` to now.
  reportActivity(internalMeetingID) {
    let mapping = this.localStorage[internalMeetingID];
    if (mapping != null) {
      mapping.payload.lastActivity = new Date().getTime();
      return mapping.save();
    }
  }

  // Checks all current mappings for their last activity and removes the ones that
  // are "expired", that had their last activity too long ago.
  cleanup() {
    const now = new Date().getTime();
    const all = this.getAll();
    const toRemove = all.filter(mapping => mapping?.payload.lastActivity < (now - config.get("mappings.timeout")));

    if (toRemove && toRemove.length > 0) {
      this.logger.info('expiring mappings', {
        mappings: toRemove.map(map => map.print()),
      });
      toRemove.forEach(mapping => {
        UserMapping.get().removeMappingWithMeetingId(mapping.payload.internalMeetingID).catch((error) => {
          this.logger.error(`error removing user mapping for ${mapping.payload.internalMeetingID}`, error);
        }).finally(() => {
          this.destroy(mapping.id).catch((error) => {
            this.logger.error(`error removing mapping for ${mapping.id}`, error);
          });
        });
      });
    }
  }

  // Initializes global methods for this model.
  initialize() {
    this.cleanupInterval = setInterval(this.cleanup.bind(this), config.get("mappings.cleanupInterval"));
    return this.resync();
  }
}

let IDMapping = null;

const init = (redisClient) => {
  if (IDMapping == null) {
    IDMapping = new IDMappingCompartment(
      redisClient,
      config.get('redis.keys.mappingPrefix'),
      config.get('redis.keys.mappings')
    );
    return IDMapping.initialize();
  }

  return Promise.resolve(IDMapping);
}

const get = () => {
  if (IDMapping == null) {
    throw new Error('IDMapping not initialized');
  }

  return IDMapping;
}

export default {
  init,
  get,
}
