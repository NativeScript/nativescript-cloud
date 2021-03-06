/**
 * Helper interface for publishing data transfer objects.
 */
interface IPackagePaths {
	/**
	 * Paths to the packages to be published - can be either local files or URLs.
	 */
	packagePaths: string[];
}

/**
 * Helper interface combining common properties of all platforms.
 */
interface IPublishDataCore extends IPackagePaths, IProjectDir, ISharedCloud { }

/**
 * Describes an optional property passing iOS team identifier.
 */
interface IOptionalTeamIdentifier {
	/**
	 * Team in which to publish.
	 */
	teamId?: string;
}

/**
 * Describes Apple two-factor authentication properties required for publishing.
 */
interface IApple2FAOptions {
	/**
	 * Apple application specific password.
	 */
	appleApplicationSpecificPassword?: string;

	/**
	 * Apple login session generated by fastlane.
	 */
	appleSession?: string;
}

/**
 * Describes data needed to publish to iTunes Connect.
 */
interface IItunesConnectPublishData extends IPublishDataCore {
	/**
	 * Credentials for iTunes Connect.
	 */
	credentials: IPublishCredentials;
}

/**
 * Describes strings which can be passed when publishing to Google Play in order to manipulate the publish track.
 */
interface IOptionalAndroidTrack {
	/**
	 * Track for which to publish - "alpha" | "beta" | "production".
	 */
	track?: string;
}

/**
 * Describes data needed to publish to Google Play.
 */
interface IGooglePlayPublishData extends IPublishDataCore, IOptionalAndroidTrack {
	/**
	 * Path to local json file generated through Google API Console.
	 */
	pathToAuthJson: string;

	/**
	 * The desired status of this release. Acceptable values are: completed, draft, halted, inProgress.
	 */
	androidReleaseStatus?: string;
}

/**
 * Describes methods for publishing builds to each platform's respective application store through the cloud.
 */
interface ICloudPublishService extends ICloudService {
	/**
	 * Publishes the given .ipa packages to iTunes Connect.
	 * @param {IItunesConnectPublishData} publishData Data needed to publish to iTunes Connect.
	 * @returns {Promise<void>}
	 */
	publishToItunesConnect(publishData: IItunesConnectPublishData): Promise<void>;

	/**
	 * Publishes the given .apk packages to Google Play.
	 * @param {IGooglePlayPublishData} publishData Data needed to publish to Google Play.
	 * @returns {Promise<void>}
	 */
	publishToGooglePlay(publishData: IGooglePlayPublishData): Promise<void>;
}

/**
 * Describes methods for working with Apple Id in the cloud.
 */
interface ICloudAppleService extends ICloudService {
	/**
	 * Uses the provided Apple credentials to generate fastlane session.
	 * @param {ICredentials} credentials The Apple credentials.
	 * @returns {Promise<string>}
	 */
	appleLogin(credentials: ICredentials): Promise<string>;
}

interface IAppleLoginResponse {
	appleSession: string;
}
