process.env.NODE_CONFIG_DIR = `/etc/bigbluebutton/bbb-webhooks/:${process.cwd()}/config/`;
process.env.SUPPRESS_NO_CONFIG_WARNING = "true";

export const NODE_CONFIG_DIR = process.env.NODE_CONFIG_DIR;
export const SUPPRESS_NO_CONFIG_WARNING = process.env.SUPPRESS_NO_CONFIG_WARNING;
