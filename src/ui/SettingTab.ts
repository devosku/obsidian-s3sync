import { App, PluginSettingTab, Setting } from "obsidian";

import S3SyncPlugin from "../../main";

export default class SettingTab extends PluginSettingTab {
	plugin: S3SyncPlugin;

	constructor(app: App, plugin: S3SyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Amazon S3 Bucket Name")
			.setDesc("S3 Bucket to synchronize the vault with")
			.addText((text) =>
				text
					.setPlaceholder("Enter your Amazon S3 Bucket Name")
					.setValue(this.plugin.settings.bucket)
					.onChange(async (value) => {
						this.plugin.settings.bucket = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Bucket Region")
			.setDesc("Select the buckets region")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("us-east-1", "US East (N. Virginia)")
					.addOption("us-east-2", "US East (Ohio)")
					.addOption("us-west-1", "US West (N. California)")
					.addOption("us-west-2", "US West (Oregon)")
					.addOption("af-south-1", "Africa (Cape Town)")
					.addOption("ap-east-1", "Asia Pacific (Hong Kong)")
					.addOption("ap-south-2", "Asia Pacific (Hyderabad)")
					.addOption("ap-southeast-3", "Asia Pacific (Jakarta)")
					.addOption("ap-southeast-5", "Asia Pacific (Malaysia)")
					.addOption("ap-southeast-4", "Asia Pacific (Melbourne)")
					.addOption("ap-south-1", "Asia Pacific (Mumbai)")
					.addOption("ap-northeast-3", "Asia Pacific (Osaka)")
					.addOption("ap-northeast-2", "Asia Pacific (Seoul)")
					.addOption("ap-southeast-1", "Asia Pacific (Singapore)")
					.addOption("ap-southeast-2", "Asia Pacific (Sydney)")
					.addOption("ap-northeast-1", "Asia Pacific (Tokyo)")
					.addOption("ca-central-1", "Canada (Central)")
					.addOption("ca-west-1", "Canada West (Calgary)")
					.addOption("cn-north-1", "China (Beijing)")
					.addOption("cn-northwest-1", "China (Ningxia)")
					.addOption("eu-central-1", "Europe (Frankfurt)")
					.addOption("eu-west-1", "Europe (Ireland)")
					.addOption("eu-west-2", "Europe (London)")
					.addOption("eu-south-1", "Europe (Milan)")
					.addOption("eu-west-3", "Europe (Paris)")
					.addOption("eu-south-2", "Europe (Spain)")
					.addOption("eu-north-1", "Europe (Stockholm)")
					.addOption("eu-central-2", "Europe (Zurich)")
					.addOption("il-central-1", "Israel (Tel Aviv)")
					.addOption("me-south-1", "Middle East (Bahrain)")
					.addOption("me-central-1", "Middle East (UAE)")
					.addOption("sa-east-1", "South America (São Paulo)")
					.setValue(this.plugin.settings.region)
					.onChange(async (value) => {
						this.plugin.settings.region = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Access Key ID")
			.setDesc(
				"Access Key ID for IAM user that has permission to access the bucket"
			)
			.addText((text) => {
				text.setPlaceholder("Enter your Access Key ID")
					.setValue(this.plugin.settings.accessKeyId)
					.onChange(async (value) => {
						this.plugin.settings.accessKeyId = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Secret Access Key")
			.setDesc(
				"Secret Access key for IAM user that has permission to access the bucket"
			)
			.addText((text) => {
				text.inputEl.type = "password";
				text.setPlaceholder("Enter your Secret Access Key")
					.setValue(this.plugin.settings.secretAccessKey)
					.onChange(async (value) => {
						this.plugin.settings.secretAccessKey = value;
						await this.plugin.saveSettings();
					});
			});
	}
}
