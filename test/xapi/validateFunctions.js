import { validate as validateUUID } from 'uuid';
import { DateTime, Duration } from 'luxon';

const isValidISODate = (dateString) => DateTime.fromISO(dateString, { zone: 'utc', setZone: true }).isValid;
const isValidISODuration = (durationString) => Duration.fromISO(durationString).isValid;

const checkCondition = (condition, errorMsg) => {
  if (condition === true) return true
  else throw new Error(errorMsg)
};

const validateVerb = (statement, verbId) => checkCondition(
  statement.verb.id === verbId,
  `verb.id '${statement.verb.id}' should be '${verbId}'`
);

const validateDefinitionType = (statement, definitionType) => checkCondition(
  statement.object.definition.type === definitionType,
  `object.definition.type '${statement.object.definition.type}' should be '${definitionType}'`
);

const validateCommonProperties = statement => checkCondition(
  statement.context.contextActivities.category[0].id == 'https://w3id.org/xapi/virtual-classroom',
  `context.contextActivities.category[0].id '${statement.context.contextActivities.category[0].id}' \
should be 'https://w3id.org/xapi/virtual-classroom'`
) && checkCondition(statement.context.contextActivities.category[0].definition.type == 'http://adlnet.gov/expapi/activities/profile',
  `context.contextActivities.category[0].definition.type '${statement.context.contextActivities.category[0].definition.type}' \
should be 'http://adlnet.gov/expapi/activities/profile'`
) && checkCondition(validateUUID(statement.object.id.substring(statement.object.id.length - 36)),
  `object.id '${statement.object.id}' should end in an UUID`
)
&& checkCondition(validateUUID(statement.context.registration),
  `context.registration '${statement.context.registration}' should be an UUID`)
&& checkCondition(validateUUID(statement.context.extensions['https://w3id.org/xapi/cmi5/context/extensions/sessionid']),
  `context.extensions['https://w3id.org/xapi/cmi5/context/extensions/sessionid' \
'${statement.context.extensions['https://w3id.org/xapi/cmi5/context/extensions/sessionid']}' should be an UUID`)
&& checkCondition(Object.prototype.hasOwnProperty.call(statement, 'actor'), `actor should be present`)
&& checkCondition(isValidISODate(statement.timestamp), 'timestamp should be a valid ISO date');

const validatePlannedDuration = statement => checkCondition(
  isValidISODuration(statement.context.extensions['http://id.tincanapi.com/extension/planned-duration']),
  `context.extensions['http://id.tincanapi.com/extension/planned-duration'] \
'${statement.context.extensions['http://id.tincanapi.com/extension/planned-duration']}' \
should be a valid ISO duration`
);

const validateResultDuration = statement => checkCondition(
  isValidISODuration(statement.result.duration),
  `result.duration '${statement.result.duration}' should be a valid ISO duration`
);

const validateVirtualClassroomParent = statement => checkCondition(
  statement.context.contextActivities.parent[0].definition.type === 'https://w3id.org/xapi/virtual-classroom/activity-types/virtual-classroom',
  `context.contextActivities.parent[0].definition.type '${statement.context.contextActivities.parent[0].definition.type}' \
should be 'https://w3id.org/xapi/virtual-classroom/activity-types/virtual-classroom'`)
&& checkCondition(
  validateUUID(statement.context.contextActivities.parent[0].id.substring(statement.context.contextActivities.parent[0].id.length - 36)),
  `context.contextActivities.parent[0].id '${statement.context.contextActivities.parent[0].id}' should end in an UUID`)

const validatePoll = statement => checkCondition(statement.object.definition.interactionType === 'choice',
  `object.definition.interactionType '${statement.object.definition.interactionType}' should be 'choice'`)
  && checkCondition(Array.isArray(statement.object.definition.choices),
    `object.definition.choices '${statement.object.definition.choices}' should be an Array`)

const validatePollResponse = statement => checkCondition(
  Object.prototype.hasOwnProperty.call(statement, 'result'),
  `statement should have a 'result' property`
) && checkCondition(
  Object.prototype.hasOwnProperty.call(statement.result, 'response'),
  `result should have a 'response'`
)

const validateRaiseHandEmoji = statement => checkCondition(
  statement.result.extensions['https://w3id.org/xapi/virtual-classroom/extensions/emoji'] === 'U+1F590',
  `result.extensions['https://w3id.org/xapi/virtual-classroom/extensions/emoji'] \
'${statement.result.extensions['https://w3id.org/xapi/virtual-classroom/extensions/emoji']}' should be 'U+1F590'`
);

export {
  validateVerb,
  validateDefinitionType,
  validateCommonProperties,
  validatePlannedDuration,
  validateResultDuration,
  validateVirtualClassroomParent,
  validatePoll,
  validatePollResponse,
  validateRaiseHandEmoji,
};
