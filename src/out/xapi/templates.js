import { DateTime, Duration } from 'luxon';

export default function getXAPIStatement(event, meeting_data){
    const { bbb_origin_server_name,
            object_id,
            meeting_name,
            context_registration,
            session_id,
            planned_duration,
            create_time} = meeting_data;

    const planned_duration_ISO = Duration.fromObject({ minutes: planned_duration }).toISO();
    const create_time_ISO = DateTime.fromMillis(create_time).toUTC().toISO();

    const event_ts = event.data.event.ts;

    if(event.data.id == 'meeting-created'){
        return {
            "actor": {
               "account": {
                  "name": "<unknown>",
                  "homePage": `https://${bbb_origin_server_name}`
               }
            },
            "verb": {
               "id": "http://adlnet.gov/expapi/verbs/initialized"
            },
            "object": {
               "id": `https://${bbb_origin_server_name}/xapi/activities/${object_id}`,
               "definition": {
                  "type": "https://w3id.org/xapi/virtual-classroom/activity-types/virtual-classroom",
                  "name": {
                     "en": meeting_name
                  }
               }
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
                  "http://id.tincanapi.com/extension/planned-duration": planned_duration_ISO,
                  "https://w3id.org/xapi/cmi5/context/extensions/sessionid": session_id
               }
            },
            "timestamp": create_time_ISO
         }
    }
    else if(event.data.id == 'meeting-ended'){
        return {
            "actor": {
              "account": {
                "name": "<unknown>",
                "homePage": `https://${bbb_origin_server_name}`
              }
            },
            "verb": {
              "id": "http://adlnet.gov/expapi/verbs/terminated"
            },
            "object": {
              "id": `https://${bbb_origin_server_name}/xapi/activities/${object_id}`,
              "definition": {
                "type": "https://w3id.org/xapi/virtual-classroom/activity-types/virtual-classroom",
                "name": {
                  "en": meeting_name
                }
              }
            },
            "result": {
              "duration": Duration.fromMillis(event_ts - create_time).toISO()
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
                "http://id.tincanapi.com/extension/planned-duration": planned_duration_ISO,
                "https://w3id.org/xapi/cmi5/context/extensions/sessionid": session_id
              }
            },
            "timestamp": DateTime.fromMillis(event_ts).toUTC().toISO()
        }
    }
}