import express from 'express';
import url from 'url';
import { newLogger } from '../../../common/logger.js';
import Utils from '../utils.js';
import responses from './responses.js';
import { METRIC_NAMES } from '../metrics.js';

// Returns a simple string with a description of the client that made
// the request. It includes the IP address and the user agent.
const clientDataSimple = req => `ip ${Utils.ipFromRequest(req)}, using ${req.headers["user-agent"]}`;

// Cleans up a string with an XML in it removing spaces and new lines from between the tags.
const cleanupXML = string => string.trim().replace(/>\s*/g, '>');
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
    this._exporter = options.exporter;
    this._supportedChecksumAlgorithms = options.supportedChecksumAlgorithms;

    this._validateChecksum = this._validateChecksum.bind(this);

    this._registerRoutes();
  }

  _registerRoutes() {
    this.app.use((req, res, next) => {
      const { method, url, baseUrl, path } = req;

      API.logger.info(`received: ${method} request to ${baseUrl + path}`, {
        clientData: clientDataSimple(req),
        url,
      });
      next();
    });

    this.app.get("/bigbluebutton/api/hooks/create", this._validateChecksum, this._create.bind(this));
    this.app.get("/bigbluebutton/api/hooks/destroy", this._validateChecksum, this._destroy.bind(this));
    this.app.get("/bigbluebutton/api/hooks/list", this._validateChecksum, this._list.bind(this));
    this.app.get("/bigbluebutton/api/hooks/ping", (req, res) => {
      res.write("bbb-webhooks API up!");
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
    let returncode = responses.RETURN_CODES.SUCCESS;
    let messageKey;

    if (getRaw) {
      getRaw = JSON.parse(getRaw.toLowerCase());
    } else {
      getRaw = false;
    }

    if (callbackURL == null) {
      API.respondWithXML(res, responses.missingParamCallbackURL);
      returncode = responses.RETURN_CODES.FAILED;
      messageKey = responses.MESSAGE_KEYS.missingParamCallbackURL;
    } else {
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
          messageKey = responses.MESSAGE_KEYS.duplicateWarning;
        } else if (hook != null) {
          const { permanent, getRaw } = hook.payload;
          msg = responses.createSuccess(hook.id, permanent, getRaw);
        } else {
          msg = responses.createFailure;
          returncode = responses.RETURN_CODES.FAILED;
          messageKey = responses.MESSAGE_KEYS.createHookError;
        }

        API.respondWithXML(res, msg);
      } catch (error) {
        API.logger.error('error creating hook', error);
        API.respondWithXML(res, responses.createFailure);
        returncode = responses.RETURN_CODES.FAILED;
        messageKey = responses.MESSAGE_KEYS.createHookError;
      }
    }

    this._exporter.agent.increment(METRIC_NAMES.API_REQUESTS, {
      method: req.method,
      path: urlObj.pathname,
      returncode,
      messageKey,
    });
  }

  // Create a permanent hook. Permanent hooks can't be deleted via API and will try to emit a message until it succeed
  async _destroy(req, res, next) {
    const urlObj = url.parse(req.url, true);
    const hookID = urlObj.query["hookID"];
    let returncode = responses.RETURN_CODES.SUCCESS;
    let messageKey;

    if (hookID == null) {
      returncode = responses.RETURN_CODES.FAILED;
      messageKey = responses.MESSAGE_KEYS.missingParamHookID;
      API.respondWithXML(res, responses.missingParamHookID);
    } else {
      try {
        const removed = await API.storage.get().removeSubscription(hookID);
        if (removed) {
          API.respondWithXML(res, responses.destroySuccess);
        } else {
          returncode = responses.RETURN_CODES.FAILED;
          messageKey = responses.MESSAGE_KEYS.destroyMissingHook;
          API.respondWithXML(res, responses.destroyNoHook);
        }
      } catch (error) {
        API.logger.error('error removing hook', error);
        returncode = responses.RETURN_CODES.FAILED;
        messageKey = responses.MESSAGE_KEYS.destroyHookError;
        API.respondWithXML(res, responses.destroyFailure);
      }
    }

    this._exporter.agent.increment(METRIC_NAMES.API_REQUESTS, {
      method: req.method,
      path: urlObj.pathname,
      returncode,
      messageKey,
    });
  }

  _list(req, res, next) {
    let hooks;
    const urlObj = url.parse(req.url, true);
    const meetingID = urlObj.query["meetingID"];
    let returncode = responses.RETURN_CODES.SUCCESS;
    let messageKey;

    try {
      if (meetingID != null) {
        // all the hooks that receive events from this meeting
        hooks = API.storage.get().getAllGlobalHooks();
        hooks = hooks.concat(API.storage.get().findByExternalMeetingID(meetingID));
        hooks = hooks.sort(Utils.sortBy('id'));
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
    } catch (error) {
      API.logger.error('error listing hooks', error);
      returncode = responses.RETURN_CODES.FAILED;
      messageKey = responses.MESSAGE_KEYS.listHookError;
      API.respondWithXML(res, responses.listFailure);
    }

    this._exporter.agent.increment(METRIC_NAMES.API_REQUESTS, {
      method: req.method,
      path: urlObj.pathname,
      returncode,
      messageKey,
    });
  }

  // Validates the checksum in the request `req`.
  // If it doesn't match BigBlueButton's shared secret, will send an XML response
  // with an error code just like BBB does.
  _validateChecksum(req, res, next) {
    if (Utils.isUrlChecksumValid(req.url, this._secret, this._supportedChecksumAlgorithms)) {
      next();
    } else {
      const urlObj = url.parse(req.url, true);
      API.logger.warn('invalid checksum', { response: responses.checksumError });
      API.respondWithXML(res, responses.checksumError);
      this._exporter.agent.increment(METRIC_NAMES.API_REQUEST_FAILURES_XML, {
        method: req.method,
        path: urlObj.pathname,
        returncode: responses.RETURN_CODES.FAILED,
        messageKey: responses.MESSAGE_KEYS.checksumError,
      });
    }
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

  stop() {
    return new Promise((resolve, reject) => {
      this.server.close((error) => {
        if (error) {
          API.logger.error('error stopping API server', error);
          return reject(error);
        }
        API.logger.info('API server stopped');
        return resolve();
      });
    });
  }
}
