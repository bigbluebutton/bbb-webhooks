# bbb-webhooks

This is a node.js application that listens for all events on BigBlueButton and sends POST requests with details about these events to hooks registered via an API. A hook is any external URL that can receive HTTP POST requests.

You can read the full documentation at: https://docs.bigbluebutton.org/development/webhooks


## Development

With a [working development environment](https://docs.bigbluebutton.org/development/guide), follow the commands below from within the `bigbluebutton/bbb-webhooks` directory.

1. Install the node dependencies:
    - `npm install`
      * See the recommended node version in the `.nvmrc` file or `package.json`'s `engines.node` property.

2. Configure the application:
    - `cp config/default.example.yml config/default.yml`
      * This sets up the default configuration values for the application.
    - `touch config/development.yml`
      * Create a new configuration file for your development environment where you will be able to override specific values from the default configuration file:
    - Add the `bbb.serverDomain` and `bbb.sharedSecret` values to match your BBB server configuration in the newly created `config/development.yml`.

3. Stop the bbb-webhook service:
    - `sudo systemctl stop bbb-webhooks`

4. Run the application:
    - `npm start`

### Persistent Hooks

If you want all webhooks from a BBB server to post to your 3rd party application/s, you can modify the configuration file to include `permanentURLs` and define one or more server urls which you would like the webhooks to post back to.

To add these permanent urls, do the following:
 - `sudo nano config/development.yml`
 - Add the `modules."../out/webhhooks/index.js".config.permanentURLs` property to the configuration file, and add one or more urls to the `url` property. You can also add a `getRaw` property to the object to specify whether or not you want the raw data to be sent to the url. If you do not specify this property, it will default to `false`.
    - ```
      ../out/webhooks/index.js:
        config:
          permanentURLs:
            - url: 'https://staging.example.com/webhook-post-route'
              getRaw: false
            - url: 'https://app.example.com/webhook-post-route'
              getRaw: true
      ```

Once you have adjusted your configuration file, you will need to restart your development/app server to adapt to the new configuration.

If you are editing these permanent urls after they have already been committed to the application once, you may need to flush the redis database in order for adjustments to these permanent hooks to get picked up by your application. Use the following command to do so:
 - `redis-cli flushall`
 - **_IMPORTANT:_** Running the above command clears the redis database entirely. This will result in all meetings, processing or not, to be cleared from the database, and may result in broken meetings currently processing.


## Production

Follow the commands below starting within the `bigbluebutton/bbb-webhooks` directory.

1. Copy the entire webhooks directory:
    - `sudo cp -r . /usr/local/bigbluebutton/bbb-webhooks`

2. Move into the directory we just copied the files to:
    - `cd /usr/local/bigbluebutton/bbb-webhooks`

3. Install the dependencies:
    - `npm install`

4. Copy the configuration file:
    - `sudo cp config/default.example.yml config/default.yml`
    - Update the `serverDomain` and `sharedSecret` values to match your BBB server configuration:
        - `sudo nano config/default.yml`

9. Start the bbb-webhooks service:
    - `sudo systemctl bbb-webhooks restart`
