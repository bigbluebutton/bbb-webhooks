import { StorageCompartmentKV } from '../../db/redis/base-storage.js';

export class meetingCompartment extends StorageCompartmentKV {
  constructor(client, prefix, setId, options = {}) {
    super(client, prefix, setId, options);
  }

  async addOrUpdateMeetingData(meeting_data) {
    const { internal_meeting_id, context_registration, planned_duration,
      create_time, meeting_name, xapi_enabled, create_end_actor_name,
      lrs_payload,
    } = meeting_data;

    const payload = {
      internal_meeting_id,
      context_registration,
      planned_duration,
      create_time,
      meeting_name,
      xapi_enabled,
      create_end_actor_name,
      lrs_payload,
    };

    const mapping = await this.save(payload, {
      alias: internal_meeting_id,
    });
    this.logger.info(`added meeting data to the list ${internal_meeting_id}: ${mapping.print()}`);

    return mapping;
  }

  async getMeetingData(internal_meeting_id) {
    const meeting_data = this.findByField('internal_meeting_id', internal_meeting_id);
    return (meeting_data != null ? meeting_data.payload : undefined);
  }

  // Initializes global methods for this model.
  initialize() {
    return;
  }
}

export class userCompartment extends StorageCompartmentKV {
  constructor(client, prefix, setId, options = {}) {
    super(client, prefix, setId, options);
  }

  async addOrUpdateUserData(user_data) {
    const { external_user_id, name } = user_data;

    const payload = {
      external_user_id,
      name,
    };

    const mapping = await this.save(payload, {
      alias: external_user_id,
    });
    this.logger.info(`added user data to the list ${external_user_id}: ${mapping.print()}`);

    return mapping;
  }

  async getUserData(external_user_id) {
    const user_data = this.findByField('external_user_id', external_user_id);
    return (user_data != null ? user_data.payload : undefined);
  }

  // Initializes global methods for this model.
  initialize() {
    return;
  }
}

export class pollCompartment extends StorageCompartmentKV {
  constructor(client, prefix, setId, options = {}) {
    super(client, prefix, setId, options);
  }

  async addOrUpdatePollData(poll_data) {
    const { object_id, question, choices } = poll_data;

    const payload = {
      object_id,
      question,
      choices,
    };

    const mapping = await this.save(payload, {
      alias: object_id,
    });
    this.logger.info(`added poll data to the list ${object_id}: ${mapping.print()}`);

    return mapping;
  }

  async getPollData(object_id) {
    const poll_data = this.findByField('object_id', object_id);
    return (poll_data != null ? poll_data.payload : undefined);
  }

  // Initializes global methods for this model.
  initialize() {
    return;
  }
}
