/* eslint no-console: "off" */

import fetch from "node-fetch";
import crypto from "crypto";
import { XMLParser } from "fast-xml-parser";

const eject = (reason) => { throw new Error(reason); }
const sharedSecret = process.env.SHARED_SECRET || eject("SHARED_SECRET not set");
const bbbDomain = process.env.BBB_DOMAIN || eject("BBB_DOMAIN not set");
const MEETING_ID = process.env.MEETING_ID || '';
const parser = new XMLParser();

const shutdown = (code) => {
  console.log(`Shutting down, code ${code}`);
  process.exit(code);
}

// registers a hook on the webhooks app
let params = "";
if (MEETING_ID) params += "&meetingID=" + MEETING_ID;
const checksum = crypto.createHash('sha1').update("hooks/list" + params + sharedSecret).digest('hex');
const fullUrl = "http://" + bbbDomain + "/bigbluebutton/api/hooks/list?" +
  params + "&checksum=" + checksum
console.log("Registering a hook with", fullUrl);

const listHooks = async () => {
  const controller = new AbortController();
  const abortTimeout = setTimeout(() => {
    controller.abort();
  }, 2500);

  try {
    const response = await fetch(fullUrl, { signal: controller.signal });
    const text = await response.text();
    if (response.ok) {
      const hooksObj = parser.parse(text);
      const hooks = hooksObj.response?.hooks?.hook || [];
      const length = !Array.isArray(hooks) ? (Object.keys(hooks).length > 0 | 0): hooks.length;

      console.debug("Registered hooks (hooks/list):", {
        hooks,
        returncode: hooksObj.response.returncode,
        numberOfHooks: length,
      });
    } else {
      throw new Error(text);
    }
  } catch (error) {
    console.error("Hooks/list failed", error);
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

listHooks();
