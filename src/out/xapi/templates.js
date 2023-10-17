import { DateTime, Duration } from 'luxon';

export default function getXAPIStatement(event, meeting_data, user_data = null, poll_data = null) {
  const { bbb_origin_server_name,
    object_id,
    meeting_name,
    context_registration,
    session_id,
    planned_duration,
    create_time } = meeting_data;

  const planned_duration_ISO = Duration.fromObject({ minutes: planned_duration }).toISO();
  const create_time_ISO = DateTime.fromMillis(create_time).toUTC().toISO();

  const event_ts = event.data.event.ts;

  if (event.data.id == 'meeting-created'
    || event.data.id == 'meeting-ended'
    || event.data.id == 'user-joined'
    || event.data.id == 'user-left'
    || event.data.id == 'user-audio-voice-enabled'
    || event.data.id == 'user-audio-voice-disabled'
    || event.data.id == "user-audio-muted"
    || event.data.id == "user-audio-unmuted"
    || event.data.id == 'user-cam-broadcast-start'
    || event.data.id == 'user-cam-broadcast-end'
    || event.data.id == 'meeting-screenshare-started'
    || event.data.id == 'meeting-screenshare-stopped'
    || event.data.id == 'chat-group-message-sent'
    || event.data.id == 'poll-started'
    || event.data.id == 'poll-responded') {
    const verbMappings = {
      'meeting-created': 'http://adlnet.gov/expapi/verbs/initialized',
      'meeting-ended': 'http://adlnet.gov/expapi/verbs/terminated',
      'user-joined': 'http://activitystrea.ms/join',
      'user-left': 'http://activitystrea.ms/leave',
      'user-audio-voice-enabled': 'http://adlnet.gov/expapi/verbs/interacted',
      'user-audio-voice-disabled': 'http://adlnet.gov/expapi/verbs/interacted',
      'user-audio-muted': 'http://adlnet.gov/expapi/verbs/interacted',
      'user-audio-unmuted': 'http://adlnet.gov/expapi/verbs/interacted',
      'user-cam-broadcast-start': 'http://adlnet.gov/expapi/verbs/interacted',
      'user-cam-broadcast-end': 'http://adlnet.gov/expapi/verbs/interacted',
      'meeting-screenshare-started': 'http://adlnet.gov/expapi/verbs/interacted',
      'meeting-screenshare-stopped': 'http://adlnet.gov/expapi/verbs/interacted',
      'chat-group-message-sent': 'https://w3id.org/xapi/acrossx/verbs/posted',
      'poll-started': 'http://adlnet.gov/expapi/verbs/asked',
      'poll-responded': 'http://adlnet.gov/expapi/verbs/answered',
    }

    // TODO check for data integrity
    const statement = {
      "actor": {
        "account": {
          "name": user_data?.user_name || "<unknown>",
          "homePage": `https://${bbb_origin_server_name}`
        }
      },
      "verb": {
        "id": verbMappings.hasOwnProperty(event.data.id) ? verbMappings[event.data.id] : null
      },
      "object": {
        "id": `https://${bbb_origin_server_name}/xapi/activities/${object_id}`,
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
      "timestamp": DateTime.fromMillis(event_ts).toUTC().toISO()
    }

    // Custom 'meeting-created' attributes
    if (event.data.id == 'meeting-created') {
      statement.context.extensions["http://id.tincanapi.com/extension/planned-duration"] = planned_duration_ISO
      statement.timestamp = create_time_ISO;
    }

    // Custom 'meeting-ended' attributes
    else if (event.data.id == 'meeting-ended') {
      statement.context.extensions["http://id.tincanapi.com/extension/planned-duration"] = planned_duration_ISO
      statement.result = {
        "duration": Duration.fromMillis(event_ts - create_time).toISO()
      }
    }

    // Custom attributes for multiple interactions
    else if (event.data.id == 'user-audio-voice-enabled'
      || event.data.id == 'user-audio-voice-disabled'
      || event.data.id == "user-audio-muted"
      || event.data.id == "user-audio-unmuted"
      || event.data.id == 'user-cam-broadcast-start'
      || event.data.id == 'user-cam-broadcast-end'
      || event.data.id == 'meeting-screenshare-started'
      || event.data.id == 'meeting-screenshare-stopped') {

      const extension = {
        "user-audio-voice-enabled": "micro-activated",
        "user-audio-voice-disabled": "micro-activated",
        "user-audio-muted": "micro-activated",
        "user-audio-unmuted": "micro-activated",
        "user-cam-broadcast-start": "camera-activated",
        "user-cam-broadcast-end": "camera-activated",
        "meeting-screenshare-started": "screen-shared",
        "meeting-screenshare-stopped": "screen-shared",
      }[event.data.id]

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
      }[event.data.id]

      statement.context.extensions[extension_uri] = extension_enabled;
    }

    // Custom 'user-raise-hand-changed' attributes
    else if (event.data.id == 'user-raise-hand-changed') {
      const extension_uri = 'https://w3id.org/xapi/virtual-classroom/extensions/hand-raised';
      const extension_enabled = event.data.attributes.user["raise-hand"];
      statement.context.extensions[extension_uri] = extension_enabled;
    }

    // Custom 'chat-group-message-sent' attributes
    else if (event.data.id == 'chat-group-message-sent') {
      statement.object = {
        "id": `https://${bbb_origin_server_name}/xapi/activities/${user_data?.msg_object_id}`,
        "definition": {
          "type": "https://w3id.org/xapi/acrossx/activities/message"
        }
      }

      statement.context.contextActivities.parent = [
        {
          "id": `https://${bbb_origin_server_name}/xapi/activities/${object_id}`,
          "definition": {
            "type": "https://w3id.org/xapi/virtual-classroom/activity-types/virtual-classroom"
          }
        }
      ]
      statement.timestamp = user_data?.time;
    }

    // Custom 'poll-started' and 'poll-responded' attributes
    else if (event.data.id == 'poll-started' || event.data.id == 'poll-responded') {
      statement.object = {
        "id": `https://${bbb_origin_server_name}/xapi/activities/${poll_data?.object_id}`,
        "definition": {
          "description": {
            "en": poll_data?.question,
          },
          "type": "http://adlnet.gov/expapi/activities/cmi.interaction",
          "interactionType": "choice",
          "choices": poll_data?.choices,
        }
      }

      statement.context.contextActivities.parent = [
        {
          "id": `https://${bbb_origin_server_name}/xapi/activities/${object_id}`,
          "definition": {
            "type": "https://w3id.org/xapi/virtual-classroom/activity-types/virtual-classroom"
          }
        }
      ]
      if (event.data.id == 'poll-responded') {
        statement.result = {
          "response": event.data.attributes.poll.answerIds.join(','),
        }
      }
    }

    return statement
  }
}
