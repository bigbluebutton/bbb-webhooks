import HooksPostCatcher from './hooks-post-catcher.js';

const helpers = {};

/* Helper methods */
helpers.flushall = (rClient) => {
  rClient.flushDb()
}

helpers.flushredis = (hook) => {
  if (hook?.client) hook.client.flushDb();
}

helpers.createHooksCatcher = async (url, options = {}) => {
  const catcher = new HooksPostCatcher(url, options);

  await catcher.start();

  return catcher;
};

helpers.stopHooksCatcher = (catcher) => {
  if (catcher && catcher.started) catcher.stop();
};


/* Helper constants */
helpers.url = 'http://127.0.0.1';
helpers.port = ':3005';
helpers.callback = 'http://127.0.0.1:3008/callback';
helpers.rawCatcherURL = 'http://127.0.0.1:3006/callback';
helpers.mappedCatcherURL = 'http://127.0.0.1:3007/callback';
helpers.callbackURL = '?callbackURL=' + helpers.callback
helpers.apiPath = '/bigbluebutton/api/hooks/'
helpers.createUrl = helpers.port + helpers.apiPath + 'create/' + helpers.callbackURL
helpers.destroyUrl = (id) => { return helpers.port + helpers.apiPath + 'destroy/' + '?hookID=' + id }
helpers.destroyPermanent = helpers.port + helpers.apiPath + 'destroy/' + '?hookID=1'
helpers.createRaw = '&getRaw=true'
helpers.createPermanent = '&permanent=true'
helpers.listUrl = 'list/'
helpers.rawMessage = {
  envelope: {
    name: 'PresenterAssignedEvtMsg',
    routing: {
      msgType: 'BROADCAST_TO_MEETING',
      meetingId: 'a674bb9c6ff92bfa6d5a0a1e530fabb56023932e-1509387833678',
      userId: 'w_ysgy0erqgayc'
    }
  },
  core: {
    header: {
      name: 'PresenterAssignedEvtMsg',
      meetingId: 'a674bb9c6ff92bfa6d5a0a1e530fabb56023932e-1509387833678',
      userId: 'w_ysgy0erqgayc'
    },
    body: {
      presenterId: 'w_ysgy0erqgayc',
      presenterName: 'User 4125097',
      assignedBy: 'w_vlnwu1wkhena'
    }
  }
};
helpers.rawMessageUserJoined = {
  envelope: {
    name: 'UserJoinedMeetingEvtMsg',
    routing: {
      msgType: 'BROADCAST_TO_MEETING',
      meetingId: '8043c8452ae9830aac14c517adff3839dbd9228f-1698771157700',
      userId: 'w_xfsb9gxtlfom'
    },
    timestamp: 1698771164638
  },
  core: {
    header: {
      name: 'UserJoinedMeetingEvtMsg',
      meetingId: '8043c8452ae9830aac14c517adff3839dbd9228f-1698771157700',
      userId: 'w_xfsb9gxtlfom'
    },
    body: {
      intId: 'w_xfsb9gxtlfom',
      extId: 'w_xfsb9gxtlfom',
      name: 'John Doe',
      role: 'MODERATOR',
      guest: false,
      authed: true,
      guestStatus: 'ALLOW',
      emoji: 'none',
      reactionEmoji: 'none',
      raiseHand: false,
      away: false,
      pin: false,
      presenter: false,
      locked: true,
      avatar: '',
      color: '#7b1fa2',
      clientType: 'HTML5'
    }
  }
};
helpers.rawMessageMeetingCreated = {
  envelope: {
    name: 'MeetingCreatedEvtMsg',
    routing: {
      sender: "bbb-apps-akka"
    },
    timestamp: 1698771158093
  },
  core: {
    header: {
      name: 'MeetingCreatedEvtMsg'
    },
    body: {
      props: {
        meetingProp: {
          name: 'random-9019868',
          extId: "random-9019868",
          intId: "8043c8452ae9830aac14c517adff3839dbd9228f-1698771157700",
          meetingCameraCap: 50,
          maxPinnedCameras: 3,
          isBreakout: false,
          disabledFeatures: [],
          notifyRecordingIsOn: false,
          presentationUploadExternalDescription: "",
          presentationUploadExternalUrl: ""
        },
        breakoutProps: {
          parentId: 'bbb-none',
          sequence: 0,
          freeJoin: false,
          breakoutRooms: [],
          record: false,
          privateChatEnabled: true,
          captureNotes: false,
          captureSlides: false,
          captureNotesFilename: '%%CONFNAME%%',
          captureSlidesFilename: '%%CONFNAME%%'
        },
        durationProps: {
          duration: 0,
          createdTime: 1698771157700,
          createdDate: 'Tue Oct 31 13:52:37 BRT 2023',
          meetingExpireIfNoUserJoinedInMinutes: 5,
          meetingExpireWhenLastUserLeftInMinutes: 1,
          userInactivityInspectTimerInMinutes: 0,
          userInactivityThresholdInMinutes: 30,
          userActivitySignResponseDelayInMinutes: 5,
          endWhenNoModerator: false,
          endWhenNoModeratorDelayInMinutes: 1
        },
        password: {
          moderatorPass: 'mp',
          viewerPass: 'ap',
          learningDashboardAccessToken: 'igucwyjkab6i'
        },
        recordProp: {
          record: false,
          autoStartRecording: false,
          allowStartStopRecording: true,
          recordFullDurationMedia: false,
          keepEvents: true
        },
        welcomeProp: {
          welcomeMsgTemplate: '<br>Welcome to <b>%%CONFNAME%%</b>!',
          welcomeMsg: '<br>Welcome to <b>random-9019868</b>!',
          modOnlyMessage: ''
        },
        voiceProp: {
          telVoice: '71347',
          voiceConf: '71347',
          dialNumber: '613-555-1234',
          muteOnStart: false
        },
        usersProp: {
          maxUsers: 0,
          maxUserConcurrentAccesses: 3,
          webcamsOnlyForModerator: false,
          userCameraCap: 3,
          guestPolicy: 'ASK_MODERATOR',
          meetingLayout: "CUSTOM_LAYOUT",
          allowModsToUnmuteUsers: true,
          allowModsToEjectCameras: true,
          authenticatedGuest: false,
        },
        metadataProp: {},
        lockSettingsProps: {
          disableCam: false,
          disableMic: false,
          disablePrivateChat: false,
          disablePublicChat: false,
          disableNotes: false,
          hideUserList: false,
          lockOnJoin: true,
          lockOnJoinConfigurable: false,
          hideViewersCursor: false,
          hideViewersAnnotation: false
        },
        systemProps: {
          html5InstanceId: 1,
        },
        groups: []
      }
    }
  }
};

export default helpers;
