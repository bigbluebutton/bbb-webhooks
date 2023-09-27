import express from 'express';
import url from 'url';
import { newLogger } from '../../../common/logger.js';
import Utils from '../../../common/utils.js';
import responses from './responses.js';

// Returns a simple string with a description of the client that made
// the request. It includes the IP address and the user agent.
const clientDataSimple = req => `ip ${Utils.ipFromRequest(req)}, using ${req.headers["user-agent"]}`;

// Cleans up a string with an XML in it removing spaces and new lines from between the tags.
const cleanupXML = string => string.trim().replace(/>\s*/g, '>');

// Was this request made by monit?
// TODO remove/review
const fromMonit = req => (req.headers["user-agent"] != null) && req.headers["user-agent"].match(/^monit/);

// Web server that listens for API calls and process them.
export default class API {
  static logger = newLogger('api');
  static setStorage (storage) {
    API.storage = storage;
  }

  static respondWithXML(res, msg) {
    msg = cleanupXML(msg);
    API.logger.info(`respond with: ${msg}`);
    res.setHeader("Content-Type", "text/xml");
    res.send(msg);
  }

  constructor(options = {}) {
    this.app = express();

    this._permanentURLs = options.permanentURLs || [];
    this._secret = options.secret;
    this._validateChecksum = this._validateChecksum.bind(this);

    this._registerRoutes();
  }

  start(port, bind) {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(port, bind, () => {
        if (this.server.address() == null) {
          API.logger.error(`aborting, could not bind to port ${port}`);
          return reject(new Error(`API failed to start, EARADDRINUSE`));
        }
        API.logger.info(`listening on port ${port} in ${this.app.settings.env.toUpperCase()} mode`);
        return resolve();
      });
    });
  }

  _registerRoutes() {
    // Request logger
    this.app.all("*", (req, res, next) => {
      if (!fromMonit(req)) {
        API.logger.info(`${req.method} request to ${req.url} from: ${clientDataSimple(req)}`);
      }
      next();
    });

    this.app.get("/bigbluebutton/api/hooks/create", this._validateChecksum, this._create.bind(this));
    this.app.get("/bigbluebutton/api/hooks/destroy", this._validateChecksum, this._destroy);
    this.app.get("/bigbluebutton/api/hooks/list", this._validateChecksum, this._list);
    this.app.get("/bigbluebutton/api/hooks/ping", (req, res) => {
      res.write("bbb-webhooks up!");
      res.end();
    });
  }

  _isHookPermanent(callbackURL) {
    return this._permanentURLs.some(obj => {
      return obj.url === callbackURL
    });
  }

  async _create(req, res, next) {
    const urlObj = url.parse(req.url, true);
    const callbackURL = urlObj.query["callbackURL"];
    const meetingID = urlObj.query["meetingID"];
    const eventID = urlObj.query["eventID"];
    let getRaw = urlObj.query["getRaw"];

    if (getRaw) {
      getRaw = JSON.parse(getRaw.toLowerCase());
    } else {
      getRaw = false;
    }

    if (callbackURL == null) {
      API.respondWithXML(res, responses.missingParamCallbackURL);
      return;
    }

    try {
      const { hook, duplicated } = await API.storage.get().addSubscription({
        callbackURL,
        meetingID,
        eventID,
        permanent: this._isHookPermanent(callbackURL),
        getRaw,
      });

      let msg;

      if (duplicated) {
        msg = responses.createDuplicated(hook.id);
      } else if (hook != null) {
        const { permanent, getRaw } = hook.payload;
        msg = responses.createSuccess(hook.id, permanent, getRaw);
      } else {
        msg = responses.createFailure;
      }

      API.respondWithXML(res, msg);
    } catch (error) {
      API.logger.error(`error creating hook ${error}`);
      API.respondWithXML(res, responses.createFailure);
    }
  }

  // Create a permanent hook. Permanent hooks can't be deleted via API and will try to emit a message until it succeed
  async createPermanents() {
    for (let i = 0; i < this._permanentURLs.length; i++) {
      try {
        const { url: callbackURL, getRaw } = this._permanentURLs[i];
        const { hook, duplicated } = await API.storage.get().addSubscription({
          callbackURL,
          permanent: this._isHookPermanent(callbackURL),
          getRaw,
        });

        if (duplicated) {
          API.logger.warn(`duplicated permanent hook ${hook.id}`);
        } else if (hook != null) {
          API.logger.info('permanent hook created successfully');
        } else {
          API.logger.error('error creating permanent hook');
        }
      } catch (error) {
        API.logger.error(`error creating permanent hook ${error}`);
      }
    }
  }

  async _destroy(req, res, next) {
    const urlObj = url.parse(req.url, true);
    const hookID = urlObj.query["hookID"];

    if (hookID == null) {
      API.respondWithXML(res, responses.missingParamHookID);
    } else {
      let removed, failed;
      try {
        removed = await API.storage.get().removeSubscription(hookID);
      } catch (error) {
        API.logger.error('error removing hook', error);
        failed = true;
      } finally {
        if (removed) {
          API.respondWithXML(res, responses.destroySuccess);
        } else if (failed) {
          API.respondWithXML(res, responses.destroyFailure);
        } else {
          API.respondWithXML(res, responses.destroyNoHook);
        }
      }
    }
  }

  _list(req, res, next) {
    let hooks;
    const urlObj = url.parse(req.url, true);
    const meetingID = urlObj.query["meetingID"];

    if (meetingID != null) {
      // all the hooks that receive events from this meeting
      hooks = API.storage.get().allGlobalSync();
      hooks = hooks.concat(API.storage.get().findByExternalMeetingID(meetingID));
      hooks = Utils.sortBy(hooks, hook => hook.id);
    } else {
      // no meetingID, return all hooks
      hooks = API.storage.get().getAll();
    }

    let msg = "<response><returncode>SUCCESS</returncode><hooks>";
    hooks.forEach((hook) => {
      const {
        eventID,
        externalMeetingID,
        callbackURL,
        permanent,
        getRaw,
      } = hook.payload;
      msg += "<hook>";
      msg +=   `<hookID>${hook.id}</hookID>`;
      msg +=   `<callbackURL><![CDATA[${callbackURL}]]></callbackURL>`;
      if (!API.storage.get().isGlobal(hook)) { msg +=   `<meetingID><![CDATA[${externalMeetingID}]]></meetingID>`; }
      if (eventID != null) { msg +=   `<eventID>${eventID}</eventID>`; }
      msg +=   `<permanentHook>${permanent}</permanentHook>`;
      msg +=   `<rawData>${getRaw}</rawData>`;
      msg += "</hook>";
    });
    msg += "</hooks></response>";

    API.respondWithXML(res, msg);
  }

  // Validates the checksum in the request `req`.
  // If it doesn't match BigBlueButton's shared secret, will send an XML response
  // with an error code just like BBB does.
  _validateChecksum(req, res, next) {
    const urlObj = url.parse(req.url, true);
    const checksum = urlObj.query["checksum"];

    if (checksum === Utils.checksumAPI(req.url, this._secret)) {
      next();
    } else {
      API.logger.info('checksum check failed, sending a checksumError response', responses.checksumError);
      res.setHeader("Content-Type", "text/xml");
      res.send(cleanupXML(responses.checksumError));
    }
  }
}
