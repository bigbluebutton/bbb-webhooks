# CHANGELOG

All notable changes to this project will be documented in this file.

### v3.2.1

* fix: catch all HTTPServer errors in the prom module
* fix: app stalling due to borked shutdown procedure
* build: mocha@10.7.0
* build: fast-xml-parser@4.4.1

### v3.2.0

* feat(xapi): add support for Basic auth via meta_secret-lrs-payload
* fix(xapi): LRS credentials wouldn't persist in the database
* fix: remove cache-to from image push to make dockerhub images usable
* build: nodemon@3.1.4
* build: express@4.19.2

### v3.1.0

* feat(events): add guest field to user-joined/user-left

### v3.0.0

#### Changelog since v3.0.0-beta.5

* chore: update github-slug-actions to v4.4.1
* fix: adjust actions triggers for pr (+ opened, reopened)

#### Changelog since v2.6.1

* feat: new xAPI output module with support for multitenancy
    - Implements https://github.com/gaia-x-dases/xapi-virtual-classroom
    - For more information: (README.md)[src/out/xapi/README.md]
* feat(xapi): add suport for meta_xapi-create-end-actor-name
* feat(webhooks): implement includeEvents/excludeEvents
* feat(events): add support for poll events
* feat(events): add support for raise-hand events
* feat(events): add support for emoji events
* feat(events): add user info to screenshare events
* feat(events): add support for audio muted/unmuted events
* feat: support internal_meeting_id != record_id on rap events
* feat: add Prometheus instrumentation
* feat: add JSDoc annotations to most of the codebase
* feat: log to file
* feat: add support for multiple checksum algorithms (SHA1,...,SHA512)
* feat(test): add support for modular test suites
* feat(test): add xAPI test suite
* feat: pipelines with GitHub Actions
* !refactor: application rewritten to use a modular input/processing/ouput system
* !refactor: modernize codebase (ES6 imports, Node.js >= 18 etc.)
* !refactor(webhooks): the webhooks functionality was rewritten into an output module
* !refactor(webhooks): hook IDs are now UUIDs instead of integers
* !refactor: new logging system (using Pino)
* !refactor: migrate node-redis from v3 to v4
* !refactor: new queue system (using Bullmq)
* refactor(test): remove nock as a dependency
* refactor(webhooks): replace request with node-fetch
* refactor: replace sha1 dependency with native code
* refactor: remove unused events
  * `rap-published`, `rap-unpublished`, `rap-deleted`
* !fix(webhooks): remove general getRaw configuration
* fix(events): user-left events are now emitted for trailing users on meeting-ended events
* fix(test): restore remaining out/webhooks tests
* fix: add Redis disconnection handling
* build: add docker-compose and updated Dockerfile examples
* build: set .nvmrc to lts/iron (Node.js 20)

### v3.0.0-beta.5

* feat: pipelines with GitHub Actions

### v3.0.0-beta.4

* fix: use ISO timestamps in production logs
* refactor: remove unused events
  * `rap-published`, `rap-unpublished`, `rap-deleted`
* feat: support internal_meeting_id != record_id on rap events
* !fix(webhooks): remove general getRaw configuration
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
