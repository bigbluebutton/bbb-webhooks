import url from 'url';
import { EventEmitter } from 'node:events';
import Utils from './utils.js';
import fetch from 'node-fetch';

// A simple string that identifies the event
const simplifiedEvent = (_event) => {

  try {
    const event = typeof _event === 'string'
      ? JSON.parse(_event)
      : _event.event
        ? _event.event
        : _event;

    return `event: { name: ${event?.data?.id}, timestamp: ${(event?.data?.event?.ts)} }`;
  } catch (error) {
    return `event: ${_event}`;
  }
};

// Use to perform a callback. Will try several times until the callback is
// properly emitted and stop when successful (or after a given number of tries).
// Used to emit a single callback. Destroy it and create a new class for a new callback.
// Emits "success" on success, "failure" on error and "stopped" when gave up trying
// to perform the callback.
export default class CallbackEmitter extends EventEmitter {
  static EVENTS = {
    // The callback was successfully emitted
    SUCCESS: "success",
    // The callback could not be emitted
    FAILURE: "failure",
    // The callback could not be emitted and we gave up trying
    STOPPED: "stopped",
  };

  constructor(
    callbackURL,
    event,
    permanent,
    domain, {
      secret,
      auth2_0,
      requestTimeout,
      retryIntervals,
      permanentIntervalReset,
      logger = console,
      checksumAlgorithm,
    } = {},
  ) {
    super();
    this.callbackURL = callbackURL;
    this.event = event;
    this.eventStr = JSON.stringify(event);
    this.nextInterval = 0;
    this.timestamp = 0;
    this.permanent = permanent;
    this.logger = logger;

    if (callbackURL == null
      || event == null
      || domain == null
      || domain == null) {
      throw new Error("missing parameters");
    }

    this._dispatched = false;
    this._serverDomain = domain;
    this._secret = secret;
    this._bearerAuth = auth2_0;
    if (this._bearerAuth && this._secret == null) throw new Error("missing secret");
    this._requestTimeout = requestTimeout;
    this._retryIntervals = retryIntervals || [
      1000,
      2000,
      5000,
      10000,
      30000,
    ];
    this._permanentIntervalReset = permanentIntervalReset || 60000;
    this._checksumAlgorithm = checksumAlgorithm;
  }

  _scheduleNext(timeout) {
    this._clearDispatcher();
    this._dispatcher = setTimeout(async () => {
      try {
        await this._dispatch();
        this._dispatched = true;
        this.emit(CallbackEmitter.EVENTS.SUCCESS);
      } catch (error) {
        this.emit(CallbackEmitter.EVENTS.FAILURE, error);
        // get the next interval we have to wait and schedule a new try
        const interval = this._retryIntervals[this.nextInterval];

        if (interval != null) {
          this.logger.warn(`trying the callback again in ${interval/1000.0} secs: ${this.callbackURL}`);
          this.nextInterval++;
          this._scheduleNext(interval);
          // no intervals anymore, time to give up
        } else {
          if (this.permanent){
            this.logger.warn(`callback retries expired, but it's permanent - try the callback again in ${this._permanentIntervalReset/1000.0} secs: ${this.callbackURL}`);
            this._scheduleNext(this._permanentIntervalReset);
          } else {
            this.emit(CallbackEmitter.EVENTS.STOPPED);
          }
        }
      }
    }, timeout);
  }

  async _dispatch() {
    let callbackURL;
    const serverDomain = this._serverDomain;
    const sharedSecret = this._secret;
    const bearerAuth = this._bearerAuth;
    const timeout = this._requestTimeout;

    // note: keep keys in alphabetical order
    const data = new URLSearchParams({
      domain: serverDomain,
      event: "[" + this.eventStr + "]",
      timestamp: this.timestamp,
    });
    const requestOptions = {
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
      const checksum = Utils.shaHex(
        `${this.callbackURL}${JSON.stringify(data)}${sharedSecret}`,
        this._checksumAlgorithm,
      );
      // get the final callback URL, including the checksum
      callbackURL = this.callbackURL;
      try {
        const urlObj = url.parse(this.callbackURL, true);
        callbackURL += Utils.isEmpty(urlObj.search) ? "?" : "&";
        callbackURL += `checksum=${checksum}`;
      } catch (error) {
        this.logger.error(`error parsing callback URL: ${this.callbackURL}`);
        throw error;
      }
    }

    // consider 401 as success, because the callback worked but was denied by the recipient
    const responseOk = (response) => response.ok || response.status === 401;
    const controller = new AbortController();
    const abortTimeout = setTimeout(() => {
      controller.abort();
    }, timeout);
    requestOptions.signal = controller.signal;
    const stringifiedEvent = simplifiedEvent(this.event);

    try {
      const response = await fetch(callbackURL, requestOptions);

      if (!responseOk(response)) {
        const failedResponseError = new Error(
          `Invalid response: ${response?.status || 'unknown'}` || 'unknown error',
        );
        failedResponseError.code = response?.status;
        throw failedResponseError;
      }

      this.logger.info(`successful callback call to: [${callbackURL}]`, {
        event: stringifiedEvent,
        status: response?.status,
        statusText: response?.statusText,
      });
    } catch (error) {
      if (error.code == null) error.code = 'unknown';
      this.logger.warn(`error in the callback call to: [${callbackURL}]`, {
        event: stringifiedEvent,
        errorMessage: error?.message,
        errorName: error?.name,
        errorCode: error.code,
        stack: error?.stack,
      });
      throw error;
    } finally {
      clearTimeout(abortTimeout);
    }
  }

  _clearDispatcher() {
    if (this._dispatcher != null) {
      clearTimeout(this._dispatcher);
      this._dispatcher = null;
    }
  }

  start() {
    this.timestamp = new Date().getTime();
    this.nextInterval = 0;
    this._scheduleNext(0);
  }

  stop() {
    this._clearDispatcher();
    if (!this._dispatched) this.emit(CallbackEmitter.EVENTS.STOPPED);

    this.removeAllListeners();
  }
}
