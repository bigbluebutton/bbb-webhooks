/* eslint no-console: "off" */

// Lists all the events that happen in a meeting. Run with 'node events.js'.
// Uses the first meeting started after the application runs and will list all
// events, but only the first time they happen.
import express from "express";
import fetch from "node-fetch";
import crypto from "crypto";
import bodyParser from 'body-parser';

// server configs
const eject = (reason) => { throw new Error(reason); }
const port = process.env.PORT || 3006;
const sharedSecret = process.env.SHARED_SECRET || eject("SHARED_SECRET not set");
const catcherDomain = process.env.CATCHER_DOMAIN || eject("CATCHER_DOMAIN not set");
const bbbDomain = process.env.BBB_DOMAIN || eject("BBB_DOMAIN not set");
const FOREVER = (process.env.FOREVER && process.env.FOREVER === 'true') || false;
const GET_RAW = (process.env.GET_RAW && process.env.GET_RAW === 'true') || false;
const EVENT_ID = process.env.EVENT_ID || '';
const MEETING_ID = process.env.MEETING_ID || '';

let server = null;

const encodeForUrl = (value) => {
  return encodeURIComponent(value)
    .replace(/%20/g, '+')
    .replace(/[!'()]/g, escape)
    .replace(/\*/g, "%2A")
};

const shutdown = (code) => {
  console.log(`Shutting down server, code ${code}`);
  if (server) server.close();
  process.exit(code);
}

// create a server to listen for callbacks
const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));
server = app.listen(port);
app.post("/callback", (req, res) => {
  try {
    console.log("-------------------------------------");
    console.log("* Received:", req.url);
    console.log("* Body:", req.body);
    console.log("-------------------------------------\n");
    res.statusCode = 200;
    res.send();
  } catch (error) {
    console.error("Error processing callback:", error);
    res.statusCode = 500;
    res.send();
  }
});
console.log("Server listening on port", port);

// registers a hook on the webhooks app
const myUrl = "http://" + catcherDomain + ":" + port + "/callback";
let params = "callbackURL=" + encodeForUrl(myUrl) + "&getRaw=" + GET_RAW;
if (EVENT_ID) params += "&eventID=" + EVENT_ID;
if (MEETING_ID) params += "&meetingID=" + MEETING_ID;
const checksum = crypto.createHash('sha1').update("hooks/create" + params + sharedSecret).digest('hex');
const fullUrl = "http://" + bbbDomain + "/bigbluebutton/api/hooks/create?" +
  params + "&checksum=" + checksum
console.log("Registering a hook with", fullUrl);

const registerHook = async () => {
  const controller = new AbortController();
  const abortTimeout = setTimeout(() => {
    controller.abort();
  }, 2500);

  try {
    const response = await fetch(fullUrl, { signal: controller.signal });
    const text = await response.text();
    if (response.ok) {
      console.debug("Hook registered - response from hook/create:", text);
    } else {
      throw new Error(text);
    }
  } catch (error) {
    console.error("Hook registration failed - response from hook/create:", error);
    // if FOREVER, then keep trying to register the hook
    // every 3s until it works - else exit with code 1
    if (FOREVER) {
      console.log("Trying again in 3s...");
      setTimeout(registerHook, 3000);
    } else {
      shutdown(1);
    }
  } finally {
    clearTimeout(abortTimeout);
  }
};

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('uncaughtException',  (error) => {
  console.error('uncaughtException:', error);
  shutdown(1);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('unhandledRejection:', reason, promise);
  shutdown(1);
});

registerHook();
