import HooksPostCatcher from './hooks-post-catcher.js';

const helpers = {};

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

export default helpers;
