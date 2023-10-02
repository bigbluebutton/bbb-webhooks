import { StorageCompartmentKV } from '../../db/redis/base-storage.js';

export default class XAPICompartment extends StorageCompartmentKV {
    constructor(client, prefix, setId, options = {}) {
        super(client, prefix, setId, options);
    }

    async addOrUpdateMeetingData(meeting_data) {
        const {internal_meeting_id, context_registration, bbb_origin_server_name,
            planned_duration, create_time, meeting_name} = meeting_data;

        const payload = {
            internal_meeting_id,
            context_registration,
            bbb_origin_server_name,
            planned_duration,
            create_time,
            meeting_name,
        };

        const mapping = await this.save(payload, {
            alias: internal_meeting_id,
        });
        this.logger.info(`added user mapping to the list ${internal_meeting_id}: ${mapping.print()}`);

        return mapping;
    }

    async getMeetingData(internal_meeting_id) {
        const meeting_data = this.findByField('internal_meeting_id', internal_meeting_id);
        return (meeting_data != null ? meeting_data.payload : undefined);
    }

    // Initializes global methods for this model.
    initialize() {
        // return this.resync();
        return;
    }
}