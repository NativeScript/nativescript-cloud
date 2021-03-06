import { EOL } from "os";

export class UserCommand implements ICommand {
	public allowedParameters: ICommandParameter[] = [];

	constructor(private $nsCloudEulaCommandHelper: IEulaCommandHelper,
		private $nsCloudUserService: IUserService,
		private $logger: ILogger) { }

	public async execute(args: string[]): Promise<void> {
		await this.$nsCloudEulaCommandHelper.ensureEulaIsAccepted();

		const user = this.$nsCloudUserService.getUser();
		let message: string;

		if (!user) {
			message = "You are not logged in.";
		} else {
			message = `Current user: ${EOL}E-mail: ${user.email}${EOL}First name: ${user.firstName}${EOL}Last name: ${user.lastName}`;
		}

		this.$logger.info(message);
	}
}

$injector.registerCommand("user", UserCommand);
