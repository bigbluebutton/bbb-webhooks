# xAPI output module
This is a bbb-webhooks output module responsible for exporting events from BigBlueButton (BBB) to a Learning Record Store (LRS) using the xAPI pattern.

# YAML configuration
This module is set and configured in the `default.yml` file using the following YAML structure:

```yml
modules:
  ../out/xapi/index.js:
    type: out
    config:
      lrs:
        lrs_endpoint: https://your_lrs.endpoint
        lrs_username: user
        lrs_password: pass
      uuid_namespace: 01234567-89ab-cdef-0123-456789abcdef
      redis:
        keys:
          meetings: bigbluebutton:webhooks:xapi:meetings
          meetingPrefix: bigbluebutton:webhooks:xapi:meeting
          users: bigbluebutton:webhooks:xapi:users
          userPrefix: bigbluebutton:webhooks:xapi:user
          polls: bigbluebutton:webhooks:xapi:polls
          pollPrefix: bigbluebutton:webhooks:xapi:poll
```
## LRS Configuration
The LRS configuration section specifies the details required to connect to the Learning Record Store (LRS) where the xAPI statements will be sent. Here are the configuration parameters:

- **lrs_endpoint**: The URL of the LRS where xAPI statements will be sent.
- **lrs_username**: The username or API key used to authenticate with the LRS.
- **lrs_password**: The password or API key secret used for authentication with the LRS.

This is the standalone strategy to connect to the LRS, because it does not support multi-tenancy. Connection to the LRS with multi-tenancy could be achieved by sending relevant metadata (explained below), and if that method is used, these parameters are ignored, and thus are not required.

## UUID Namespace
The **uuid_namespace** parameter is used to define a unique identifier namespace for generating UUIDs. This namespace helps ensure uniqueness when generating identifiers for xAPI statements, and should be kept safe.

## Redis Configuration
The Redis configuration section defines the keys and key prefixes used for storing and retrieving data related to BBB events. These keys and prefixes are associated with different types of events within the application:

- **meetings**: Key for storing information about meetings.
- **meetingPrefix**: Prefix for keys related to specific meeting events.
- **users**: Key for storing information about users.
- **userPrefix**: Prefix for keys related to specific user events.
- **polls**: Key for storing information about polls or surveys.
- **pollPrefix**: Prefix for keys related to specific poll events.

# BBB event metadata
You have the option to set relevant metadata when creating a meeting in Big Blue Button (BBB). This metadata allows you to control the generation and sending of xAPI events to the Learning Record Store (LRS).

## Supported Metadata Parameters
### meta_xapi-enabled
- **Description**: This parameter controls whether xAPI events are generated and sent to the LRS for a specific meeting.
- **Values**: true or false
- **Default Value**: true (xAPI events are enabled by default)

If you set `meta_xapi-enabled` to false, no xAPI events will be generated or sent to the LRS for that particular meeting. This provides the flexibility to choose which meetings should be tracked using xAPI.

### meta_secret-lrs-payload
- **Description**: This parameter allows you to specify the credentials and endpoint of the Learning Record Store (LRS) where the xAPI events will be sent. The payload is a Base64-encoded string representing a JSON object encrypted (AES 256/PBKDF2) using the **server secret** as the **passphrase**.
- **Value Format**: Base64-encoded JSON object encrypted with AES 256/PBKDF2 encryption
- **JSON Payload Structure**:
```json
{
  "lrs_endpoint": "https://lrs1.example.com",
  "lrs_token": "AAF32423SDF5345"
}
```
- **Encrypting the Payload**: The Payload should be encrypted with the server secret using the following bash command (provided the lrs credential are in the `lrs.conf` file and server secret is `bab3fd92bcd7d464`):
```bash
cat ./lrs.conf | openssl aes-256-cbc -pass "pass:bab3fd92bcd7d464" -pbkdf2 -a -A
```
- **Decrypting the Payload**: The Payload can be decrypted with the server secret using the following bash command:
```bash
echo -n U2FsdGVkX18fLg33ChrHbHyIvbcdDwU6+4yX2yTb4gbDKOKSG3hhsd2+TS0ZK15fZlo4G1SQqaxm1OGo1fIsoji82T4SD4y5p1G2g9E9gAKzZC2Z5R454rw7/xGvX7uYGd/fbJcZraMYmafX1Zg3qA== | openssl aes-256-cbc -d -pass "pass:bab3fd92bcd7d464" -pbkdf2 -a -A
``````
- **Example**:
```
meta_secret-lrs-payload: U2FsdGVkX18fLg33ChrHbHyIvbcdDwU6+4yX2yTb4gbDKOKSG3hhsd2+TS0ZK15fZlo4G1SQqaxm1OGo1fIsoji82T4SD4y5p1G2g9E9gAKzZC2Z5R454rw7/xGvX7uYGd/fbJcZraMYmafX1Zg3qA==
```

The `meta_secret-lrs-payload` parameter allows you to securely define the LRS endpoint and authentication token for each meeting. It ensures that xAPI events generated during the meeting are sent to the correct LRS.

This strategy to connect to the LRS supports multi-tenancy, as each meeting could point to a different LRS endpoint. If this parameter is present in the metadata, the endpoint and credentials contained in the YML file (lrs_* parameters) are ignored and thus not required.
