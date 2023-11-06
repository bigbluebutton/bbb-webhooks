import { open } from 'node:fs/promises';
import { fileURLToPath } from 'url';
import { validate as validateUUID } from "uuid";
import { DateTime } from "luxon";
const MAPPED_EVENTS_PATH = fileURLToPath(
  new URL('../../example/events/mapped-events.json', import.meta.url)
);

const validEvents = [
  'chat-group-message-sent',
  'meeting-created',
  'meeting-ended',
  'meeting-screenshare-started',
  'meeting-screenshare-stopped',
  'poll-started',
  'poll-responded',
  'user-audio-muted',
  'user-audio-unmuted',
  'user-audio-voice-disabled',
  'user-audio-voice-enabled',
  'user-joined',
  'user-left',
  'user-cam-broadcast-end',
  'user-cam-broadcast-start',
  'user-raise-hand-changed'
]

const mapSamplesToEvents = async () => {
  const eventList = [];
  const mHandle = await open(MAPPED_EVENTS_PATH, 'r');

  for await (const line of mHandle.readLines()) {
    const event = JSON.parse(line)
    if (validEvents.includes(event.data.id)){
      eventList.push(event);
    }
  }

  await mHandle.close();

  return eventList;
}

const isValidISODate = (dateString) => DateTime.fromISO(dateString, { zone: "utc", setZone: true }).isValid;

const validateCommonProperties = statement =>
  statement.context.contextActivities.category[0].id == "https://w3id.org/xapi/virtual-classroom"
&& statement.context.contextActivities.category[0].definition.type == "http://adlnet.gov/expapi/activities/profile"
&& validateUUID(statement.context.registration)
&& validateUUID(statement.context.extensions['https://w3id.org/xapi/cmi5/context/extensions/sessionid'])
&& Object.prototype.hasOwnProperty.call(statement, 'actor')
&& isValidISODate(statement.timestamp);

const validators = {
  'meeting-created': (event, statement) => {
    return statement.verb.id === 'http://adlnet.gov/expapi/verbs/initialized'
    && statement.object.definition.type === 'https://w3id.org/xapi/virtual-classroom/activity-types/virtual-classroom'
    && validateCommonProperties(statement);
  },
  'meeting-ended': (event, statement) => {
    return statement.verb.id === 'http://adlnet.gov/expapi/verbs/terminated'
    && statement.object.definition.type === 'https://w3id.org/xapi/virtual-classroom/activity-types/virtual-classroom'
    && validateCommonProperties(statement);
  },
  'user-joined': (event, statement) => {
    return statement.verb.id === 'http://activitystrea.ms/join'
    && statement.object.definition.type === 'https://w3id.org/xapi/virtual-classroom/activity-types/virtual-classroom'
    && validateCommonProperties(statement);
  },
  'user-left': (event, statement) => {
    return statement.verb.id === 'http://activitystrea.ms/leave'
    && statement.object.definition.type === 'https://w3id.org/xapi/virtual-classroom/activity-types/virtual-classroom'
    && validateCommonProperties(statement);
  },
  'user-audio-voice-enabled': (event, statement) => {
    return statement.verb.id === 'http://activitystrea.ms/start'
    && statement.object.definition.type === 'https://w3id.org/xapi/virtual-classroom/activity-types/micro'
    && validateCommonProperties(statement)
    && statement.context.contextActivities.parent[0].definition.type === 'https://w3id.org/xapi/virtual-classroom/activity-types/virtual-classroom';
  },
  'user-audio-voice-disabled': (event, statement) => {
    return statement.verb.id === 'https://w3id.org/xapi/virtual-classroom/verbs/stopped'
    && statement.object.definition.type === 'https://w3id.org/xapi/virtual-classroom/activity-types/micro'
    && validateCommonProperties(statement)
    && statement.context.contextActivities.parent[0].definition.type === 'https://w3id.org/xapi/virtual-classroom/activity-types/virtual-classroom';
  },
  'user-audio-muted': (event, statement) => {
    return statement.verb.id === 'https://w3id.org/xapi/virtual-classroom/verbs/stopped'
    && statement.object.definition.type === 'https://w3id.org/xapi/virtual-classroom/activity-types/micro'
    && validateCommonProperties(statement)
    && statement.context.contextActivities.parent[0].definition.type === 'https://w3id.org/xapi/virtual-classroom/activity-types/virtual-classroom';
  },
  'user-audio-unmuted': (event, statement) => {
    return statement.verb.id === 'http://activitystrea.ms/start'
    && statement.object.definition.type === 'https://w3id.org/xapi/virtual-classroom/activity-types/micro'
    && validateCommonProperties(statement)
    && statement.context.contextActivities.parent[0].definition.type === 'https://w3id.org/xapi/virtual-classroom/activity-types/virtual-classroom';
  },
  'user-cam-broadcast-start': (event, statement) => {
    return statement.verb.id === 'http://activitystrea.ms/start'
    && statement.object.definition.type === 'https://w3id.org/xapi/virtual-classroom/activity-types/camera'
    && validateCommonProperties(statement)
    && statement.context.contextActivities.parent[0].definition.type === 'https://w3id.org/xapi/virtual-classroom/activity-types/virtual-classroom';
  },
  'user-cam-broadcast-end': (event, statement) => {
    return statement.verb.id === 'https://w3id.org/xapi/virtual-classroom/verbs/stopped'
    && statement.object.definition.type === 'https://w3id.org/xapi/virtual-classroom/activity-types/camera'
    && validateCommonProperties(statement)
    && statement.context.contextActivities.parent[0].definition.type === 'https://w3id.org/xapi/virtual-classroom/activity-types/virtual-classroom';
  },
  'meeting-screenshare-started': (event, statement) => {
    return statement.verb.id === 'http://activitystrea.ms/share'
    && statement.object.definition.type === 'https://w3id.org/xapi/virtual-classroom/activity-types/screen'
    && validateCommonProperties(statement)
    && statement.context.contextActivities.parent[0].definition.type === 'https://w3id.org/xapi/virtual-classroom/activity-types/virtual-classroom';
  },
  'meeting-screenshare-stopped': (event, statement) => {
    return statement.verb.id === 'http://activitystrea.ms/unshare'
    && statement.object.definition.type === 'https://w3id.org/xapi/virtual-classroom/activity-types/screen'
    && validateCommonProperties(statement)
    && statement.context.contextActivities.parent[0].definition.type === 'https://w3id.org/xapi/virtual-classroom/activity-types/virtual-classroom';
  },
  'chat-group-message-sent': (event, statement) => {
    return statement.verb.id === 'https://w3id.org/xapi/acrossx/verbs/posted'
    && statement.object.definition.type === 'https://w3id.org/xapi/acrossx/activities/message'
    && validateCommonProperties(statement)
    && statement.context.contextActivities.parent[0].definition.type === 'https://w3id.org/xapi/virtual-classroom/activity-types/virtual-classroom';
  },
  'poll-started': (event, statement) => {
    return statement.verb.id === 'http://adlnet.gov/expapi/verbs/asked'
    && statement.object.definition.type === 'http://adlnet.gov/expapi/activities/cmi.interaction'
    && statement.object.definition.interactionType === 'choice'
    && validateCommonProperties(statement)
    && statement.context.contextActivities.parent[0].definition.type === 'https://w3id.org/xapi/virtual-classroom/activity-types/virtual-classroom';
  },
  'poll-responded': (event, statement) => {
    return statement.verb.id === 'http://adlnet.gov/expapi/verbs/answered'
    && statement.object.definition.type === 'http://adlnet.gov/expapi/activities/cmi.interaction'
    && statement.object.definition.interactionType === 'choice'
    && validateCommonProperties(statement)
    && statement.context.contextActivities.parent[0].definition.type === 'https://w3id.org/xapi/virtual-classroom/activity-types/virtual-classroom';
  },
  'user-raise-hand-changed': (event, statement) => {
    const raisedHandVerb = "https://w3id.org/xapi/virtual-classroom/verbs/reacted";
    const loweredHandVerb = "https://w3id.org/xapi/virtual-classroom/verbs/unreacted";
    const isRaiseHand = event.data.attributes.user["raise-hand"];
    return statement.verb.id === isRaiseHand ? raisedHandVerb : loweredHandVerb
    && statement.object.definition.type === 'https://w3id.org/xapi/virtual-classroom/activity-types/virtual-classroom'
    && statement.result.extensions["https://w3id.org/xapi/virtual-classroom/extensions/emoji"] === 'U+1F590'
    && validateCommonProperties(statement);
  }
}

const validate = (event, statement) => {
  const eventId = event.data.id;
  const validator = validators[eventId];

  if (!validator) throw new Error(`No validator for ${statement.verb.id}`);

  return validator(event, statement);
}

export {
  mapSamplesToEvents,
  validators,
  validate,
};
