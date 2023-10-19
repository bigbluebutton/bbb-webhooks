import { DateTime, Duration } from 'luxon';

/**
 *
 * @param event
 * @param meeting_data
 * @param user_data
 * @param poll_data
 */
export default function getXAPIStatement(event, meeting_data, user_data = null, poll_data = null) {
  const { server_domain,
    object_id,
    meeting_name,
    context_registration,
    session_id,
    planned_duration,
    create_time } = meeting_data;

  const planned_duration_ISO = Duration.fromObject({ minutes: planned_duration }).toISO();
  const create_time_ISO = DateTime.fromMillis(create_time).toUTC().toISO();

  const eventId = event.data.id;
  const eventTs = event.data.event.ts;

  const session_parent = [
    {
      "id": `https://${server_domain}/xapi/activities/${object_id}`,
      "definition": {
        "type": "https://w3id.org/xapi/virtual-classroom/activity-types/virtual-classroom"
      }
    }
  ]

  if (eventId == 'meeting-created'
    || eventId == 'meeting-ended'
    || eventId == 'user-joined'
    || eventId == 'user-left'
    || eventId == 'user-audio-voice-enabled'
    || eventId == 'user-audio-voice-disabled'
    || eventId == "user-audio-muted"
    || eventId == "user-audio-unmuted"
    || eventId == 'user-cam-broadcast-start'
    || eventId == 'user-cam-broadcast-end'
    || eventId == 'meeting-screenshare-started'
    || eventId == 'meeting-screenshare-stopped'
    || eventId == 'chat-group-message-sent'
    || eventId == 'poll-started'
    || eventId == 'poll-responded'
    || eventId == 'user-raise-hand-changed') {
    const verbMappings = {
      'meeting-created': 'http://adlnet.gov/expapi/verbs/initialized',
      'meeting-ended': 'http://adlnet.gov/expapi/verbs/terminated',
      'user-joined': 'http://activitystrea.ms/join',
      'user-left': 'http://activitystrea.ms/leave',
      'user-audio-voice-enabled': 'http://activitystrea.ms/start',
      'user-audio-voice-disabled': 'https://w3id.org/xapi/virtual-classroom/verbs/stopped',
      'user-audio-muted': 'https://w3id.org/xapi/virtual-classroom/verbs/stopped',
      'user-audio-unmuted': 'http://activitystrea.ms/start',
      'user-cam-broadcast-start': 'http://activitystrea.ms/start',
      'user-cam-broadcast-end': 'https://w3id.org/xapi/virtual-classroom/verbs/stopped',
      'meeting-screenshare-started': 'http://activitystrea.ms/share',
      'meeting-screenshare-stopped': 'http://activitystrea.ms/unshare',
      'chat-group-message-sent': 'https://w3id.org/xapi/acrossx/verbs/posted',
      'poll-started': 'http://adlnet.gov/expapi/verbs/asked',
      'poll-responded': 'http://adlnet.gov/expapi/verbs/answered',
    }

    // TODO check for data integrity
    const statement = {
      "actor": {
        "account": {
          "name": user_data?.user_name || "<unknown>",
          "homePage": `https://${server_domain}`
        }
      },
      "verb": {
        "id": Object.prototype.hasOwnProperty.call(verbMappings, eventId) ? verbMappings[eventId] : null
      },
      "object": {
        "id": `https://${server_domain}/xapi/activities/${object_id}`,
        "definition": {
          "type": "https://w3id.org/xapi/virtual-classroom/activity-types/virtual-classroom",
          "name": {
            "en": meeting_name
          }
        },
      },
      "context": {
        "registration": context_registration,
        "contextActivities": {
          "category": [
            {
              "id": "https://w3id.org/xapi/virtual-classroom",
              "definition": {
                "type": "http://adlnet.gov/expapi/activities/profile"
              }
            }
          ]
        },
        "extensions": {
          "https://w3id.org/xapi/cmi5/context/extensions/sessionid": session_id
        }
      },
      "timestamp": DateTime.fromMillis(eventTs).toUTC().toISO()
    }

    // Custom 'meeting-created' attributes
    if (eventId == 'meeting-created') {
      statement.context.extensions["http://id.tincanapi.com/extension/planned-duration"] = planned_duration_ISO
      statement.timestamp = create_time_ISO;
    }

    // Custom 'meeting-ended' attributes
    else if (eventId == 'meeting-ended') {
      statement.context.extensions["http://id.tincanapi.com/extension/planned-duration"] = planned_duration_ISO
      statement.result = {
        "duration": Duration.fromMillis(eventTs - create_time).toISO()
      }
    }

    // Custom attributes for multiple interactions
    else if (eventId == 'user-audio-voice-enabled'
      || eventId == 'user-audio-voice-disabled'
      || eventId == "user-audio-muted"
      || eventId == "user-audio-unmuted"
      || eventId == 'user-cam-broadcast-start'
      || eventId == 'user-cam-broadcast-end'
      || eventId == 'meeting-screenshare-started'
      || eventId == 'meeting-screenshare-stopped') {

      const extension = {
        "user-audio-voice-enabled": "micro-activated",
        "user-audio-voice-disabled": "micro-activated",
        "user-audio-muted": "micro-activated",
        "user-audio-unmuted": "micro-activated",
        "user-cam-broadcast-start": "camera-activated",
        "user-cam-broadcast-end": "camera-activated",
        "meeting-screenshare-started": "screen-shared",
        "meeting-screenshare-stopped": "screen-shared",
      }[eventId]

      const extension_uri = `https://w3id.org/xapi/virtual-classroom/extensions/${extension}`;

      const extension_enabled = {
        "user-audio-voice-enabled": "true",
        "user-audio-voice-disabled": "false",
        "user-audio-muted": "false",
        "user-audio-unmuted": "true",
        "user-cam-broadcast-start": "true",
        "user-cam-broadcast-end": "false",
        "meeting-screenshare-started": "true",
        "meeting-screenshare-stopped": "false",
      }[eventId]

      statement.context.extensions[extension_uri] = extension_enabled;
      // TODO: implement new format for multimedia statements
      // statement.context.contextActivities.parent = session_parent;
    }

    // Custom 'user-raise-hand-changed' attributes
    else if (eventId == 'user-raise-hand-changed') {
      const raisedHandVerb = "https://w3id.org/xapi/virtual-classroom/verbs/reacted";
      const loweredHandVerb = "https://w3id.org/xapi/virtual-classroom/verbs/unreacted";
      const isRaiseHand = event.data.attributes.user["raise-hand"];
      statement.verb = isRaiseHand ? raisedHandVerb : loweredHandVerb;
      statement.result = {
        "extensions": {
          "https://w3id.org/xapi/virtual-classroom/extensions/emoji": "U+1F590"
        }
      }
    }

    // Custom 'chat-group-message-sent' attributes
    else if (eventId == 'chat-group-message-sent') {
      statement.object = {
        "id": `https://${server_domain}/xapi/activities/${user_data?.msg_object_id}`,
        "definition": {
          "type": "https://w3id.org/xapi/acrossx/activities/message"
        }
      }

      statement.context.contextActivities.parent = session_parent;
      statement.timestamp = user_data?.time;
    }

    // Custom 'poll-started' and 'poll-responded' attributes
    else if (eventId == 'poll-started' || eventId == 'poll-responded') {
      statement.object = {
        "id": `https://${server_domain}/xapi/activities/${poll_data?.object_id}`,
        "definition": {
          "description": {
            "en": poll_data?.question,
          },
          "type": "http://adlnet.gov/expapi/activities/cmi.interaction",
          "interactionType": "choice",
          "choices": poll_data?.choices,
        }
      }

      statement.context.contextActivities.parent = session_parent;
      if (eventId == 'poll-responded') {
        statement.result = {
          "response": event.data.attributes.poll.answerIds.join(','),
        }
      }
    }

    return statement
  }
  else return null;
}
