import getXAPIStatement from './templates.js';
import { v5 as uuidv5 } from 'uuid';
import { DateTime } from 'luxon';
import fetch from 'node-fetch';

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
    }

    async postToLRS(statement) {
        const { lrs_endpoint, lrs_username, lrs_password } = this.config.lrs;

        const headers = {
            'Authorization': `Basic ${Buffer.from(lrs_username + ':' + lrs_password).toString('base64')}`,
            'Content-Type': 'application/json',
            'X-Experience-API-Version': '1.0.0',
        }

        const requestOptions = {
            method: 'POST',
            body: JSON.stringify(statement),
            headers,
        };

        const xAPIEndpoint = new URL('xAPI/statements', lrs_endpoint);

        try {
            const response = await fetch(xAPIEndpoint, requestOptions);
            const { status } = response;
            const data = await response.json();
            this.logger.debug('OutXAPI.res.status:', { status, data });
        } catch (err) {
            this.logger.debug('OutXAPI.err:', err);
        }
    }

    async onEvent(event, raw) {
        // TODO: return promise earlier to avoid holding the queue
        const meeting_data = {
            internal_meeting_id: event.data.attributes.meeting['internal-meeting-id'],
            external_meeting_id: event.data.attributes.meeting['external-meeting-id'],
        }

        const uuid_namespace = this.config.uuid_namespace;

        meeting_data.session_id = uuidv5(meeting_data.internal_meeting_id, uuid_namespace);
        meeting_data.object_id = uuidv5(meeting_data.external_meeting_id, uuid_namespace);

        let XAPIStatement;

        // if meeting-created event, set meeting_data on redis
        if (event.data.id == 'meeting-created') {
            const serverDomain = this.config.server.domain;
            meeting_data.bbb_origin_server_name = serverDomain;
            meeting_data.planned_duration = event.data.attributes.meeting.duration;
            meeting_data.create_time = event.data.attributes.meeting['create-time'];
            meeting_data.meeting_name = event.data.attributes.meeting.name;

            const meeting_create_day = DateTime.fromMillis(meeting_data.create_time).toFormat('yyyyMMdd');
            const external_key = `${meeting_data.external_meeting_id}_${meeting_create_day}`;

            meeting_data.context_registration = uuidv5(external_key, uuid_namespace);

            await this.meetingStorage.addOrUpdateMeetingData(meeting_data);
            XAPIStatement = getXAPIStatement(event, meeting_data);
        }
        // if not meeting-created event, read meeting_data from redis
        else {
            const meeting_data_storage = await this.meetingStorage.getMeetingData(meeting_data.internal_meeting_id);
            Object.assign(meeting_data, meeting_data_storage);

            if (event.data.id == 'meeting-ended') {
                XAPIStatement = getXAPIStatement(event, meeting_data);
            }
            // if user-joined event, set user_data on redis
            else if (event.data.id == 'user-joined') {
                const user_data = {
                    internal_user_id: event.data.attributes.user['internal-user-id'],
                    user_name: event.data.attributes.user.name,
                }
                await this.userStorage.addOrUpdateUserData(user_data);
                XAPIStatement = getXAPIStatement(event, meeting_data, user_data);
            }
            // if not user-joined user event, read user_data on redis
            else if (
                event.data.id == 'user-left'
                || event.data.id == 'user-audio-voice-enabled'
                || event.data.id == 'user-audio-voice-disabled'
                || event.data.id == 'user-cam-broadcast-start'
                || event.data.id == 'user-cam-broadcast-end'
                || event.data.id == 'meeting-screenshare-started'
                || event.data.id == 'meeting-screenshare-stopped'
                || event.data.id == 'user-raise-hand-changed') {
                const internal_user_id = event.data.attributes.user?.['internal-user-id'];
                const user_data = internal_user_id ? await this.userStorage.getUserData(internal_user_id) : null;
                XAPIStatement = getXAPIStatement(event, meeting_data, user_data);
            }
            else if (event.data.id == 'chat-group-message-sent') {
                const user_data = event.data.attributes['chat-message']?.sender;
                const msg_key = `${user_data?.internal_user_id}_${user_data?.time}`;
                user_data.msg_object_id = uuidv5(msg_key, uuid_namespace);
                XAPIStatement = getXAPIStatement(event, meeting_data, user_data);
            }
            else if (event.data.id == 'poll-started' || event.data.id == 'poll-responded') {
                const internal_user_id = event.data.attributes.user?.['internal-user-id'];
                const user_data = internal_user_id ? await this.userStorage.getUserData(internal_user_id) : null;
                const object_id = uuidv5(event.data.attributes.poll.id, uuid_namespace);
                let poll_data;

                if (event.data.id == 'poll-started') {
                    var choices = (event.data.attributes.poll.answers.map(a => {
                        return { id: a.id.toString(), "description": { "en": a.key } }
                    }));
                    poll_data = {
                        object_id,
                        question: event.data.attributes.poll.question,
                        choices,
                    }
                    await this.pollStorage.addOrUpdatePollData(poll_data);

                }
                else if (event.data.id == 'poll-responded') {
                    poll_data = object_id ? await this.pollStorage.getPollData(object_id) : null;
                    poll_data.choices = poll_data.choices.map(item => {
                        const parsedItem = JSON.parse(item);
                        const description = JSON.parse(parsedItem.description);
                        return {
                            id: JSON.parse(item).id,
                            description: { en: description.en }
                        };
                    });
                }
                XAPIStatement = getXAPIStatement(event, meeting_data, user_data, poll_data);
            }
        }
        await this.postToLRS(XAPIStatement);
    }
}