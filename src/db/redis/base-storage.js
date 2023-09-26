import { newLogger } from '../../common/logger.js';
import { v4 as uuidv4 } from 'uuid';

const stringifyValues = (o) => {
  Object.keys(o).forEach(k => {
    // Make all values strings, but ignore nullish/undefined values.
    if (typeof o[k] === 'object') {
      o[k] = JSON.stringify(stringifyValues(o[k]));
    } else if (o[k] == null) {
      delete o[k];
    } else {
      o[k] = '' + o[k];
    }
  });

  return o;
}

class StorageItem {
  constructor(client, prefix, setId, payload, {
    id = uuidv4(),
    alias,
    ...appOptions
  }) {
    this.client = client;
    this.prefix = prefix;
    this.setId = setId;
    this.id = id;
    this.alias = alias;
    this.payload = payload;
    this.appOptions = appOptions;
    this.redisClient = client;
    this.logger = newLogger(`db:${this.prefix}|${this.setId}`);
  }

  async save() {
    try {
      await this.redisClient.hSet(this.prefix + ":" + this.id, this.serialize());
    } catch (error) {
      this.logger.error(`error saving mapping to redis: ${error}`);
      throw error;
    }

    try {
      await this.redisClient.sAdd(this.setId, (this.id).toString());
    } catch (error) {
      this.logger.error(`error saving mapping ID to the list of mappings: ${error}`);
      throw error;
    }

    return true;
  }

  async destroy() {
    try {
      await this.redisClient.sRem(this.setId, (this.id).toString());
    } catch (error) {
      this.logger.error(`error removing mapping ID from the list of mappings: ${error}`);
    }

    try {
      await this.redisClient.del(this.prefix + ":" + this.id);
    } catch (error) {
      this.logger.error(`error removing mapping from redis: ${error}`);
    }

    return true;
  }

  serialize() {
    const r = {
      id: this.id,
      ...this.payload,
    };

    const s = Object.entries(stringifyValues(r)).flat();
    return s;
  }

  deserialize(data) {
    const { id, ...payload } = data;
    this.id = id;
    this.payload = payload;
  }

  print() {
    return this.serialize();
  }
}

class StorageCompartmentKV {
  constructor (client, prefix, setId, {
    itemClass = StorageItem,
    aliasField,
    ...appOptions
  } = {}) {
    this.redisClient = client;
    this.prefix = prefix;
    this.setId = setId;
    this.itemClass = itemClass;
    this.localStorage = {}
    this.aliasField = aliasField;
    this.appOptions = appOptions;

    this.logger = newLogger(`db:${this.prefix}|${this.setId}`);
  }

  async save(payload, {
    id = uuidv4(),
    alias,
  }) {
    if (alias == null) {
      alias = payload[this.aliasField];
    }

    let mapping = new this.itemClass(this.redisClient, this.prefix, this.setId, payload, {
      id,
      alias,
    });

    await mapping.save();
    this.localStorage[mapping.id] = mapping;
    if (mapping.alias) this.localStorage[mapping.alias] = mapping;

    return mapping;
  }

  async find(id) {
    return this.localStorage[id];
  }

  async destroy(id) {
    const mapping = this.localStorage[id];
    if (mapping) {
      await mapping.destroy();
      delete this.localStorage[id];
      if (mapping.alias && this.localStorage[mapping.alias]) {
        delete this.localStorage[mapping.alias];
      }
      return mapping;
    }

    return false;
  }

  count() {
    return Object.keys(this.localStorage).length;
  }

  async destroyWithField(field, value) {
    return Promise.all(
      Object.keys(this.localStorage).map(internal => {
        let mapping = this.localStorage[internal];
        if (mapping.payload[field] === value) {
          return mapping.destroy()
            .then(() => {
              return mapping;
            })
            .catch(() => {
              return false;
            }).finally(() => {
              if (this.localStorage[mapping.id]) {
                delete this.localStorage[mapping.id];
              }

              if (mapping.alias && this.localStorage[mapping.alias]) {
                delete this.localStorage[mapping.alias];
              }
            });
        } else {
          return false;
        }
      })
    );
  }

  findByField(field, value) {
    if (field != null && value != null) {
      for (let internal in this.localStorage) {
        const mapping = this.localStorage[internal];
        if (mapping != null && mapping.payload[field] === value) {
          return mapping;
        }
      }
    }

    return null;
  }

  updateWithField(field, value, payload) {
    if (field != null && value != null) {
      for (let internal in this.localStorage) {
        const mapping = this.localStorage[internal];
        if (mapping != null && mapping.payload[field] === value) {
          mapping.payload = { ...mapping.payload, ...payload };
          return mapping.save();
        }
      }
    }

    return Promise.resolve(false);
  }

  getAll() {
    const allWithAliases = Object.keys(this.localStorage).reduce((arr, id) => {
      arr.push(this.localStorage[id]);
      return arr;
    }, []);

    return [...new Set(allWithAliases)];
  }

  // Initializes global methods for this model.
  async initialize() {
    return this.resync()
  }

  // Gets all mappings from redis to populate the local database.
  async resync() {
    try {
      const mappings = await this.redisClient.sMembers(this.setId);

      if (mappings != null && mappings.length > 0) {
        return Promise.all(mappings.map(async (id) => {
          try {
            const kek = await this.redisClient.hGetAll(this.prefix + ":" + id);
            const { id: rId, ...mappingData } = kek;

            if (mappingData && Object.keys(mappingData).length > 0) {
              await this.save(mappingData, {
                id: rId,
                alias: mappingData[this.aliasField],
              });
            }

            return Promise.resolve();
          } catch (error) {
            this.logger.error(`error getting information for a mapping from redis: ${error}`);
            return Promise.resolve();
          }
        })).then(() => {
          const stringifiedMappings = this.getAll().map(m => m.print());
          this.logger.info(`finished resync, mappings registered: [${stringifiedMappings}]`);
        }).catch((error) => {
          this.logger.error(`error getting list of mappings from redis: ${error}`);
        });
      }

      this.logger.info(`finished resync, no mappings registered`);
      return Promise.resolve();
    } catch (error) {
      this.logger.error(`error getting list of mappings from redis: ${error}`);
      return Promise.resolve();
    }
  }
}

export {
  StorageItem,
  StorageCompartmentKV,
};
