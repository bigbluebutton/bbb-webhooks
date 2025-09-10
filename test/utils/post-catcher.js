/* eslint no-console: "off" */
import express from "express";
import bodyParser from 'body-parser';
import EventEmitter from 'events';

const encodeForUrl = (value) => {
  return encodeURIComponent(value)
    .replace(/%20/g, '+')
    .replace(/[!'()]/g, escape)
    .replace(/\*/g, "%2A")
};

class PostCatcher extends EventEmitter {
  static encodeForUrl = encodeForUrl;

  constructor (url, {
    useLogger = false,
    path = "/callback",
  } = {}) {
    super();
    this.url = url;
    this.started = false;
    this.path = path;
    this._parsedUrl = new URL(url);
    this.port = this._parsedUrl.port;
    this.logger = useLogger ? console : { log: () => {}, error: () => {} };
    if (!this.port) throw new Error("Port not specified in URL");
  }

  start () {
    return new Promise((resolve, reject) => {
      this.app = express();
      this.app.use(bodyParser.json());
      this.app.use(bodyParser.urlencoded({
        extended: true
      }));
      this.app.post(this.path, (req, res) => {
        try {
          this.logger.log("-------------------------------------");
          this.logger.log("* Received:", req.url);
          this.logger.log("* Body:", req.body);
          this.logger.log("-------------------------------------\n");
          res.statusCode = 200;
          res.send(JSON.stringify({ status: "OK" }));
          // In-depth request info for tests that require them
          this.emit("callback:request", { url: req.url, body: req.body });
          this.emit("callback", req.body);
        } catch (error) {
          this.logger.error("Error processing callback:", error);
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
}

export default PostCatcher;
