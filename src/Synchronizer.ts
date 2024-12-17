import { S3SyncPluginSettings } from "main";
import S3Helper from "./S3Helper";
import * as db from "./db";
import { getFiles } from "./utils";
import { join } from "path";
import { FileInfo } from "./types";
import { stat, rm } from "fs/promises";

export class ConflictError extends Error {
	conflict: string;

	constructor(conflict: string) {
		super("Local and remote files are in conflict.");
		this.name = "ConflictError";
		this.conflict = conflict;
	}
}

export default class Synchronizer {
	private vaultPath: string;
	private s3: S3Helper;
	private dbPath: string;


	constructor(vaultPath: string, dbPath: string, settings: S3SyncPluginSettings) {
		this.vaultPath = vaultPath.replace(/\/$/, "");
		this.s3 = new S3Helper({ ...settings });
		this.dbPath = dbPath;
		db.init(dbPath);
	}

	async loadFilesToBeSynchronizedToDatabase() {
		for await (const file of getFiles(this.vaultPath)) {
			db.insertOrUpdateFile({
				...file,
				remote: false,
				synchronizing: true,
			});
		}
		for await (const object of this.s3.listObjects()) {
			db.insertOrUpdateFile({
				...object,
				remote: true,
				synchronizing: true,
			});
		}
		db.deleteFilesNotNeedingSynchronization();
	}

	async syncToBucket(fileInfo: FileInfo) {
		if (!fileInfo.currentLocalFile) {
			throw new Error(
				"Uh oh! This error should never happen. The file should exist locally."
			);
		}
		await this.s3.uploadObject(
			fileInfo.currentLocalFile.path,
			join(this.vaultPath, fileInfo.currentLocalFile.path)
		);
		const mtime = (
			await stat(join(this.vaultPath, fileInfo.currentLocalFile.path))
		).mtime.getTime();
		db.insertOrUpdateFile({
			...fileInfo.currentLocalFile,
			mtime,
			remote: false,
			synchronizing: false,
		});
		db.insertOrUpdateFile({
			...fileInfo.currentLocalFile,
			mtime,
			remote: true,
			synchronizing: false,
		});
	}

	async syncToLocal(fileInfo: FileInfo) {
		if (!fileInfo.currentRemoteFile) {
			throw new Error(
				"Holy moly! This error should never happen. The remote file should exist."
			);
		}
		await this.s3.downloadObject(
			fileInfo.currentRemoteFile.path,
			join(this.vaultPath, fileInfo.currentRemoteFile.path)
		);
		db.insertOrUpdateFile({
			...fileInfo.currentRemoteFile,
			remote: false,
			synchronizing: false,
		});
		db.insertOrUpdateFile({
			...fileInfo.currentRemoteFile,
			remote: true,
			synchronizing: false,
		});
	}

	async removeLocalFile(filePath: string) {
		await rm(join(this.vaultPath, filePath));
		db.deleteFile(filePath, false, false);
	}

	async removeRemoteFile(filePath: string) {
		await this.s3.deleteObject(filePath);
		db.deleteFile(filePath, true, false);
	}

	async solveFileConflict(fileInfo: FileInfo) {
		if (!fileInfo.currentLocalFile || !fileInfo.currentRemoteFile) {
			throw new Error(
				"Well this is embarassing... This error should never happen."
			);
		}
		if (
			fileInfo.currentLocalFile.mtime > fileInfo.currentRemoteFile.mtime
		) {
			// If file has not changed in remote since last sync, upload it
			if (fileInfo.prevRemoteFile?.mtime === fileInfo.currentRemoteFile.mtime) {
				await this.syncToBucket(fileInfo);
			} else {
				throw new ConflictError(fileInfo.currentLocalFile.path);
			}
		} else if (
			fileInfo.currentLocalFile.mtime < fileInfo.currentRemoteFile.mtime
		) {
			// If file has not changed locally since last sync, download it
			if (fileInfo.prevLocalFile?.mtime === fileInfo.currentLocalFile.mtime) {
				await this.syncToLocal(fileInfo);
			} else {
				throw new ConflictError(fileInfo.currentLocalFile.path);
			}
		}
	}

	async syncFile(filePath: string) {
		const fileInfo = db.getFileInfo(filePath);
		if (!fileInfo) {
			throw new Error(`Could not find file ${filePath} in database ${this.dbPath}.`);
		}

		if (fileInfo.currentLocalFile && !fileInfo.currentRemoteFile) {
			if (fileInfo.prevLocalFile?.mtime === fileInfo.currentLocalFile.mtime) {
				await this.removeLocalFile(fileInfo.currentLocalFile.path);
			} else {
				await this.syncToBucket(fileInfo);
			}
		} else if (!fileInfo.currentLocalFile && fileInfo.currentRemoteFile) {
			if (fileInfo.prevRemoteFile?.mtime === fileInfo.currentRemoteFile.mtime) {
				await this.removeRemoteFile(fileInfo.currentRemoteFile.path);
			} else {
				await this.syncToLocal(fileInfo);
			}
		} else if (fileInfo.currentLocalFile && fileInfo.currentRemoteFile) {
			await this.solveFileConflict(fileInfo);
		}
		db.markFileSynchronizationComplete(filePath);
	}

	async manuallySolveFileConflict(filePath: string, fileToKeep: "local" | "remote") {
		const fileInfo = db.getFileInfo(filePath);
		if (!fileInfo) {
			throw new Error(`Could not find file ${filePath} in database ${this.dbPath}.`);
		}
		if (fileToKeep === "local") {
			await this.syncToBucket(fileInfo);
		} else {
			await this.syncToLocal(fileInfo);
		}
		db.markFileSynchronizationComplete(filePath);
	}

	/**
	 * Synchronize local files with S3 bucket.
	 */
	async startSync(onlyFinishLastSync = false) {
		// Ensure last synchronization was completed
		const existingFilesNeedingSync = db.getFilesInSynchronization();
		for (const filePath of existingFilesNeedingSync) {
			await this.syncFile(filePath);
		}
		if (onlyFinishLastSync) {
			return;
		}
		// Load files to be synchronized to database and synchronize them
		await this.loadFilesToBeSynchronizedToDatabase();
		const filesNeedingSync = db.getFilesInSynchronization();
		for (const filePath of filesNeedingSync) {
			await this.syncFile(filePath);
		}
	}
}
