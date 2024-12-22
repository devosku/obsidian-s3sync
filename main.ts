import { Notice, Plugin } from "obsidian";
import ConflictModal from "./src/ui/ConflictModal";
import SettingTab from "./src/ui/SettingTab";

import FileSystemAdapter from "./src/FileSystemAdapter";
import Synchronizer, { ConflictError } from "./src/Synchronizer";
import FileSyncRepository from "src/FileSyncRepository";

export interface S3SyncPluginSettings {
	bucket: string;
	region: string;
	accessKeyId: string;
	secretAccessKey: string;
	endpoint?: string;
}

const DEFAULT_SETTINGS: S3SyncPluginSettings = {
	bucket: "",
	region: "",
	accessKeyId: "",
	secretAccessKey: "",
};

export default class S3SyncPlugin extends Plugin {
	settings: S3SyncPluginSettings;
	dbPath: string;
	pluginDir: string;
	vaultDir: string;

	async onload() {
		await this.loadSettings();

		this.addRibbonIcon("cloud-upload", "S3 Sync", async () => {
			await this.doFullSync();
		});

		this.addCommand({
			id: "s3sync-full-sync",
			name: "Synchronize vault with S3",
			callback: async () => {
				await this.doFullSync();
			},
		});

		this.addSettingTab(new SettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	createSynchronizer() {
		return new Synchronizer(
			new FileSystemAdapter(this.app),
			// @ts-ignore not documented anywhere but app.appId is what Obsidian
			// uses to store data in indexeddb for different vaults
			new FileSyncRepository(this.app.appId + "-s3sync"),
			this.settings
		);
	}

	async doFullSync(onlyFinishLastSync = false) {
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText("Synchronizing vault with S3...");
		let synchronizer;

		try {
			synchronizer = this.createSynchronizer();
		} catch (e) {
			new Notice(`Error synchronizing: ${e.message}`, 0);
			statusBarItemEl.remove();
			throw e;
		}

		try {
			await synchronizer.startSync(onlyFinishLastSync);
		} catch (e) {
			if (e instanceof ConflictError) {
				const modal = new ConflictModal(
					this.app,
					synchronizer,
					e.conflict,
					() => {
						modal.contentEl.empty();
						// Use setTimeout to prevent recursion causing stack overflow
						setTimeout(async () => {
							await this.doFullSync(true);
						}, 0);
					}
				);
				modal.open();
			} else {
				new Notice(`Error synchronizing: ${e.message}`, 0);
				throw e;
			}
		} finally {
			statusBarItemEl.remove();
		}
	}
}
