const failure = (key, msg) =>
  `<response> \
      <returncode>FAILED</returncode> \
      <messageKey>${key}</messageKey> \
      <message>${msg}</message> \
    </response>`;
const checksumError = failure(
  "checksumError",
  "You did not pass the checksum security check.",
);
const createSuccess = (id, permanent, getRaw) =>
  `<response> \
      <returncode>SUCCESS</returncode> \
      <hookID>${id}</hookID> \
      <permanentHook>${permanent}</permanentHook> \
      <rawData>${getRaw}</rawData> \
    </response>`;

const createFailure = failure(
  "createHookError",
  "An error happened while creating your hook. Check the logs."
);

const createDuplicated = (id) =>
  `<response> \
      <returncode>SUCCESS</returncode> \
      <hookID>${id}</hookID> \
      <messageKey>duplicateWarning</messageKey> \
      <message>There is already a hook for this callback URL.</message> \
    </response>`;

const destroySuccess =
  `<response> \
      <returncode>SUCCESS</returncode> \
      <removed>true</removed> \
    </response>`;

const destroyFailure = failure(
  "destroyHookError",
  "An error happened while removing your hook. Check the logs."
);

const destroyNoHook = failure(
  "destroyMissingHook",
  "The hook informed was not found."
);

const missingParamCallbackURL = failure(
  "missingParamCallbackURL",
  "You must specify a callbackURL in the parameters."
);
const missingParamHookID = failure(
  "missingParamHookID",
  "You must specify a hookID in the parameters."
);

export default {
  checksumError,
  createSuccess,
  createFailure,
  createDuplicated,
  destroySuccess,
  destroyFailure,
  destroyNoHook,
  missingParamCallbackURL,
  missingParamHookID,
};
