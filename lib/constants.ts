export const CLOUD_TEMP_DIR_NAME = ".cloud";
export const RELEASE_CONFIGURATION_NAME = "release";

export const CRYPTO = {
	CERTIFICATE_HEADER: "-----BEGINCERTIFICATE-----",
	CERTIFICATE_FOOTER: "-----ENDCERTIFICATE-----",
	ORGANIZATION_FIELD_NAME: "O",
	COMMON_NAME_FIELD_NAME: "CN",
	PLIST_HEADER: "<plist",
	PLIST_FOOTER: "</plist>"
};

export const APPLE_INC = "Apple Inc.";

export const PROVISION_TYPES = {
	ENTERPRISE: "Enterprise",
	APP_STORE: "App Store",
	ADHOC: "AdHoc",
	DEVELOPMENT: "Development",
};

export const AUTH_SERVICE_NAME = "auth-service";
export const BUILD_SERVICE_NAME = "build-service";
export const EMULATORS_SERVICE_NAME = "emulators-service";

export const CLOUD_BUILD_EVENT_NAMES = {
	BUILD_OUTPUT: "buildOutput"
};

export const DEVICE_DISCOVERY_EVENTS = {
	DEVICE_FOUND: "deviceFound",
	DEVICE_LOST: "deviceLost"
};

export const CLOUD_BUILD_DIRECTORY_NAMES = {
	DEVICE: "device",
	EMULATOR: "emulator"
};

export const DEVICE_INFO = {
	TYPE: "Emulator",
	STATUS: "Connected",
	VENDOR: "Cloud Emulator"
};

export const CONTENT_TYPES = {
	APPLICATION_JSON: "application/json",
	TEXT_HTML: "text/html",
	TEXT_JAVASCRIPT: "text/javascript",
	TEXT_CSS: "text/css",
	IMAGE_JPEG: "image/jpeg",
	IMAGE_PNG: "image/png"
};

export const HTTP_METHODS = {
	GET: "GET",
	POST: "POST",
	PUT: "PUT",
	DELETE: "DELETE"
};

export const HTTP_HEADERS = {
	ACCEPT: "Accept",
	AUTHORIZATION: "Authorization",
	CONNECTION: "Connection",
	CONTENT_TYPE: "Content-Type",
	LOCATION: "Location"
};

export const HTTP_STATUS_CODES = {
	SUCCESS: 200,
	FOUND: 302,
	UNAUTHORIZED: 401,
	PAYMENT_REQUIRED: 402
};
