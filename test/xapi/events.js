import { open } from 'node:fs/promises';
import { fileURLToPath } from 'url';
import { validateVerb, validateDefinitionType, validateCommonProperties,
  validatePlannedDuration, validateResultDuration, validateVirtualClassroomParent,
  validatePoll, validatePollResponse, validateRaiseHandEmoji } from './validateFunctions.js';
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

const validators = {
  'meeting-created': (event, statement) => {
    return validateVerb(statement, 'http://adlnet.gov/expapi/verbs/initialized')
    && validateDefinitionType(statement, 'https://w3id.org/xapi/virtual-classroom/activity-types/virtual-classroom')
    && validatePlannedDuration(statement)
    && validateCommonProperties(statement);
  },
  'meeting-ended': (event, statement) => {
    return validateVerb(statement, 'http://adlnet.gov/expapi/verbs/terminated')
    && validateDefinitionType(statement, 'https://w3id.org/xapi/virtual-classroom/activity-types/virtual-classroom')
    && validateResultDuration(statement)
    && validatePlannedDuration(statement)
    && validateCommonProperties(statement);
  },
  'user-joined': (event, statement) => {
    return validateVerb(statement, 'http://activitystrea.ms/join')
    && validateDefinitionType(statement, 'https://w3id.org/xapi/virtual-classroom/activity-types/virtual-classroom')
    && validateCommonProperties(statement);
  },
  'user-left': (event, statement) => {
    return validateVerb(statement, 'http://activitystrea.ms/leave')
    && validateDefinitionType(statement, 'https://w3id.org/xapi/virtual-classroom/activity-types/virtual-classroom')
    && validateCommonProperties(statement);
  },
  'user-audio-voice-enabled': (event, statement) => {
    return validateVerb(statement, 'http://activitystrea.ms/start')
    && validateDefinitionType(statement, 'https://w3id.org/xapi/virtual-classroom/activity-types/micro')
    && validateCommonProperties(statement)
    && validateVirtualClassroomParent(statement);
  },
  'user-audio-voice-disabled': (event, statement) => {
    return validateVerb(statement, 'https://w3id.org/xapi/virtual-classroom/verbs/stopped')
    && validateDefinitionType(statement, 'https://w3id.org/xapi/virtual-classroom/activity-types/micro')
    && validateCommonProperties(statement)
    && validateVirtualClassroomParent(statement);
  },
  'user-audio-muted': (event, statement) => {
    return validateVerb(statement, 'https://w3id.org/xapi/virtual-classroom/verbs/stopped')
    && validateDefinitionType(statement, 'https://w3id.org/xapi/virtual-classroom/activity-types/micro')
    && validateCommonProperties(statement)
    && validateVirtualClassroomParent(statement);
  },
  'user-audio-unmuted': (event, statement) => {
    return validateVerb(statement, 'http://activitystrea.ms/start')
    && validateDefinitionType(statement, 'https://w3id.org/xapi/virtual-classroom/activity-types/micro')
    && validateCommonProperties(statement)
    && validateVirtualClassroomParent(statement);
  },
  'user-cam-broadcast-start': (event, statement) => {
    return validateVerb(statement, 'http://activitystrea.ms/start')
    && validateDefinitionType(statement, 'https://w3id.org/xapi/virtual-classroom/activity-types/camera')
    && validateCommonProperties(statement)
    && validateVirtualClassroomParent(statement);
  },
  'user-cam-broadcast-end': (event, statement) => {
    return validateVerb(statement, 'https://w3id.org/xapi/virtual-classroom/verbs/stopped')
    && validateDefinitionType(statement, 'https://w3id.org/xapi/virtual-classroom/activity-types/camera')
    && validateCommonProperties(statement)
    && validateVirtualClassroomParent(statement);
  },
  'meeting-screenshare-started': (event, statement) => {
    return validateVerb(statement, 'http://activitystrea.ms/share')
    && validateDefinitionType(statement, 'https://w3id.org/xapi/virtual-classroom/activity-types/screen')
    && validateCommonProperties(statement)
    && validateVirtualClassroomParent(statement);
  },
  'meeting-screenshare-stopped': (event, statement) => {
    return validateVerb(statement, 'http://activitystrea.ms/unshare')
    && validateDefinitionType(statement, 'https://w3id.org/xapi/virtual-classroom/activity-types/screen')
    && validateCommonProperties(statement)
    && validateVirtualClassroomParent(statement);
  },
  'chat-group-message-sent': (event, statement) => {
    return validateVerb(statement, 'https://w3id.org/xapi/acrossx/verbs/posted')
    && validateDefinitionType(statement, 'https://w3id.org/xapi/acrossx/activities/message')
    && validateCommonProperties(statement)
    && validateVirtualClassroomParent(statement);
  },
  'poll-started': (event, statement) => {
    return validateVerb(statement, 'http://adlnet.gov/expapi/verbs/asked')
    && validateDefinitionType(statement, 'http://adlnet.gov/expapi/activities/cmi.interaction')
    && validatePoll(statement)
    && validateCommonProperties(statement)
    && validateVirtualClassroomParent(statement);
  },
  'poll-responded': (event, statement) => {
    return validateVerb(statement, 'http://adlnet.gov/expapi/verbs/answered')
    && validateDefinitionType(statement, 'http://adlnet.gov/expapi/activities/cmi.interaction')
    && validatePoll(statement)
    && validateCommonProperties(statement)
    && validateVirtualClassroomParent(statement)
    && validatePollResponse(statement);
  },
  'user-raise-hand-changed': (event, statement) => {
    const raisedHandVerb = 'https://w3id.org/xapi/virtual-classroom/verbs/reacted';
    const loweredHandVerb = 'https://w3id.org/xapi/virtual-classroom/verbs/unreacted';
    const isRaiseHand = event.data.attributes.user['raise-hand'];
    return validateVerb(statement, isRaiseHand ? raisedHandVerb : loweredHandVerb)
    && validateDefinitionType(statement, 'https://w3id.org/xapi/virtual-classroom/activity-types/virtual-classroom')
    && validateCommonProperties(statement)
    && validateRaiseHandEmoji(statement);
  }
}

const validate = (event, statement) => {
  const eventId = event.data.id;
  const validator = validators[eventId];

  if (!validator) throw new Error(`No validator for eventId '${eventId}'`);

  return validator(event, statement);
}

export {
  mapSamplesToEvents,
  validators,
  validate,
};
