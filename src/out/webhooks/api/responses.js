const RETURN_CODES = {
  SUCCESS: "SUCCESS",
  FAILED: "FAILED",
};
const MESSAGE_KEYS = {
  checksumError: "checksumError",
  createHookError: "createHookError",
  duplicateWarning: "duplicateWarning",
  destroyHookError: "destroyHookError",
  listHookError: "listHookError",
  destroyMissingHook: "destroyMissingHook",
  missingParamCallbackURL: "missingParamCallbackURL",
  missingParamHookID: "missingParamHookID",
};

const failure = (key, msg) =>
  `<response> \
      <returncode>${RETURN_CODES.FAILED}</returncode> \
      <messageKey>${key}</messageKey> \
      <message>${msg}</message> \
    </response>`;

const checksumError = failure(
  MESSAGE_KEYS.checksumError,
  "You did not pass the checksum security check.",
);

const createSuccess = (id, permanent, getRaw) =>
  `<response> \
      <returncode>${RETURN_CODES.SUCCESS}</returncode> \
      <hookID>${id}</hookID> \
      <permanentHook>${permanent}</permanentHook> \
      <rawData>${getRaw}</rawData> \
    </response>`;

const createFailure = failure(
  MESSAGE_KEYS.createHookError,
  "An error happened while creating your hook. Check the logs."
);

const createDuplicated = (id) =>
  `<response> \
      <returncode>${RETURN_CODES.SUCCESS}</returncode> \
      <hookID>${id}</hookID> \
      <messageKey>${MESSAGE_KEYS.duplicateWarning}</messageKey> \
      <message>There is already a hook for this callback URL.</message> \
    </response>`;

const destroySuccess =
  `<response> \
      <returncode>${RETURN_CODES.SUCCESS}</returncode> \
      <removed>true</removed> \
    </response>`;

const destroyFailure = failure(
  MESSAGE_KEYS.destroyHookError,
  "An error happened while removing your hook. Check the logs."
);

const destroyNoHook = failure(
  MESSAGE_KEYS.destroyMissingHook,
  "The hook informed was not found."
);

const missingParamCallbackURL = failure(
  MESSAGE_KEYS.missingParamCallbackURL,
  "You must specify a callbackURL in the parameters."
);
const missingParamHookID = failure(
  MESSAGE_KEYS.missingParamHookID,
  "You must specify a hookID in the parameters."
);

const listFailure = failure(
  MESSAGE_KEYS.listHookError,
  "An error happened while listing registered hooks. Check the logs."
);

export default {
  RETURN_CODES,
  MESSAGE_KEYS,
  checksumError,
  createSuccess,
  createFailure,
  createDuplicated,
  destroySuccess,
  destroyFailure,
  destroyNoHook,
  listFailure,
  missingParamCallbackURL,
  missingParamHookID,
};
