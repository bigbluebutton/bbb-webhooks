# CHANGELOG

All notable changes to this project will be documented in this file.

### v3.0.0-beta.4 (UNRELEASED)

* fix(test): use redisUrl for node-redis client configuration
* fix(test): pick up mocha configs via new .mocharc.yml file
* build: set .nvmrc to lts/iron (Node.js 20)

### v3.0.0-beta.3

* build: bullmq@4.17.0, bump transitive deps

### v3.0.0-beta.2

* fix(webhooks): re-implement includeEvents/excludeEvents

### v3.0.0-beta.1

* fix(xapi): ensure the correct lrs_endpoint is used
* feat(xapi): add suport for meta_xapi-create-end-actor-name

### v3.0.0-beta.0

* feat(test): add support for modular test suites
* feat(test): add xAPI test suite
* refactor(test): remove nock as a dependency
* fix(test): restore remaining out/webhooks tests
* fix(xapi): set chat message statements timestamp to ISO format
* fix: add Redis disconnection handling

### v3.0.0-alpha.1

* !refactor: application rewritten to use a modular input/processing/ouput system
* !refactor: modernize codebase (ES6 imports, Node.js >= 18 etc.)
* !refactor(webhooks): the webhooks functionality was rewritten into an output module
* !refactor(webhooks): hook IDs are now UUIDs instead of integers
* !refactor: new logging system (using Pino)
* !refactor: migrate node-redis from v3 to v4
* !refactor: new queue system (using Bullmq)
* refactor(webhooks): replace request with node-fetch
* refactor: replace sha1 dependency with native code
* feat: new xAPI output module with support for multitenancy
    - Implements https://github.com/gaia-x-dases/xapi-virtual-classroom
    - For more information: (README.md)[src/out/xapi/README.md]
* feat(events): add support for poll events
* feat(events): add support for raise-hand events
* feat(events): add support for emoji events
* feat(events): add user info to screenshare events
* feat(events): add support for audio muted/unmuted events
* feat: add Prometheus instrumentation
* feat: add JSDoc annotations to most of the codebase
* feat: log to file
* feat: add support for multiple checksum algorithms (SHA1,...,SHA512)
* fix(events): user-left events are now emitted for trailing users on meeting-ended events
* build: add docker-compose and updated Dockerfile examples
