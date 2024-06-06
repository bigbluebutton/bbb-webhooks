import getXAPIStatement from "./templates.js";
import decryptStr from "./decrypt.js"
import { v5 as uuidv5 } from "uuid";
import { DateTime } from "luxon";
import fetch from "node-fetch";

// XAPI will listen for events on redis coming from BigBlueButton,
// generate xAPI statements and send to a LRS
export default class XAPI {
  constructor(context, config, meetingStorage, userStorage, pollStorage) {
    this.context = context;
    this.logger = context.getLogger();
    this.config = config;
    this.meetingStorage = meetingStorage;
    this.userStorage = userStorage;
    this.pollStorage = pollStorage;
    this.validEvents = [
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
  }

  _uuid(payload) {
    return uuidv5( payload, this.config.uuid_namespace );
  }

  async postToLRS(statement, meeting_data) {
    const lrs_username = meeting_data.lrs_username || this.config.lrs?.lrs_username;
    const lrs_password = meeting_data.lrs_password || this.config.lrs?.lrs_password;
    const lrs_endpoint = meeting_data.lrs_endpoint || this.config.lrs?.lrs_endpoint;
    const lrs_token = meeting_data.lrs_token;
    const headers = {
      Authorization: `Basic ${Buffer.from(
        lrs_username + ":" + lrs_password
      ).toString("base64")}`,
      "Content-Type": "application/json",
      "X-Experience-API-Version": "1.0.0",
    };

    if (lrs_token) headers.Authorization = `Bearer ${lrs_token}`

    const requestOptions = {
      method: "POST",
      body: JSON.stringify(statement),
      headers,
    };

    // Remove /xapi(/)(statements)(/) from the end of the lrs_endpoint to ensure the correct endpoint is used
    const fixed_lrs_endpoint = lrs_endpoint.replace(/\/xapi\/?(statements)?\/?$/i, '');
    const xAPIEndpoint = new URL("xAPI/statements", fixed_lrs_endpoint);

    try {
      const response = await fetch(xAPIEndpoint, requestOptions);
      const { status } = response;
      const data = await response.json();
      this.logger.debug("OutXAPI.res.status:", { status, data });
      if (status < 200 || status >= 400){
        this.logger.debug("OutXAPI.res.post_fail:", { statement });
      }
    } catch (err) {
      this.logger.error("OutXAPI.res.err:", err);
    }
  }

  async onEvent(event) {
    const eventId = event.data.id;

    if (this.validEvents.indexOf(eventId) <= -1) return Promise.resolve();

    const meeting_data = {
      internal_meeting_id: event.data.attributes.meeting["internal-meeting-id"],
      external_meeting_id: event.data.attributes.meeting["external-meeting-id"],
      server_domain: this.config.server.domain,
    };

    meeting_data.session_id = this._uuid(meeting_data.internal_meeting_id);
    meeting_data.object_id = this._uuid(meeting_data.external_meeting_id);

    let XAPIStatement = null;

    return new Promise(async (resolve, reject) => {
      // if meeting-created event, set meeting_data on redis
      if (eventId == "meeting-created") {
        meeting_data.planned_duration = event.data.attributes.meeting.duration;
        meeting_data.create_time = event.data.attributes.meeting["create-time"];
        meeting_data.meeting_name = event.data.attributes.meeting.name;
        meeting_data.xapi_enabled = event.data.attributes.meeting.metadata?.["xapi-enabled"] !== 'false' ? 'true' : 'false';
        meeting_data.create_end_actor_name = event.data.attributes.meeting.metadata?.["xapi-create-end-actor-name"] || "<unknown>";

        const lrs_payload = event.data.attributes.meeting.metadata?.["secret-lrs-payload"];
        let lrs_endpoint = '';
        let lrs_token = '';
        let lrs_username = '';
        let lrs_password = '';

        // if lrs_payload exists, decrypts with the server secret and extracts lrs_endpoint and lrs_token from it
        if (lrs_payload !== undefined){
          try {
            const payload_text = decryptStr(lrs_payload, this.config.server.secret);
            ({
              lrs_endpoint,
              lrs_token,
              lrs_username,
              lrs_password,
            } = JSON.parse(payload_text));
          } catch (error) {
            this.logger.error("OutXAPI.onEvent: invalid lrs_payload", {
              error: error.stack,
              lrs_payload
            });
            return reject(error);
          }
        }

        meeting_data.lrs_endpoint = lrs_endpoint;
        meeting_data.lrs_token = lrs_token;
        meeting_data.lrs_username = lrs_username;
        meeting_data.lrs_password = lrs_password;

        const meeting_create_day = DateTime.fromMillis(
          meeting_data.create_time
        ).toFormat("yyyyMMdd");
        const external_key = `${meeting_data.external_meeting_id}_${meeting_create_day}`;

        meeting_data.context_registration = this._uuid(external_key);
        //set meeting_data on redis
        try {
          await this.meetingStorage.addOrUpdateMeetingData(meeting_data);
          resolve();
        } catch (error) {
          return reject(error);
        }

        // Do not proceed if xapi_enabled === 'false' was passed in the metadata
        if (meeting_data.xapi_enabled === 'false') {
          return resolve();
        }

        XAPIStatement = getXAPIStatement(event, meeting_data);
      }
      // if not meeting-created event, read meeting_data from redis
      else {
        const meeting_data_storage = await this.meetingStorage.getMeetingData(
          meeting_data.internal_meeting_id
        );
        // Do not proceed if meeting_data is not found on the storage
        if (meeting_data_storage === undefined) {
          return reject(new Error('meeting data not found'));
        }
        Object.assign(meeting_data, meeting_data_storage);

        // Do not proceed if xapi_enabled === 'false' was passed in the metadata
        if (meeting_data.xapi_enabled === 'false') {
          return resolve();
        }

        if (eventId == "meeting-ended") {
          resolve();
          XAPIStatement = getXAPIStatement(event, meeting_data);
        }
        // if user-joined event, set user_data on redis
        else if (eventId == "user-joined") {
          const external_user_id = event.data.attributes.user["internal-user-id"];
          const user_data = {
            external_user_id,
            name: event.data.attributes.user.name,
          };
          try {
            await this.userStorage.addOrUpdateUserData(user_data);
            resolve();
          } catch (error) {
            return reject(error);
          }
          XAPIStatement = getXAPIStatement(event, meeting_data, user_data);
        }
        // if not user-joined user event, read user_data on redis
        else if (
          eventId == "user-left" ||
          eventId == "user-audio-voice-enabled" ||
          eventId == "user-audio-voice-disabled" ||
          eventId == "user-audio-muted" ||
          eventId == "user-audio-unmuted" ||
          eventId == "user-cam-broadcast-start" ||
          eventId == "user-cam-broadcast-end" ||
          eventId == "meeting-screenshare-started" ||
          eventId == "meeting-screenshare-stopped" ||
          eventId == "user-raise-hand-changed"
        ) {
          resolve();
          // If mic is not enabled in "user-audio-voice-enabled" event, do not send statement
          if (eventId == "user-audio-voice-enabled" &&
            (event.data.attributes.user["listening-only"] == true ||
              event.data.attributes.user.muted == true ||
              event.data.attributes.user["sharing-mic"] == false)) {
            return;
          }
          const external_user_id = event.data.attributes.user?.["internal-user-id"];

          const user_data = external_user_id
            ? await this.userStorage.getUserData(external_user_id)
            : undefined;
          // Do not proceed if user_data is requested but not found on the storage
          if (user_data === undefined) {
            return;
          }
          const media = {
            "user-audio-voice-enabled": "micro",
            "user-audio-voice-disabled": "micro",
            "user-audio-muted": "micro",
            "user-audio-unmuted": "micro",
            "user-cam-broadcast-start": "camera",
            "user-cam-broadcast-end": "camera",
            "meeting-screenshare-started": "screen",
            "meeting-screenshare-stopped": "screen",
          }[eventId]

          if (media !== undefined){
            user_data[`user_${media}_object_id`] = this._uuid(`${external_user_id}_${media}`);
          }

          XAPIStatement = getXAPIStatement(event, meeting_data, user_data);
          // Chat message
        } else if (eventId == "chat-group-message-sent") {
          resolve();
          const user_data = event.data.attributes["chat-message"]?.sender;
          const msg_key = `${user_data?.external_user_id}_${user_data?.time}`;
          user_data.msg_object_id = this._uuid(msg_key);
          XAPIStatement = getXAPIStatement(event, meeting_data, user_data);
          // Poll events
        } else if (
          eventId == "poll-started" ||
          eventId == "poll-responded"
        ) {
          if (eventId == "poll-responded") {
            resolve();
          }
          const external_user_id =
            event.data.attributes.user?.["internal-user-id"];
          const user_data = external_user_id
            ? await this.userStorage.getUserData(external_user_id)
            : null;
          const object_id = this._uuid(event.data.attributes.poll.id);
          let poll_data;

          if (eventId == "poll-started") {
            var choices = event.data.attributes.poll.answers.map((a) => {
              return { id: a.id.toString(), description: { en: a.key } };
            });
            poll_data = {
              object_id,
              question: event.data.attributes.poll.question,
              choices,
            };
            //set poll_data on redis
            try {
              await this.pollStorage.addOrUpdatePollData(poll_data);
              resolve();
            } catch (error) {
              return reject(error);
            }
          } else if (eventId == "poll-responded") {
            poll_data = object_id
              ? await this.pollStorage.getPollData(object_id)
              : undefined;
            // Do not proceed if poll_data is requested but not found on the storage
            if (poll_data === undefined) {
              return;
            }
          }
          XAPIStatement = getXAPIStatement(
            event,
            meeting_data,
            user_data,
            poll_data
          );
        }
      }
      if (XAPIStatement !== null && meeting_data.xapi_enabled === 'true') {
        await this.postToLRS(XAPIStatement, meeting_data);
      }
    });
  }
}
