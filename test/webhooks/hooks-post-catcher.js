/* eslint no-console: "off" */
import fetch from "node-fetch";
import crypto from "crypto";
import PostCatcher from '../utils/post-catcher.js';

class HooksPostCatcher extends PostCatcher {
  constructor (url, options) {
    super(url, options);
  }

  async createHook (bbbDomain, sharedSecret, {
    getRaw = false,
    eventId = null,
    meetingId = null,
  } = {}) {
    if (!this.started) this.start();
    let params = `callbackURL=${HooksPostCatcher.encodeForUrl(this.url)}&getRaw=${getRaw}`;
    if (eventId) params += "&eventID=" + eventId;
    if (meetingId) params += "&meetingID=" + meetingId;
    const checksum = crypto
      .createHash('sha1')
      .update("hooks/create" + params + sharedSecret).digest('hex');
    const fullUrl = `http://${bbbDomain}/bigbluebutton/api/hooks/create?`
      + params
      + "&checksum="
      + checksum;
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
