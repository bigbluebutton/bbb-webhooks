export const MODULE_TYPES = {
  in: 'in',
  out: 'out',
  db: 'db',
};

export const MODULE_DEFINITION_SCHEMA = {
  [MODULE_TYPES.in]: {
    type: 'string',
    load: 'function',
    unload: 'function',
    setContext: 'function',
    setCollector: 'function',
  },
  [MODULE_TYPES.out]: {
    type: 'string',
    load: 'function',
    unload: 'function',
    setContext: 'function',
    onEvent: 'function',
  },
  [MODULE_TYPES.db]: {
    type: 'string',
    load: 'function',
    unload: 'function',
    setContext: 'function',
  },
}

export function validateModuleDefinition(module) {
  if (!module.type || !MODULE_TYPES[module.type]) {
    throw new Error('Module spec must be one of in | out | db');
  }

  Object.keys(MODULE_DEFINITION_SCHEMA[module.type]).forEach((key) => {
    if (typeof module[key] !== MODULE_DEFINITION_SCHEMA[module.type][key]) {
      throw new Error(`Module spec must have ${key} of type ${MODULE_DEFINITION_SCHEMA[module.type][key]}`);
    }
  });

  return true;
}

export function validateModuleConf (conf) {
  if (!conf.name) {
    throw new Error('Module spec must have a name');
  }

  if (!conf.type) {
    throw new Error('Module spec must have a type');
  }

  if (!MODULE_TYPES[conf.type]) {
    throw new Error(`Module spec has invalid type ${conf.type}`);
  }

  return true;
}

export function validateModulesConf(conf) {
  if (typeof conf !== 'object') {
    throw new Error('Module spec must be an object');
  }

  if (Object.keys(conf).length === 0) {
    throw new Error('Module spec must have at least one element');
  }

  return true;
}
