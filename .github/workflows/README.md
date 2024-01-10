Add the following secrets to the GitHub repo:
```
REGISTRY_USERNAME
REGISTRY_TOKEN
```
They are the credentials to be used to push the image to the docker images registry.

Add the following variables to the GitHub repo:
```
REGISTRY_URI
REGISTRY_ORGANIZATION
```
Considering the image `bigbluebutton/bbb-webhooks:v3.0.0`, the value for `REGISTRY_URI` would be `docker.io` (URI for DockerHub) and `REGISTRY_ORGANIZATION` would be `bigbluebutton`. The image name `bbb-webhooks` isn't configurable, and the tag will be the GitHub tag OR `pr-<pr number>`.
