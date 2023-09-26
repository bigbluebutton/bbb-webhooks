import sha1 from "sha1";
import url from "url";
import config from "config";

// Calculates the checksum given a url `fullUrl` and a `salt`, as calculate by bbb-web.
const checksumAPI = function(fullUrl, salt) {
  const query = queryFromUrl(fullUrl);
  const method = methodFromUrl(fullUrl);
  return checksum(method + query + salt);
};

// Calculates the checksum for a string.
// Just a wrapper for the method that actually does it.
const checksum = string => sha1(string);

// Get the query of an API call from the url object (from url.parse())
// Example:
//
// * `fullUrl` = `http://bigbluebutton.org/bigbluebutton/api/create?name=Demo+Meeting&meetingID=Demo`
// * returns: `name=Demo+Meeting&meetingID=Demo`
const queryFromUrl = function(fullUrl) {

  // Returns the query without the checksum.
  // We can't use url.parse() because it would change the encoding
  // and the checksum wouldn't match. We need the url exactly as
  // the client sent us.
  let query = fullUrl.replace(/&checksum=[^&]*/, '');
  query = query.replace(/checksum=[^&]*&/, '');
  query = query.replace(/checksum=[^&]*$/, '');
  const matched = query.match(/\?(.*)/);
  if (matched != null) {
    return matched[1];
  } else {
    return '';
  }
};

// Get the method name of an API call from the url object (from url.parse())
// Example:
//
// * `fullUrl` = `http://mconf.org/bigbluebutton/api/create?name=Demo+Meeting&meetingID=Demo`
// * returns: `create`
const methodFromUrl = function(fullUrl) {
  const urlObj = url.parse(fullUrl, true);
  return urlObj.pathname.substr((config.get("bbb.apiPath") + "/").length);
};

// Returns the IP address of the client that made a request `req`.
// If can not determine the IP, returns `127.0.0.1`.
const ipFromRequest = function(req) {

  // the first ip in the list if the ip of the client
  // the others are proxys between him and us
  let ipAddress;
  if ((req.headers != null ? req.headers["x-forwarded-for"] : undefined) != null) {
    let ips = req.headers["x-forwarded-for"].split(",");
    ipAddress = ips[0] != null ? ips[0].trim() : undefined;
  }

  // fallbacks
  if (!ipAddress) { ipAddress = req.headers != null ? req.headers["x-real-ip"] : undefined; } // when behind nginx
  if (!ipAddress) { ipAddress = req.connection != null ? req.connection.remoteAddress : undefined; }
  if (!ipAddress) { ipAddress = "127.0.0.1"; }
  return ipAddress;
};

const isEmpty = (obj) => [Object, Array].includes((obj || {}).constructor)
  && !Object.entries((obj || {})).length;

const sortBy = (key) => (a, b) => {
  if (a[key] > b[key]) return 1;
  if (a[key] < b[key]) return -1;
  return 0;
};

const stringify = (obj) => {
  if (obj == null) return obj;

  switch (typeof obj) {
    case "string":
      return obj;
    case "object":
      return JSON.stringify(obj);
    default:
      return obj.toString();
  }
}

export default {
  checksumAPI,
  checksum,
  queryFromUrl,
  methodFromUrl,
  ipFromRequest,
  isEmpty,
  sortBy,
  stringify,
};
