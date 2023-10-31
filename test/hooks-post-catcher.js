/* eslint no-console: "off" */
import express from "express";
import fetch from "node-fetch";
import crypto from "crypto";
import bodyParser from 'body-parser';
import EventEmitter from 'events';

const encodeForUrl = (value) => {
  return encodeURIComponent(value)
    .replace(/%20/g, '+')
    .replace(/[!'()]/g, escape)
    .replace(/\*/g, "%2A")
};

class HooksPostCatcher extends EventEmitter {
  static encodeForUrl = encodeForUrl;

  constructor (url, { useLogger = false } = {}) {
    super();
    this.url = url;
    this.started = false;
    this._parsedUrl = new URL(url);
    this.port = this._parsedUrl.port;
    this.logger = useLogger ? this.logger : { log: () => {}, error: () => {} };
    if (!this.port) throw new Error("Port not specified in URL");
  }

  start () {
    return new Promise((resolve, reject) => {
      this.app = express();
      this.app.use(bodyParser.json());
      this.app.use(bodyParser.urlencoded({
        extended: true
      }));
      this.app.post("/callback", (req, res) => {
        try {
          this.logger.log("-------------------------------------");
          this.logger.log("* Received:", req.url);
          this.logger.log("* Body:", req.body);
          this.logger.log("-------------------------------------\n");
          res.statusCode = 200;
          res.send();
          this.emit("callback", req.body);
        } catch (error) {
          this.logger.error("Error  processing callback:", error);
          res.statusCode = 500;
          res.send();
          this.emit("error", error);
        }
      });

      this.server = this.app.listen(this.port, (error) => {
        if (error) {
          this.logger.error("Error starting server:", error);
          reject(error);
          return;
        }

        this.logger.log("Server listening on", this.url);
        this.started = true;
        resolve();
      });
    });
  }

  stop () {
    this.server.close();
    this.started = false;
    this.removeAllListeners();
  }

  async createHook (bbbDomain, sharedSecret, {
    getRaw = false,
    eventId = null,
    meetingId = null,
  } = {}) {
    if (!this.started) this.start();
    const myUrl = this.url;
    let params = `callbackURL=${HooksPostCatcher.encodeForUrl(myUrl)}&getRaw=${getRaw}`;
    if (eventId) params += "&eventID=" + eventId;
    if (meetingId) params += "&meetingID=" + meetingId;
    const checksum = crypto
      .createHash('sha1')
      .update("hooks/create" + params + sharedSecret).digest('hex');
    const fullUrl = `http://${bbbDomain}/bigbluebutton/api/hooks/create?` +
      params + "&checksum=" + checksum
    this.logger.log("Registering a hook with", fullUrl);

    const controller = new AbortController();
    const abortTimeout = setTimeout(controller.abort, 2500);

    try {
      const response = await fetch(fullUrl, { signal: controller.signal });
      const text = await response.text();
      if (response.ok) {
        this.logger.debug("Hook registered - response from hook/create:", text);
      } else {
        throw new Error(text);
      }
    } catch (error) {
      this.logger.error("Hook registration failed - response from hook/create:", error);
      throw error;
    } finally {
      clearTimeout(abortTimeout);
    }
  }
}

export default HooksPostCatcher;
