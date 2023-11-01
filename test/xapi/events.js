import { open } from 'node:fs/promises';
import { fileURLToPath } from 'url';
const MAPPED_EVENTS_PATH = fileURLToPath(
  new URL('../../example/events/mapped-events.json', import.meta.url)
);

const mapSamplesToEvents = async () => {
  const eventList = [];
  const mHandle = await open(MAPPED_EVENTS_PATH, 'r');

  for await (const line of mHandle.readLines()) {
    eventList.push(JSON.parse(line));
  }

  await mHandle.close();

  return eventList;
}

const validators = {
  'http://adlnet.gov/expapi/verbs/initialized': (statement) => {
    return statement.verb.id === 'http://adlnet.gov/expapi/verbs/initialized';
  }
}

const validate = (statement) => {
  const validator = validators[statement.verb.id];

  if (!validator) throw new Error(`No validator for ${statement.verb.id}`);

  return validator(statement);
}

export {
  mapSamplesToEvents,
  validators,
  validate,
};
