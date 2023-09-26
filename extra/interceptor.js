/* eslint no-console: "off" */

// Lists all the events that happen in a meeting. Run with 'node events.js'.
// Uses the first meeting started after the application runs and will list all
// events, but only the first time they happen.
import express from "express";
import request from "request";
import sha1 from "sha1";
import bodyParser from 'body-parser';

// server configs
const eject = (reason) => { throw new Error(reason); }
const port = process.env.PORT || 3006;
const sharedSecret = process.env.SHARED_SECRET || eject("SHARED_SECRET not set");
const catcherDomain = process.env.CATCHER_DOMAIN || eject("CATCHER_DOMAIN not set");
const bbbDomain = process.env.BBB_DOMAIN || eject("BBB_DOMAIN not set");
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

// registers a global hook on the webhooks app
const myUrl = "http://" + catcherDomain + ":" + port + "/callback";
const params = "callbackURL=" + encodeForUrl(myUrl);
const checksum = sha1("hooks/create" + params + sharedSecret);
const fullUrl = "http://" + bbbDomain + "/bigbluebutton/api/hooks/create?" +
  params + "&checksum=" + checksum
const requestOptions = {
  uri: fullUrl,
  method: "GET"
}
console.log("Registering a hook with", fullUrl);
request(requestOptions, (error, response, body) => {
  const statusCode = response?.statusCode;
  // consider 401 as success, because the callback worked but was denied by the recipient
  if (statusCode >= 200 && statusCode < 300) {
    console.debug("Hook registed - response from hook/create:", body);
  } else {
    console.log("Hook registration failed - response from hook/create:", body);
    shutdown(1);
  }
});

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
