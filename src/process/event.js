import { newLogger } from '../common/logger.js';
import IDMapping from '../db/redis/id-mapping.js';
import UserMapping from '../db/redis/user-mapping.js';

const logger = newLogger('webhook-event');

export default class WebhooksEvent {
  static OUTPUT_EVENTS = [
    "meeting-created",
    "meeting-ended",
    "meeting-recording-started",
    "meeting-recording-stopped",
    "meeting-recording-unhandled",
    "meeting-screenshare-started",
    "meeting-screenshare-stopped",
    "meeting-presentation-changed",
    "user-joined",
    "user-left",
    "user-audio-voice-enabled",
    "user-audio-voice-disabled",
    "user-audio-muted",
    "user-audio-unmuted",
    "user-audio-unhandled",
    "user-cam-broadcast-start",
    "user-cam-broadcast-end",
    "user-presenter-assigned",
    "user-presenter-unassigned",
    "user-emoji-changed",
    "user-raise-hand-changed",
    "chat-group-message-sent",
    "rap-published",
    "rap-unpublished",
    "rap-deleted",
    "pad-content",
    "rap-archive-started",
    "rap-archive-ended",
    "rap-sanity-started",
    "rap-sanity-ended",
    "rap-post-archive-started",
    "rap-post-archive-ended",
    "rap-process-started",
    "rap-process-ended",
    "rap-post-process-started",
    "rap-post-process-ended",
    "rap-publish-started",
    "rap-publish-ended",
    "rap-post-publish-started",
    "rap-post-publish-ended",
    "poll-started",
    "poll-responded",
  ];

  static RAW = {
    MEETING_EVENTS: [
      "MeetingCreatedEvtMsg",
      "MeetingDestroyedEvtMsg",
      "ScreenshareRtmpBroadcastStartedEvtMsg",
      "ScreenshareRtmpBroadcastStoppedEvtMsg",
      "SetCurrentPresentationEvtMsg",
      "RecordingStatusChangedEvtMsg",
    ],
    USER_EVENTS: [
      "UserJoinedMeetingEvtMsg",
      "UserLeftMeetingEvtMsg",
      "UserMutedVoiceEvtMsg",
      "UserJoinedVoiceConfToClientEvtMsg",
      "UserLeftVoiceConfToClientEvtMsg",
      "PresenterAssignedEvtMsg",
      "PresenterUnassignedEvtMsg",
      "UserBroadcastCamStartedEvtMsg",
      "UserBroadcastCamStoppedEvtMsg",
      "UserEmojiChangedEvtMsg",
      "UserReactionEmojiChangedEvtMsg",
      // 2.7+
      "UserRaiseHandChangedEvtMsg",
    ],
    CHAT_EVENTS: [
      "GroupChatMessageBroadcastEvtMsg",
    ],
    RAP_EVENTS: [
      "PublishedRecordingSysMsg",
      "UnpublishedRecordingSysMsg",
      "DeletedRecordingSysMsg",
    ],
    COMP_RAP_EVENTS: [
      "archive_started",
      "archive_ended",
      "sanity_started",
      "sanity_ended",
      "post_archive_started",
      "post_archive_ended",
      "process_started",
      "process_ended",
      "post_process_started",
      "post_process_ended",
      "publish_started",
      "publish_ended",
      "post_publish_started",
      "post_publish_ended",
      "published",
      "unpublished",
      "deleted",
    ],
    PAD_EVENTS: [
      "PadContentEvtMsg"
    ],
    POLL_EVENTS: [
      "PollStartedEvtMsg",
      "UserRespondedToPollRespMsg",
    ],
  }

  constructor(inputEvent) {
    this.inputEvent = inputEvent;
    this.outputEvent = this.map();
  }

  // Map internal message based on it's type
  map() {
    if (this.inputEvent) {
      if (this.mappedEvent(this.inputEvent, WebhooksEvent.RAW.MEETING_EVENTS)) {
        this.meetingTemplate(this.inputEvent);
      } else if (this.mappedEvent(this.inputEvent, WebhooksEvent.RAW.USER_EVENTS)) {
        this.userTemplate(this.inputEvent);
      } else if (this.mappedEvent(this.inputEvent, WebhooksEvent.RAW.CHAT_EVENTS)) {
        this.chatTemplate(this.inputEvent);
      } else if (this.mappedEvent(this.inputEvent, WebhooksEvent.RAW.RAP_EVENTS)) {
        this.rapTemplate(this.inputEvent);
      } else if (this.mappedEvent(this.inputEvent, WebhooksEvent.RAW.COMP_RAP_EVENTS)) {
        this.compRapTemplate(this.inputEvent);
      } else if (this.mappedEvent(this.inputEvent, WebhooksEvent.RAW.PAD_EVENTS)) {
        this.padTemplate(this.inputEvent);
      } else if (this.mappedEvent(this.inputEvent, WebhooksEvent.RAW.POLL_EVENTS)) {
        this.pollTemplate(this.inputEvent);
      } else if (this.mappedEvent(this.inputEvent, WebhooksEvent.OUTPUT_EVENTS)) {
        // Check if input is already a mapped event and return it
        this.outputEvent = this.inputEvent;
      } else {
        this.outputEvent = null;
      }

      if (this.outputEvent) {
        logger.debug('output event mapped', { event: this.outputEvent });
      }

      return this.outputEvent;
    }

    logger.warn('invalid input event', { event: this.inputEvent });

    return null;
  }

  mappedEvent(messageObj, events) {
    return events.some(event => {
      if (messageObj?.header?.name === event) {
        return true;
      }

      if (messageObj?.envelope?.name === event) {
        return true;
      }

      if (messageObj?.data?.id === event) {
        return true;
      }

      return false;
    });
  }

  // Map internal to external message for meeting information
  meetingTemplate(messageObj) {
    const props = messageObj.core.body.props;
    const meetingId = messageObj.core.body.meetingId || messageObj.core.header.meetingId;
    this.outputEvent = {
      data: {
        "type": "event",
        "id": this.mapInternalMessage(messageObj),
        "attributes":{
          "meeting":{
            "internal-meeting-id": meetingId,
            "external-meeting-id": IDMapping.get().getExternalMeetingID(meetingId)
          }
        },
        "event":{
          "ts": Date.now()
        }
      }
    }

    switch (messageObj.envelope.name) {
      case "MeetingCreatedEvtMsg":
        this.outputEvent.data.attributes = {
          "meeting":{
            "internal-meeting-id": props.meetingProp.intId,
            "external-meeting-id": props.meetingProp.extId,
            "name": props.meetingProp.name,
            "is-breakout": props.meetingProp.isBreakout,
            "parent-id": props.breakoutProps.parentId,
            "duration": props.durationProps.duration,
            "create-time": props.durationProps.createdTime,
            "create-date": props.durationProps.createdDate,
            "moderator-pass": props.password.moderatorPass,
            "viewer-pass": props.password.viewerPass,
            "record": props.recordProp.record,
            "voice-conf": props.voiceProp.voiceConf,
            "dial-number": props.voiceProp.dialNumber,
            "max-users": props.usersProp.maxUsers,
            "metadata": props.metadataProp.metadata
          }
        };
        break;

      case "SetCurrentPresentationEvtMsg":
        this.outputEvent.data.attributes = {
          "meeting":{
            "internal-meeting-id": meetingId,
            "external-meeting-id": IDMapping.get().getExternalMeetingID(meetingId),
            "presentation-id": messageObj.core.body.presentationId
          }
        };
        break;

      case "ScreenshareRtmpBroadcastStartedEvtMsg": {
        const presenter = UserMapping.get().getMeetingPresenter(meetingId);
        this.outputEvent.data.attributes = {
          ...this.outputEvent.data.attributes,
          user:{
            "internal-user-id": presenter.internalUserID,
            "external-user-id": presenter.externalUserID,
          }
        };
        break;
      }
      case "ScreenshareRtmpBroadcastStoppedEvtMsg": {
        const owner = UserMapping.get().getMeetingScreenShareOwner(meetingId);
        this.outputEvent.data.attributes = {
          ...this.outputEvent.data.attributes,
          user:{
            "internal-user-id": owner.internalUserID,
            "external-user-id": owner.externalUserID,
          }
        };

        break;
      }

      default: return;
    }
  }

  handleUserMutedVoice(message) {
    try {
      const { body } = message.core;
      const muted = body.muted;

      if (muted === true) return "user-audio-muted";
      if (muted === false) return "user-audio-unmuted";
      return "user-audio-unhandled";
    } catch (error) {
      logger.error('error handling user muted voice', error);
      return "user-audio-unhandled";
    }
  }

  // Map internal to external message for user information
  userTemplate(messageObj) {
    const msgBody = messageObj.core.body;
    const msgHeader = messageObj.core.header;
    const userId = msgHeader.userId;
    const extId = UserMapping.get().getExternalUserID(userId) || msgBody.extId || "";
    this.outputEvent = {
      data: {
        "type": "event",
        "id": this.mapInternalMessage(messageObj),
        "attributes":{
          "meeting":{
            "internal-meeting-id": messageObj.envelope.routing.meetingId,
            "external-meeting-id": IDMapping.get().getExternalMeetingID(messageObj.envelope.routing.meetingId)
          },
          "user":{
            "internal-user-id": userId,
            "external-user-id": extId,
            "name": msgBody.name,
            "role": msgBody.role,
            "presenter": msgBody.presenter,
            "userdata": msgBody.userdata,
            "stream": msgBody.stream
          }
        },
        "event":{
          "ts": Date.now()
        }
      }
    };

    switch (this.outputEvent.data.id) {
      case "user-audio-voice-enabled":
        this.outputEvent.data["attributes"]["user"]["listening-only"] = msgBody.listenOnly;
        this.outputEvent.data["attributes"]["user"]["sharing-mic"] = !msgBody.listenOnly;
        this.outputEvent.data["attributes"]["user"]["muted"] = msgBody.muted;
        break;
      case "user-audio-voice-disabled":
        this.outputEvent.data["attributes"]["user"]["listening-only"] = false;
        this.outputEvent.data["attributes"]["user"]["sharing-mic"] = false;
        this.outputEvent.data["attributes"]["user"]["muted"] = true;
        break;
      case "user-audio-muted":
      case "user-audio-unmuted":
        this.outputEvent.data["attributes"]["user"]["muted"] = msgBody.muted;
        break;
      case "user-emoji-changed": {
        const emoji = msgBody.emoji || msgBody.reactionEmoji || "none";
        this.outputEvent.data["attributes"]["user"]["emoji"] = emoji;
        break;
      }
      case "user-raise-hand-changed": {
        this.outputEvent.data["attributes"]["user"]["raise-hand"] = msgBody.raiseHand;
        break;
      }
      case "user-joined":
      case "user-left": {
        const guest = msgBody.guest ?? UserMapping.get().isGuest(userId);
        this.outputEvent.data["attributes"]["user"]["guest"] = typeof guest === 'boolean'
          ? guest
          : guest === 'true';
        break;
      }
      default:
        break;
    }
  }

  // Map internal to external message for chat information
  chatTemplate(messageObj) {
    const { body } = messageObj.core;
    // Ignore private chats
    if (body.chatId !== 'MAIN-PUBLIC-GROUP-CHAT') return;

    this.outputEvent = {
      data: {
        "type": "event",
        "id": this.mapInternalMessage(messageObj),
        "attributes":{
          "meeting":{
            "internal-meeting-id": messageObj.envelope.routing.meetingId,
            "external-meeting-id": IDMapping.get().getExternalMeetingID(messageObj.envelope.routing.meetingId)
          },
          "chat-message":{
            "id": body.msg.id,
            "message": body.msg.message,
            "sender":{
              "internal-user-id": body.msg.sender.id,
              "name": body.msg.sender.name,
              "time": body.msg.timestamp
            }
          },
          "chat-id": body.chatId
        },
        "event":{
          "ts": Date.now()
        }
      }
    };
  }

  rapTemplate(messageObj) {
    const data = messageObj.core.body;
    this.outputEvent = {
      data: {
        "type": "event",
        "id": this.mapInternalMessage(messageObj),
        "attributes": {
          "meeting": {
            "internal-meeting-id": data.internalMeetingId,
            "external-meeting-id": IDMapping.get().getExternalMeetingID(data.recordId)
          },
          "record-id": data.recordId
        },
        "event": {
          "ts": Date.now()
        }
      }
    };
  }

  compRapTemplate(messageObj) {
    const data = messageObj.payload;
    this.outputEvent = {
      data: {
        "type": "event",
        "id": this.mapInternalMessage(messageObj),
        "attributes": {
          "meeting": {
            "internal-meeting-id": data.meeting_id,
            "external-meeting-id": data.external_meeting_id || IDMapping.get().getExternalMeetingID(data.meeting_id)
          }
        },
        "event": {
          "ts": messageObj.header.current_time
        }
      },
    };

    if (this.outputEvent.data.id === "published" ||
        this.outputEvent.data.id === "unpublished" ||
        this.outputEvent.data.id === "deleted") {
      this.outputEvent.data.attributes["record-id"] = data.meeting_id;
      this.outputEvent.data.attributes["format"] = data.format;
    } else {
      this.outputEvent.data.attributes["record-id"] = data.record_id;
      this.outputEvent.data.attributes["success"] = data.success;
      this.outputEvent.data.attributes["step-time"] = data.step_time;
    }

    if (this.outputEvent.data.id === "rap-archive-ended") {
      this.outputEvent.data.attributes["recorded"] = data.recorded || false;
      this.outputEvent.data.attributes["duration"] = data.duration || 0;
    }

    if (data.workflow) {
      this.outputEvent.data.attributes.workflow = data.workflow;
    }

    if (this.outputEvent.data.id === "rap-publish-ended") {
      this.outputEvent.data.attributes.recording = {
        "name": data.metadata.meetingName,
        "is-breakout": data.metadata.isBreakout,
        "start-time": data.start_time,
        "end-time": data.end_time,
        "size": data.playback.size,
        "raw-size": data.raw_size,
        "metadata": data.metadata,
        "playback": data.playback,
        "download": data.download
      }
    }
  }

  handleRecordingStatusChanged(message) {
    const event = "meeting-recording";
    const { core } = message;
    if (core && core.body) {
      const { recording } = core.body;
      if (typeof recording === 'boolean') {
        if (recording) return `${event}-started`;
        return `${event}-stopped`;
      }
    }
    return `${event}-unhandled`;
  }

  padTemplate(messageObj) {
    const {
      body,
      header,
    } = messageObj.core;
    this.outputEvent = {
      data: {
        "type": "event",
        "id": this.mapInternalMessage(messageObj),
        "attributes":{
          "meeting":{
            "internal-meeting-id": header.meetingId,
            "external-meeting-id": IDMapping.get().getExternalMeetingID(header.meetingId)
          },
          "pad":{
            "id": body.padId,
            "external-pad-id": body.externalId,
            "rev": body.rev,
            "start": body.start,
            "end": body.end,
            "text": body.text
          }
        },
        "event":{
          "ts": Date.now()
        }
      }
    };
  }

  pollTemplate(messageObj) {
    const {
      body,
      header,
    } = messageObj.core;
    const extId = UserMapping.get().getExternalUserID(header.userId) || body.extId || "";
    const pollId = body.pollId || body.poll?.id;

    this.outputEvent = {
      data: {
        type: "event",
        id: this.mapInternalMessage(messageObj),
        attributes:{
          meeting:{
            "internal-meeting-id": messageObj.envelope.routing.meetingId,
            "external-meeting-id": IDMapping.get().getExternalMeetingID(messageObj.envelope.routing.meetingId)
          },
          user:{
            "internal-user-id": header.userId,
            "external-user-id": extId,
          },
          poll: {
            "id": pollId,
          }
        },
        event: {
          "ts": Date.now()
        }
      }
    };

    if (this.outputEvent.data.id === "poll-started") {
      this.outputEvent.data.attributes.poll = {
        ...this.outputEvent.data.attributes.poll,
        question: body.question,
        answers: body.poll.answers,
      };
    } else if (this.outputEvent.data.id === "poll-responded") {
      this.outputEvent.data.attributes.poll.answerIds = body.answerIds;
    }
  }

  mapInternalMessage(message) {
    const name = message?.envelope?.name || message?.header?.name;

    const mappedMsg = (() => { switch (name) {
      case "MeetingCreatedEvtMsg": return "meeting-created";
      case "MeetingDestroyedEvtMsg": return "meeting-ended";
      case "RecordingStatusChangedEvtMsg": return this.handleRecordingStatusChanged(message);
      case "ScreenshareRtmpBroadcastStartedEvtMsg": return "meeting-screenshare-started";
      case "ScreenshareRtmpBroadcastStoppedEvtMsg": return "meeting-screenshare-stopped";
      case "SetCurrentPresentationEvtMsg": return "meeting-presentation-changed";
      case "UserJoinedMeetingEvtMsg": return "user-joined";
      case "UserLeftMeetingEvtMsg": return "user-left";
      case "UserJoinedVoiceConfToClientEvtMsg": return "user-audio-voice-enabled";
      case "UserLeftVoiceConfToClientEvtMsg": return "user-audio-voice-disabled";
      case "UserMutedVoiceEvtMsg": return this.handleUserMutedVoice(message);
      case "UserBroadcastCamStartedEvtMsg": return "user-cam-broadcast-start";
      case "UserBroadcastCamStoppedEvtMsg": return "user-cam-broadcast-end";
      case "PresenterAssignedEvtMsg": return "user-presenter-assigned";
      case "PresenterUnassignedEvtMsg": return "user-presenter-unassigned";
      case "UserEmojiChangedEvtMsg":
      case "UserReactionEmojiChangedEvtMsg": return 'user-emoji-changed';
      case "UserRaiseHandChangedEvtMsg": return "user-raise-hand-changed";
      case "GroupChatMessageBroadcastEvtMsg": return "chat-group-message-sent";
      case "PublishedRecordingSysMsg": return "rap-published";
      case "UnpublishedRecordingSysMsg": return "rap-unpublished";
      case "DeletedRecordingSysMsg": return "rap-deleted";
      case "PadContentEvtMsg": return "pad-content";
      case "PollStartedEvtMsg": return "poll-started";
      case "UserRespondedToPollRespMsg": return "poll-responded";
      // RAP
      case "archive_started": return "rap-archive-started";
      case "archive_ended": return "rap-archive-ended";
      case "sanity_started": return "rap-sanity-started";
      case "sanity_ended": return "rap-sanity-ended";
      case "post_archive_started": return "rap-post-archive-started";
      case "post_archive_ended": return "rap-post-archive-ended";
      case "process_started": return "rap-process-started";
      case "process_ended": return "rap-process-ended";
      case "post_process_started": return "rap-post-process-started";
      case "post_process_ended": return "rap-post-process-ended";
      case "publish_started": return "rap-publish-started";
      case "publish_ended": return "rap-publish-ended";
      case "published": return "rap-published";
      case "unpublished": return "rap-unpublished";
      case "deleted": return "rap-deleted";
      case "post_publish_started": return "rap-post-publish-started";
      case "post_publish_ended": return "rap-post-publish-ended";
    } })();

    return mappedMsg;
  }
}
