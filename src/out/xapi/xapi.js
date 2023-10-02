import getXAPIStatement from './templates.js';
import { v5 as uuidv5 } from 'uuid';
import { DateTime } from 'luxon';
import fetch from 'node-fetch';

// XAPI will listen for events on redis coming from BigBlueButton,
// generate xAPI statements and send to a LRS
export default class XAPI {
    constructor(context, config, meetingStorage) {
      this.context = context;
      this.logger = context.getLogger();
      this.config = config;
      this.meetingStorage = meetingStorage;
    }

    async postToLRS(statement){
        const {url, username, password} = this.config.xapi.lrs;

        const headers = {
            "Authorization": `Basic ${Buffer.from(username + ":" + password).toString('base64')}`,
            "Content-Type": "application/json",
            "X-Experience-API-Version": "1.0.0",
        }

        const requestOptions = {
            method: "POST",
            body: JSON.stringify(statement),
            headers,
        };
        
        const xAPIEndpoint = new URL("xAPI/statements", url);

        try {
            const response = await fetch(xAPIEndpoint, requestOptions);
            const { status } = response; 
            const data = await response.json();
            this.logger.debug('OutXAPI.res.status:', {status, data} );
        } catch (err) {
        // handle error
        this.logger.debug('OutXAPI.err:', err );
        }
    }

    async onEvent(event, raw) {
        const meeting_data = {
            internal_meeting_id: event.data.attributes.meeting["internal-meeting-id"],
            external_meeting_id: event.data.attributes.meeting["external-meeting-id"],
            uuid_namespace: this.config.xapi.uuid_namespace
        }

        meeting_data.session_id = uuidv5(meeting_data.internal_meeting_id, meeting_data.uuid_namespace);
        meeting_data.object_id = uuidv5(meeting_data.external_meeting_id, meeting_data.uuid_namespace);

        // if meeting-created event, set parameters
        if (event.data.id == 'meeting-created') {
            meeting_data.bbb_origin_server_name =  event.data.attributes.meeting.metadata["bbb-origin-server-name"];
            meeting_data.planned_duration = event.data.attributes.meeting.duration;
            meeting_data.create_time = event.data.attributes.meeting["create-time"];
            meeting_data.meeting_name = event.data.attributes.meeting.name;

            const meeting_create_day = DateTime.fromMillis(meeting_data.create_time).toFormat('yyyyMMdd');
            const external_key = `${meeting_data.external_meeting_id}_${meeting_create_day}`;

            meeting_data.context_registration = uuidv5(external_key, meeting_data.uuid_namespace); 

            await this.meetingStorage.addOrUpdateMeetingData(meeting_data);
            const XAPIStatement = getXAPIStatement(event, meeting_data);
            // const meeting_data_storage = await this.meetingStorage.getMeetingData(meeting_data.internal_meeting_id);
            await this.postToLRS(XAPIStatement);
        }
        // for other events, read parameters from redis
        else {
            // this.logger.debug('OutXAPI.meeting_ended_data:', {int_meet_id: meeting_data.internal_meeting_id} );
            const meeting_data_storage = await this.meetingStorage.getMeetingData(meeting_data.internal_meeting_id);
            Object.assign(meeting_data, meeting_data_storage);

            if (event.data.id == 'meeting-ended'){
                const XAPIStatement = getXAPIStatement(event, meeting_data);
                await this.postToLRS(XAPIStatement);
            }
        }

    }
}