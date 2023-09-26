/* eslint no-console: "off" */

import redis from 'redis';
import fs from 'node:fs';

// Lists all the events that happen in a meeting. Run with 'node events.js'.
// Uses the first meeting started after the application runs and will list all
// events, but only the first time they happen.
const eventsPrinted = [];
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || '';
const FILENAME = process.env.FILENAME;
const DEDUPE = (process.env.DEDUPE && process.env.DEDUPE === 'true') || false;
const PRETTY_PRINT = (process.env.PRETTY_PRINT && process.env.PRETTY_PRINT === 'true') || false;
const CHANNELS = process.env.CHANNELS || [
  'from-akka-apps-redis-channel',
  'from-bbb-web-redis-channel',
  'from-akka-apps-chat-redis-channel',
  'from-akka-apps-pres-redis-channel',
  'bigbluebutton:from-rap',
];

const containsOrAdd = (list, value) => {
  for (let i = 0; i <= list.length-1; i++) {
    if (list[i] === value) {
      return true;
    }
  }
  list.push(value);
  return false;
}

const onMessage = (_message) => {
  try {
    const message = JSON.parse(_message);
    if (Object.prototype.hasOwnProperty.call(message, 'envelope')) {
      const messageName = message.envelope.name;

      if (!DEDUPE || !containsOrAdd(eventsPrinted, messageName)) {
        console.log("\n###", messageName, "\n");
        console.log(message);
        console.log("\n");

        // Write events as a pretty-printed JSON object to FILENAME, always appending
        // Each JSON is isolated and separated by a newline
        if (FILENAME) {
          const writableMessage = PRETTY_PRINT
            ? JSON.stringify(message, null, 2)
            : JSON.stringify(message);
          fs.appendFile(FILENAME, writableMessage  + "\n", (err) => {
            if (err) console.error(err);
          });
        }
      }
    }
  } catch(error) {
    console.error(`error processing ${_message}`, error);
  }
}

const subscribe = (client, channels, messageHandler) => {
  if (client == null) {
    throw new Error("client not initialized");
  }

  return Promise.all(
    channels.map((channel) => {
      return client.subscribe(channel, messageHandler)
        .then(() => console.info(`subscribed to: ${channel}`))
        .catch((error) => console.error(`error subscribing to: ${channel}: ${error}`));
    })
  );
};

const client = redis.createClient({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
});

client.connect()
  .then(() => subscribe(client, CHANNELS, onMessage))
  .catch((error) => console.error("error connecting to redis:", error));
