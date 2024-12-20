import { FileSystemAdapter, normalizePath, Notice, Plugin } from "obsidian";
import ConflictModal from "./src/ui/ConflictModal";
import SettingTab from "src/ui/SettingTab";
import Synchronizer, { ConflictError } from "src/Synchronizer";
import { join } from "path";
import { writeFileSync } from "fs";

// Remember to rename these classes and interfaces!

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
		if (this.manifest.dir) {
			this.pluginDir = this.manifest.dir;
		} else {
			new Notice(
				"Could not load plugin directory from manifest..." +
					"Plugin can't be loaded."
			);
			return;
		}
		this.vaultDir = normalizePath(this.app.vault.getRoot().path);
		console.log(this.app.vault.adapter.getResourcePath(normalizePath(this.pluginDir)));
		return;
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		this.addRibbonIcon("cloud-upload", "S3 Sync", async () => {
			await this.doFullSync();
		});

		this.addCommand({
			id: "s3sync-full-sync",
			name: "Start full synchronization to S3",
			callback: async () => {
				await this.doFullSync();
			},
		});

		this.addSettingTab(new SettingTab(this.app, this));
	}

	onunload() {
		// TODO: Do we need to do something here?
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

	async doFullSync(onlyFinishLastSync = false) {
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText("Synchronizing vault to S3...");
		let synchronizer;
		try {
			synchronizer = new Synchronizer(
				this.app.vault.getRoot().path,
				this.dbPath,
				this.settings
			);
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
					e.conflict
				);
				modal.onClose = () => {
					modal.contentEl.empty();
					// Use setTimeout to prevent recursion causing stack overflow
					setTimeout(async () => {
						await this.doFullSync(true);
					}, 0);
				};
			} else {
				new Notice(`Error synchronizing: ${e.message}`, 0);
				throw e;
			}
		} finally {
			statusBarItemEl.remove();
		}
	}
}
