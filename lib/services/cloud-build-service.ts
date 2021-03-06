import * as path from "path";
import * as uuid from "uuid";
import { escape } from "querystring";
import * as constants from "../constants";
import { CloudService } from "./cloud-service";

export class CloudBuildService extends CloudService implements ICloudBuildService {
	protected get failedError() {
		return "Build failed.";
	}

	protected get failedToStartError() {
		return "Failed to start cloud build.";
	}

	constructor($constants: IDictionary<any>,
		$nsCloudErrorsService: IErrors,
		$fs: IFileSystem,
		$httpClient: Server.IHttpClient,
		$logger: ILogger,
		$nsCloudOperationFactory: ICloudOperationFactory,
		$nsCloudOutputFilter: ICloudOutputFilter,
		$nsCloudProcessService: IProcessService,
		private $nsCloudBuildHelper: ICloudBuildHelper,
		private $nsCloudBuildPropertiesService: ICloudBuildPropertiesService,
		private $mobileHelper: Mobile.IMobileHelper,
		private $devicePlatformsConstants: Mobile.IDevicePlatformsConstants,
		private $nsCloudConfigurationService: ICloudConfigurationService,
		private $nsCloudAccountsService: IAccountsService,
		private $nsCloudServerBuildService: IServerBuildService,
		private $nsCloudGitService: IGitService,
		private $nsCloudItmsServicesPlistHelper: IItmsServicesPlistHelper,
		private $nsCloudUploadService: IUploadService,
		private $nsCloudUserService: IUserService,
		private $nsCloudVersionService: IVersionService,
		private $nsCloudEncryptionService: ICloudEncryptionService,
		private $nsCloudPlatformService: ICloudPlatformService,
		private $projectHelper: IProjectHelper,
		private $projectDataService: IProjectDataService,
		private $qr: IQrCodeGenerator,
		private $nsCloudPlatformsData: ICloudPlatformsData,
		private $filesHashService: IFilesHashService) {
		super($nsCloudErrorsService, $fs, $httpClient, $logger, $constants, $nsCloudOperationFactory, $nsCloudOutputFilter, $nsCloudProcessService);
	}

	public getServerOperationOutputDirectory(options: IOutputDirectoryOptions): string {
		let result = path.join(options.projectDir, constants.CLOUD_TEMP_DIR_NAME, options.platform.toLowerCase());
		if (this.$mobileHelper.isiOSPlatform(options.platform)) {
			result = path.join(result, options.emulator ? constants.CLOUD_BUILD_DIRECTORY_NAMES.EMULATOR : constants.CLOUD_BUILD_DIRECTORY_NAMES.DEVICE);
		}

		return result;
	}

	/**
	 * Here only for backwards compatibility. Deleting this will require a major version change as it is used in NativeScript Sidekick.
	 */
	public getBuildOutputDirectory(options: ICloudBuildOutputDirectoryOptions): string {
		return this.getServerOperationOutputDirectory(options);
	}

	public async build(projectSettings: INSCloudProjectSettings,
		platform: string,
		buildConfiguration: string,
		accountId: string,
		androidBuildData?: IAndroidBuildData,
		iOSBuildData?: IIOSBuildData,
		buildOptions?: IBuildOptions): Promise<IBuildResultData> {

		(<INSCloudGlobal>global).showErrorForStoppedCloudBuilds();

		const result = await this.executeCloudOperation("Cloud build", async (cloudOperationId: string): Promise<IBuildResultData> => {
			this.$logger.info("Getting accounts information...");
			const account = await this.$nsCloudAccountsService.getAccountFromOption(accountId);
			this.$logger.info("Using account %s.", account.id);

			const buildResult = await this.executeBuild(projectSettings, platform, buildConfiguration, cloudOperationId, account.id, androidBuildData, iOSBuildData, buildOptions);
			return buildResult;
		});

		return result;
	}

	public async executeBuild(projectSettings: INSCloudProjectSettings,
		platform: string,
		buildConfiguration: string,
		cloudOperationId: string,
		accountId: string,
		androidBuildData?: IAndroidBuildData,
		iOSBuildData?: IIOSBuildData,
		buildOptions?: IBuildOptions): Promise<IBuildResultData> {

		(<INSCloudGlobal>global).showErrorForStoppedCloudBuilds();

		const buildInformationString = `Cloud build of '${projectSettings.projectDir}', platform: '${platform}', ` +
			`configuration: '${buildConfiguration}'`;
		this.$logger.info(`${buildInformationString}.`);

		await this.$nsCloudBuildPropertiesService.validateBuildProperties(platform, buildConfiguration, projectSettings.projectId, androidBuildData, iOSBuildData);
		if (buildOptions && buildOptions.shouldPrepare) {
			await this.prepareProject(cloudOperationId, projectSettings, platform, buildConfiguration, iOSBuildData);
		}
		let buildFiles: IServerItemBase[] = [];
		const isReleaseBuild = this.$nsCloudBuildHelper.isReleaseConfiguration(buildConfiguration);
		const isAndroidBuild = this.$mobileHelper.isAndroidPlatform(platform);
		if (isAndroidBuild && isReleaseBuild) {
			buildFiles.push({
				filename: uuid.v4(),
				fullPath: androidBuildData.pathToCertificate,
				disposition: constants.DISPOSITIONS.CRYPTO_STORE
			});
		} else if (this.$mobileHelper.isiOSPlatform(platform) && iOSBuildData.buildForDevice) {
			buildFiles.push({
				filename: uuid.v4(),
				fullPath: iOSBuildData.pathToCertificate,
				disposition: constants.DISPOSITIONS.KEYCHAIN
			});
			const provisionData = this.$nsCloudBuildHelper.getMobileProvisionData(iOSBuildData.pathToProvision);
			buildFiles.push({
				filename: `${provisionData.UUID}.mobileprovision`,
				fullPath: iOSBuildData.pathToProvision,
				disposition: constants.DISPOSITIONS.PROVISION
			});
		}

		const fileNames = buildFiles.map(buildFile => buildFile.filename);
		const buildCredentials = await this.$nsCloudServerBuildService.getBuildCredentials({ appId: projectSettings.projectId, fileNames: fileNames });

		const filesToUpload = this.prepareFilesToUpload(buildCredentials.urls, buildFiles);
		const additionalCliFlags: string[] = [];
		if (projectSettings.bundle) {
			additionalCliFlags.push("--bundle");
		}

		if (projectSettings.useHotModuleReload && !isReleaseBuild) {
			additionalCliFlags.push("--hmr");
		} else {
			additionalCliFlags.push("--no-hmr");
		}

		if (!projectSettings.bundle && !projectSettings.useHotModuleReload) {
			additionalCliFlags.push("--no-bundle");
		}

		const useAabFlag = isAndroidBuild && androidBuildData && androidBuildData.aab;
		if (useAabFlag) {
			additionalCliFlags.push("--aab");
		}

		if (projectSettings.env) {
			const envOptions = _.map(projectSettings.env, (value, key) => `--env.${key}=${value}`);
			additionalCliFlags.push(...envOptions);
		}

		let buildProps = await this.prepareBuildRequest({
			cloudOperationId: cloudOperationId,
			projectSettings,
			platform,
			buildConfiguration,
			buildCredentials,
			filesToUpload,
			additionalCliFlags,
			accountId
		});
		if (isAndroidBuild) {
			buildProps = await this.$nsCloudBuildPropertiesService.getAndroidBuildProperties(projectSettings, buildProps, filesToUpload, androidBuildData);
		} else if (this.$mobileHelper.isiOSPlatform(platform)) {
			buildProps = await this.$nsCloudBuildPropertiesService.getiOSBuildProperties(projectSettings, buildProps, filesToUpload, iOSBuildData);
		}

		this.emitStepChanged(cloudOperationId, constants.BUILD_STEP_NAME.BUILD, constants.BUILD_STEP_PROGRESS.START);
		const buildResponse: IServerResponse = await this.$nsCloudServerBuildService.startBuild(buildProps);
		this.$logger.trace("Build response:");
		this.$logger.trace(buildResponse);
		const buildResult: ICloudOperationResult = await this.waitForCloudOperationToFinish(cloudOperationId, buildResponse, { silent: false });
		this.emitStepChanged(cloudOperationId, constants.BUILD_STEP_NAME.BUILD, constants.BUILD_STEP_PROGRESS.END);

		this.$logger.trace("Build result:");
		this.$logger.trace(buildResult);

		if (!buildResult.buildItems || !buildResult.buildItems.length) {
			// Something failed.
			this.$nsCloudErrorsService.fail(`Build failed. Reason is: ${buildResult.errors}. Additional information: ${buildResult.stderr}.`);
		}

		this.$logger.info(`Finished ${buildInformationString} successfully. Downloading result...`);

		const localBuildResult = await this.downloadServerResult(cloudOperationId, buildResult, {
			projectDir: projectSettings.projectDir,
			platform,
			emulator: iOSBuildData && !iOSBuildData.buildForDevice,
			extension: useAabFlag ? "aab" : null
		});

		this.$logger.info(`The result of ${buildInformationString} successfully downloaded. OutputFilePath: ${localBuildResult}`);

		let qrData: IQrData = null;
		if (!useAabFlag) {
			const buildResultUrl = this.getBuildResultUrl(buildResult);
			const itmsOptions = {
				pathToProvision: iOSBuildData && iOSBuildData.pathToProvision,
				projectId: projectSettings.projectId,
				projectName: projectSettings.projectName,
				url: buildResultUrl
			};

			qrData = {
				originalUrl: buildResultUrl,
				imageData: await this.getImageData(buildResultUrl, itmsOptions)
			};
		}

		const result = {
			cloudOperationId: cloudOperationId,
			stderr: buildResult.stderr,
			stdout: buildResult.stdout,
			outputFilePath: localBuildResult,
			qrData
		};

		// In case HMR is passed, do not save the hashes as the files generated in the cloud may differ from the local ones.
		// We need to get the hashes from the cloud build, so until we have it, it is safer to execute fullSync after build.
		// This way we'll be sure HMR is working with cloud builds as it will rely on the local files.
		const platformData = this.$nsCloudPlatformsData.getPlatformData(platform, this.$projectDataService.getProjectData(projectSettings.projectDir));
		if ((<any>this.$filesHashService).saveHashesForProject && !projectSettings.useHotModuleReload) {
			await (<any>this.$filesHashService).saveHashesForProject(platformData, path.dirname(localBuildResult));
		}

		const buildInfoFileDirname = path.dirname(result.outputFilePath);
		this.$nsCloudPlatformService.saveBuildInfoFile(projectSettings.projectDir, buildInfoFileDirname, platformData);
		return result;
	}

	public validateBuildProperties(platform: string,
		buildConfiguration: string,
		appId: string,
		androidBuildData?: IAndroidBuildData,
		iOSBuildData?: IIOSBuildData): Promise<void> {
		(<INSCloudGlobal>global).showErrorForStoppedCloudBuilds();
		return this.$nsCloudBuildPropertiesService.validateBuildProperties(platform, buildConfiguration, appId, androidBuildData, iOSBuildData);
	}

	private prepareFilesToUpload(amazonStorageEntries: IAmazonStorageEntry[], buildFiles: IServerItemBase[]): IAmazonStorageEntryData[] {
		let result: IAmazonStorageEntryData[] = [];
		_.each(amazonStorageEntries, amazonStorageEntry => {
			_.each(buildFiles, buildFile => {
				if (amazonStorageEntry.fileName === buildFile.filename) {
					result.push(_.merge({ filePath: buildFile.fullPath, disposition: buildFile.disposition }, amazonStorageEntry));
				}
			});
		});

		return result;
	}

	private async prepareProject(cloudOperationId: string,
		projectSettings: INSCloudProjectSettings,
		platform: string,
		buildConfiguration: string,
		iOSBuildData: IIOSBuildData): Promise<void> {

		const projectData = this.$projectDataService.getProjectData(projectSettings.projectDir);

		let mobileProvisionData: IMobileProvisionData;
		let provision: string;

		if (iOSBuildData && iOSBuildData.pathToProvision) {
			mobileProvisionData = this.$nsCloudBuildHelper.getMobileProvisionData(iOSBuildData.pathToProvision);
			mobileProvisionData.Type = this.$nsCloudBuildHelper.getProvisionType(mobileProvisionData);
			provision = mobileProvisionData.UUID;
		}

		this.emitStepChanged(cloudOperationId, constants.BUILD_STEP_NAME.PREPARE, constants.BUILD_STEP_PROGRESS.START);

		// HACK: Ensure __PACKAGE__ is interpolated in app.gradle file in the user project.
		// In case we don't interpolate every other cloud android build is bound to fail because it would set the application's identifier to __PACKAGE__
		const userAppGradleFilePath = path.join(projectData.appResourcesDirectoryPath, this.$devicePlatformsConstants.Android, "app.gradle");
		if (this.$fs.exists(userAppGradleFilePath)) {
			const appGradleContents = this.$fs.readText(userAppGradleFilePath);
			const appGradleReplacedContents = appGradleContents.replace(/__PACKAGE__/g, projectSettings.projectId);
			if (appGradleReplacedContents !== appGradleContents) {
				this.$fs.writeFile(userAppGradleFilePath, appGradleReplacedContents);
			}
		}

		await this.$nsCloudPlatformService.preparePlatform(projectSettings, platform, buildConfiguration, projectData, provision, mobileProvisionData);

		this.emitStepChanged(cloudOperationId, constants.BUILD_STEP_NAME.PREPARE, constants.BUILD_STEP_PROGRESS.END);
	}

	private async prepareBuildRequest(settings: IPrepareBuildRequestInfo): Promise<IBuildRequestData> {
		this.emitStepChanged(settings.cloudOperationId, constants.BUILD_STEP_NAME.UPLOAD, constants.BUILD_STEP_PROGRESS.START);
		let buildFiles;
		try {
			await this.$nsCloudGitService.gitPushChanges(settings.projectSettings,
				{ httpRemoteUrl: settings.buildCredentials.codeCommit.cloneUrlHttp },
				settings.buildCredentials.codeCommit.credentials,
				{ isNewRepository: settings.buildCredentials.codeCommit.isNewRepository });

			buildFiles = [
				{
					disposition: constants.DISPOSITIONS.PACKAGE_GIT,
					sourceUri: settings.buildCredentials.codeCommitUrl
				}
			];
		} catch (err) {
			this.$logger.warn("Unable to use git, reason is:");
			this.$logger.warn(err.message);
			const filePath = await this.$nsCloudBuildHelper.zipProject(settings.projectSettings.projectDir);
			const preSignedUrlData = await this.$nsCloudServerBuildService.getPresignedUploadUrlObject(uuid.v4());
			const disposition = constants.DISPOSITIONS.PACKAGE_ZIP;
			settings.filesToUpload.push(_.merge({ filePath, disposition }, preSignedUrlData));
			buildFiles = [
				{
					disposition,
					sourceUri: preSignedUrlData.publicDownloadUrl
				}
			];
		}

		for (const fileToUpload of settings.filesToUpload) {
			await this.$nsCloudUploadService.uploadToS3(fileToUpload.filePath, fileToUpload.fileName, fileToUpload.uploadPreSignedUrl);
		}

		this.emitStepChanged(settings.cloudOperationId, constants.BUILD_STEP_NAME.UPLOAD, constants.BUILD_STEP_PROGRESS.END);
		const runtimeVersion = await this.$nsCloudVersionService.getProjectRuntimeVersion(settings.projectSettings.projectDir, settings.platform);
		const cliVersion = await this.$nsCloudVersionService.getCliVersion(runtimeVersion);
		const sanitizedProjectName = this.$projectHelper.sanitizeName(settings.projectSettings.projectName);
		const workflow: IWorkflowRequestData = settings.projectSettings.workflowName && settings.projectSettings.workflowUrl && {
			workflowName: settings.projectSettings.workflowName,
			workflowUrl: settings.projectSettings.workflowUrl
		};

		/** Although the nativescript-cloud is an extension that is used only with nativescript projects,
		 * current implementation of the builder daemon will not add default framework. This breaks tooling when incremental build is
		 * performed. Passing the framework=tns here is more consistent that adding conditional
		 * behavior in the tooling.
		 */
		const result: IBuildRequestData = {
			cloudOperationId: settings.cloudOperationId,
			accountId: settings.accountId,
			properties: {
				buildConfiguration: settings.buildConfiguration,
				sharedCloud: settings.projectSettings.sharedCloud,
				platform: settings.platform,
				appIdentifier: settings.projectSettings.projectId,
				frameworkVersion: cliVersion,
				runtimeVersion: runtimeVersion,
				sessionKey: settings.buildCredentials.sessionKey, // TODO: remove this parameter after we deploy our new server.
				templateAppName: sanitizedProjectName,
				projectName: sanitizedProjectName,
				framework: "tns",
				flavorId: settings.projectSettings.flavorId,
				additionalCliFlags: settings.additionalCliFlags,
				useIncrementalBuild: !settings.projectSettings.clean,
				userEmail: this.$nsCloudUserService.getUser().email,
				workspacePassword: await this.$nsCloudEncryptionService.getWorkspacePassword(settings.projectSettings)
			},
			workflow,
			targets: [],
			buildFiles
		};

		const cloudConfigData = this.$nsCloudConfigurationService.getCloudConfigurationData();
		if (cloudConfigData && cloudConfigData.machineId) {
			result.machineId = cloudConfigData.machineId;
		}

		return result;
	}

	private getBuildResultUrl(buildResult: ICloudOperationResult): string {
		// We expect only one buildResult - .ipa, .apk ...
		return this.getServerResults(buildResult)[0].fullPath;
	}

	protected getServerResults(buildResult: ICloudOperationResult): IServerItem[] {
		const result = _.find(buildResult.buildItems, b => b.disposition === constants.DISPOSITIONS.BUILD_RESULT);

		if (!result) {
			this.$nsCloudErrorsService.fail("No item with disposition BuildResult found in the build result items.");
		}

		return [result];
	}

	private async downloadServerResult(cloudOperationId: string, buildResult: ICloudOperationResult, buildOutputOptions: ICloudOperationOutputOptions): Promise<string> {
		this.emitStepChanged(cloudOperationId, constants.BUILD_STEP_NAME.DOWNLOAD, constants.BUILD_STEP_PROGRESS.START);
		const targetFileNames = await super.downloadServerResults(buildResult, buildOutputOptions);
		this.emitStepChanged(cloudOperationId, constants.BUILD_STEP_NAME.DOWNLOAD, constants.BUILD_STEP_PROGRESS.END);
		return targetFileNames[0];
	}

	private async getImageData(buildResultUrl: string, options: IItmsPlistOptions): Promise<string> {
		if (options.pathToProvision) {
			const provisionData = this.$nsCloudBuildHelper.getMobileProvisionData(options.pathToProvision);
			const provisionType = this.$nsCloudBuildHelper.getProvisionType(provisionData);
			if (provisionType !== constants.PROVISION_TYPES.ADHOC) {
				return null;
			}

			const preSignedUrlData = await this.$nsCloudServerBuildService.getPresignedUploadUrlObject(uuid.v4());
			await this.$nsCloudUploadService.uploadToS3(this.$nsCloudItmsServicesPlistHelper.createPlistContent(options), preSignedUrlData.fileName, preSignedUrlData.uploadPreSignedUrl);
			return this.$qr.generateDataUri(`itms-services://?action=download-manifest&amp;url=${escape(preSignedUrlData.publicDownloadUrl)}`);
		}

		return this.$qr.generateDataUri(buildResultUrl);
	}

	private emitStepChanged(cloudOperationId: string, step: string, progress: number): void {
		const buildStep: IBuildStep = { cloudOperationId: cloudOperationId, step, progress };
		this.emit(constants.CLOUD_BUILD_EVENT_NAMES.STEP_CHANGED, buildStep);
	}
}

$injector.register("nsCloudBuildService", CloudBuildService);
