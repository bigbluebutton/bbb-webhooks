import { newLogger } from '../../common/logger.js';
import { v4 as uuidv4 } from 'uuid';
import config from 'config';

const stringifyValues = (obj) => {
  // Deep clone the object so we don't modify the original.
  const cObj = config.util.cloneDeep(obj);
  Object.keys(cObj).forEach(k => {
    // Make all values strings, but ignore nullish/undefined values.
    if (cObj[k] == null) {
      delete cObj[k];
    } else if (typeof cObj[k] === 'object') {
      cObj[k] = JSON.stringify(stringifyValues(cObj[k]));
    }  else {
      cObj[k] = '' + cObj[k];
    }
  });

  return cObj;
}

class StorageItem {
  static stringifyValues = stringifyValues;

  constructor(client, prefix, setId, payload, {
    id = uuidv4(),
    alias,
    serializer,
    deserializer,
    ...appOptions
  }) {
    this.client = client;
    // Prefix and setId must be strings - convert
    this.prefix = typeof prefix !== 'string' ? prefix.toString() : prefix;
    this.setId = typeof setId !== 'string' ? setId.toString() : setId;
    this.id = id;
    this.alias = alias;
    this.payload = config.util.cloneDeep(payload);
    if (typeof serializer === 'function') this.serialize = serializer.bind(this);
    if (typeof deserializer === 'function') this.deserialize = deserializer.bind(this);
    this.appOptions = appOptions;
    this.redisClient = client;
    this.logger = newLogger(`db:${this.prefix}|${this.setId}`);
  }

  async save() {
    try {
      await this.redisClient.hSet(this.prefix + ":" + this.id, this.serialize(this));
    } catch (error) {
      this.logger.error('error saving mapping to redis', error);
      throw error;
    }

    try {
      await this.redisClient.sAdd(this.setId, (this.id).toString());
    } catch (error) {
      this.logger.error('error saving mapping ID to the list of mappings', error);
      throw error;
    }

    return true;
  }

  async destroy() {
    try {
      await this.redisClient.sRem(this.setId, (this.id).toString());
    } catch (error) {
      this.logger.error('error removing mapping ID from the list of mappings', error);
    }

    try {
      await this.redisClient.del(this.prefix + ":" + this.id);
    } catch (error) {
      this.logger.error('error removing mapping from redis', error);
    }

    return true;
  }

  serialize(data) {
    const r = {
      id: data.id,
      ...data.payload,
    };

    const s = Object.entries(stringifyValues(r)).flat();
    return s;
  }

  deserialize(data) {
    return JSON.parse(data);
  }

  print() {
    return this.serialize(this);
  }
}

class StorageCompartmentKV {
  static stringifyValues = stringifyValues;

  constructor (client, prefix, setId, {
    itemClass = StorageItem,
    aliasField,
    serializer,
    deserializer,
    ...appOptions
  } = {}) {
    this.redisClient = client;
    this.prefix = prefix;
    this.setId = setId;
    this.itemClass = itemClass;
    this.localStorage = {}
    this.aliasField = aliasField;
    this.appOptions = appOptions;
    if (typeof serializer === 'function') this.serialize = serializer.bind(this);
    if (typeof deserializer === 'function') this.deserialize = deserializer.bind(this);

    this.logger = newLogger(`db:${this.prefix}|${this.setId}`);
  }

  serialize(data) {
    const r = {
      id: data.id,
      ...data.payload,
    };

    const s = Object.entries(stringifyValues(r)).flat();
    return s;
  }

  deserialize(data) {
    return data;
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
      serializer: this.serialize,
      deserializer: this.deserialize,
      ...this.appOptions,
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
      Object.keys(this.localStorage).filter(internal => {
        return this.localStorage[internal] && this.localStorage[internal]?.payload[field] === value;
      }).map(internal => {
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
          return Promise.resolve(false);
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

      this.logger.info(`starting resync, mappings registered: [${mappings}]`);
      if (mappings != null && mappings.length > 0) {
        return Promise.all(mappings.map(async (id) => {
          try {
            const data = await this.redisClient.hGetAll(this.prefix + ":" + id);
            const { id: rId, ...payload } = this.deserialize(data);

            if (payload && Object.keys(payload).length > 0) {
              await this.save(payload, {
                id: rId,
                alias: payload[this.aliasField],
                itemClass: this.itemClass
              });
            }

            return Promise.resolve();
          } catch (error) {
            this.logger.error('error getting information for a mapping from redis', error);
            return Promise.resolve();
          }
        })).then(() => {
          const stringifiedMappings = this.getAll().map(m => m.print());
          this.logger.info(`finished resync, mappings registered: [${stringifiedMappings}]`);
        }).catch((error) => {
          this.logger.error('error getting list of mappings from redis', error);
        });
      }

      this.logger.info(`finished resync, no mappings registered`);
      return Promise.resolve();
    } catch (error) {
      this.logger.error('error getting list of mappings from redis', error);
      return Promise.resolve();
    }
  }
}

export {
  StorageItem,
  StorageCompartmentKV,
};
