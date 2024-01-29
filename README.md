# bbb-webhooks

This is a node.js application that listens for all events on BigBlueButton and sends POST requests with details about these events to hooks registered via an API. A hook is any external URL that can receive HTTP POST requests.

You can read the full documentation at: https://docs.bigbluebutton.org/development/webhooks

## Dependencies and pre-requisites

There are a few dependencies that need to be installed before you can run this application.
Their minimum versions are listed below.

| Dependency            | Minimum version             |
|-----------------------|:---------------------------:|
| Node.js               | >= v18.x                    |
| npm                   | >= v7.x                     |
| Redis                 | >= v5.0                     |

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

## Manually installing the application on a BBB server

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

## Running via Docker

A sample docker-compose for convenience that should get the application image
built and running with as little effort as possible. See the [Dockerfile](Dockerfile)
and [docker-compose.yml](docker-compose.yml) for more details.

To build and run the application image, run the following command from within
the root directory of the project:

```
docker-compose up -d
```

To stop the application, run the following command from within the root directory
of the project:

```
docker-compose down
```

The container runs with the default Node container user, `node`. To override it,
feel free to set the `user` property in the `docker-compose.yml` file (e.g.: `user: ${UID}:${GID}`).

### Configuring the application when running via Docker

The application configuration can be modified by creating and editing an override
file in `/etc/bigbluebutton/bbb-webhooks/production.yml`. The file will be mounted
into the container and its contents will be *merged* with the default configuration.
The only exception to this are array attributes, which are *replaced*.

The default configuration file used by the container can be found at
[config/default.example.yml](config/default.example.yml).

As an example, suppose you want to override the `bbb.serverDomain` and
`bbb.sharedSecret` values as well as enable the `out/xapi` module. You would
create the following override file:

```yaml
bbb:
  serverDomain: 'bbb.example.com'
  sharedSecret: 'secret'
modules:
  ../out/xapi/index.js:
    enabled: true
```

The rest of the configurable attributes can be found in the default configuration
file at [config/default.example.yml](config/default.example.yml).
