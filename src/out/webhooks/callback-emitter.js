import url from 'url';
import { EventEmitter } from 'node:events';
import { newLogger } from '../../common/logger.js';
import Utils from '../../common/utils.js';
import fetch from 'node-fetch';

const Logger = newLogger('callback-emitter');

// A simple string that identifies the event
const simplifiedEvent = (event) => {
  if (event.event != null) {
    event = event.event
  }
  try {
    const eventJs = JSON.parse(event);
    return `event: { name: ${(eventJs.data != null ? eventJs.data.id : undefined)}, timestamp: ${(eventJs.data.event != null ? eventJs.data.event.ts : undefined)} }`;
  } catch (e) {
    return `event: ${event}`;
  }
};

// Use to perform a callback. Will try several times until the callback is
// properly emitted and stop when successful (or after a given number of tries).
// Used to emit a single callback. Destroy it and create a new class for a new callback.
// Emits "success" on success, "failure" on error and "stopped" when gave up trying
// to perform the callback.
export default class CallbackEmitter extends EventEmitter {
  constructor(callbackURL, event, permanent, domain, options = {}) {
    super();
    this.callbackURL = callbackURL;
    this.event = event;
    this.message = JSON.stringify(event);
    this.nextInterval = 0;
    this.timestamp = 0;
    this.permanent = permanent;
    this._serverDomain = domain;

    if (callbackURL == null
      || event == null
      || domain == null
      || domain == null) {
      throw new Error("missing parameters");
    }

    this._permanentIntervalReset = options.permanentIntervalReset || 8;
    this._secret = options.secret;
    this._bearerAuth = options.auth2_0;
    if (this._bearerAuth && this._secret == null) throw new Error("missing secret");
    this._requestTimeout = options.requestTimeout;
    this._retryIntervals = options.retryIntervals || [
      1000,
      2000,
      5000,
      10000,
      30000,
    ];
  }

  start() {
    this.timestamp = new Date().getTime();
    this.nextInterval = 0;
    this._scheduleNext(0);
  }

  _scheduleNext(timeout) {
    setTimeout(async () => {
      try {
        await this._emitMessage();
        this.emit("success");
      } catch (error) {
        this.emit("failure", error);
        // get the next interval we have to wait and schedule a new try
        const interval = this._retryIntervals[this.nextInterval];

        if (interval != null) {
          Logger.warn(`trying the callback again in ${interval/1000.0} secs: ${this.callbackURL}`);
          this.nextInterval++;
          this._scheduleNext(interval);
          // no intervals anymore, time to give up
        } else {
          this.nextInterval = this._permanentIntervalReset;

          if (this.permanent){
            this._scheduleNext(this.nextInterval);
          } else {
            this.emit("stopped");
          }
        }
      }
    }, timeout);
  }

  async _emitMessage() {
    let data, requestOptions, callbackURL;
    const serverDomain = this._serverDomain;
    const sharedSecret = this._secret;
    const bearerAuth = this._bearerAuth;
    const timeout = this._requestTimeout;

    // data to be sent
    // note: keep keys in alphabetical order
    data = new URLSearchParams({
      event: "[" + this.message + "]",
      timestamp: this.timestamp,
      domain: serverDomain
    });
    requestOptions = {
      method: "POST",
      body: data,
      redirect: 'follow',
      follow: 10,
      // FIXME review - compress should be on?
      compress: false,
      timeout,
    };

    if (bearerAuth) {
      callbackURL = this.callbackURL;
      requestOptions.headers = {
        Authorization: `Bearer ${sharedSecret}`,
      };
    } else {
      const checksum = Utils.checksum(`${this.callbackURL}${JSON.stringify(data)}${sharedSecret}`);
      // get the final callback URL, including the checksum
      callbackURL = this.callbackURL;
      try {
        const urlObj = url.parse(this.callbackURL, true);
        callbackURL += Utils.isEmpty(urlObj.search) ? "?" : "&";
        callbackURL += `checksum=${checksum}`;
      } catch (error) {
        Logger.error(`error parsing callback URL: ${this.callbackURL}`);
        throw error;
      }
    }

    const responseFailed = (response) => {
      // consider 401 as success, because the callback worked but was denied by the recipient
      return !(response.ok || response.status == 401)
    };

    const controller = new AbortController();
    const abortTimeout = setTimeout(() => {
      controller.abort();
    }, timeout);
    requestOptions.signal = controller.signal;

    try {
      const response = await fetch(callbackURL, requestOptions);

      if (responseFailed(response)) {
        Logger.warn(`error in the callback call to: [${callbackURL}] for ${simplifiedEvent(data)} status: ${response != null ? response.status: undefined}`);
        throw new Error(response.statusText);
      } else {
        Logger.info(`successful callback call to: [${callbackURL}] for ${simplifiedEvent(data)}`);
      }
    } catch (error) {
      Logger.warn(`error in the callback call to: [${callbackURL}] for ${simplifiedEvent(data)}`, error);
      throw error;
    } finally {
      clearTimeout(abortTimeout);
    }
  }
}
