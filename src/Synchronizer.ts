import { S3SyncPluginSettings } from "main";
import S3Helper from "./S3Helper";
import { FileSyncInfo, FileSyncType, IFileSystemAdapter, SyncProgressState } from "./types";
import FileSyncRepository from "./FileSyncRepository";

export class ConflictError extends Error {
	conflict: FileSyncInfo;

	constructor(conflict: FileSyncInfo) {
		super("Local and remote files are in conflict.");
		this.name = "ConflictError";
		this.conflict = conflict;
	}
}

function validateSettings(settings: S3SyncPluginSettings) {
	const { bucket, region, accessKeyId, secretAccessKey } = settings;
	if (!bucket) {
		throw new Error("Missing bucket in settings");
	}
	if (!region) {
		throw new Error("Missing region in settings");
	}
	if (!accessKeyId) {
		throw new Error("Missing access key id in settings");
	}
	if (!secretAccessKey) {
		throw new Error("Missing secret access key in settings");
	}
}

export default class Synchronizer {
	public s3: S3Helper;
	public fileSystem: IFileSystemAdapter;
	public fileSyncRepository: FileSyncRepository;
	private progressListeners: ((state: SyncProgressState) => void)[] = [];

	constructor(
		fileSystem: IFileSystemAdapter,
		fileSyncRepository: FileSyncRepository,
		settings: S3SyncPluginSettings
	) {
		validateSettings(settings);
		this.s3 = new S3Helper({ ...settings });
		this.fileSystem = fileSystem;
		this.fileSyncRepository = fileSyncRepository;
	}

	addProgressListener(listener: (state: SyncProgressState) => void) {
		this.progressListeners.push(listener);
	}

	async loadFilesToBeSynchronizedToDatabase() {
		const localFilesMap = await this.fileSystem.getFilesMap();
		for await (const object of this.s3.listObjects()) {
			if (localFilesMap[object.path]) {
				const localFile = localFilesMap[object.path];
				if (
					localFile.mtime === object.mtime &&
					localFile.size === object.size
				) {
					delete localFilesMap[object.path];
					continue;
				}
			}
			await this.fileSyncRepository.upsert({
				...object,
				type: FileSyncType.RemoteFile,
			});
		}
		for (const path in localFilesMap) {
			await this.fileSyncRepository.upsert({
				...localFilesMap[path],
				type: FileSyncType.LocalFile,
			});
		}
	}

	async syncToBucket(fileInfo: FileSyncInfo) {
		if (!fileInfo.localFile) {
			throw new Error(
				"Uh oh! This error should never happen. The file should exist locally."
			);
		}
		const buffer = await this.fileSystem.readBinary(
			fileInfo.localFile.path
		);
		await this.s3.uploadObject(fileInfo.localFile.path, buffer, {
			mtime: fileInfo.localFile.mtime.toString(),
		});

		await this.fileSyncRepository.upsert({
			...fileInfo.localFile,
			type: FileSyncType.LastSyncedFile
		});
	}

	async syncToLocal(fileInfo: FileSyncInfo) {
		if (!fileInfo.remoteFile) {
			throw new Error(
				"Holy moly! This error should never happen. The remote file should exist."
			);
		}
		const buffer = await this.s3.downloadObject(
			fileInfo.remoteFile.path
		);
		await this.fileSystem.writeBinary(fileInfo.remoteFile.path, buffer);
		await this.fileSyncRepository.upsert({
			...fileInfo.remoteFile,
			type: FileSyncType.LastSyncedFile
		});
	}

	async removeLocalFile(filePath: string) {
		await this.fileSystem.delete(filePath);
		await this.fileSyncRepository.delete(filePath, FileSyncType.LastSyncedFile);
	}

	async removeRemoteFile(filePath: string) {
		await this.s3.deleteObject(filePath);
		await this.fileSyncRepository.delete(filePath, FileSyncType.LastSyncedFile);
	}

	async solveFileConflict(fileInfo: FileSyncInfo) {
		if (!fileInfo.localFile || !fileInfo.remoteFile) {
			throw new Error(
				"Well this is embarassing... This error should never happen."
			);
		}
		if (
			fileInfo.localFile.mtime > fileInfo.remoteFile.mtime
		) {
			// If file has not changed in remote since last sync, upload it
			if (
				fileInfo.lastSyncedFile?.mtime ===
				fileInfo.remoteFile.mtime
			) {
				await this.syncToBucket(fileInfo);
			} else {
				throw new ConflictError(fileInfo);
			}
		} else if (
			fileInfo.localFile.mtime < fileInfo.remoteFile.mtime
		) {
			// If file has not changed locally since last sync, download it
			if (
				fileInfo.lastSyncedFile?.mtime ===
				fileInfo.localFile.mtime
			) {
				await this.syncToLocal(fileInfo);
			} else {
				throw new ConflictError(fileInfo);
			}
		} else {
			// If both files have the same mtime
			throw new ConflictError(fileInfo);
		}
	}

	async syncFile(filePath: string) {
		const fileInfo = await this.fileSyncRepository.getFileSyncInfo(
			filePath
		);
		if (!fileInfo) {
			throw new Error(`Could not find file ${filePath} in database`);
		}

		if (fileInfo.localFile && !fileInfo.remoteFile) {
			if (
				fileInfo.lastSyncedFile?.mtime ===
				fileInfo.localFile.mtime
			) {
				await this.removeLocalFile(fileInfo.localFile.path);
			} else {
				await this.syncToBucket(fileInfo);
			}
		} else if (!fileInfo.localFile && fileInfo.remoteFile) {
			if (
				fileInfo.lastSyncedFile?.mtime ===
				fileInfo.remoteFile.mtime
			) {
				await this.removeRemoteFile(fileInfo.remoteFile.path);
			} else {
				await this.syncToLocal(fileInfo);
			}
		} else if (fileInfo.localFile && fileInfo.remoteFile) {
			await this.solveFileConflict(fileInfo);
		}
		await this.fileSyncRepository.markSynchronizationComplete(filePath);
	}

	async manuallySolveFileConflict(
		filePath: string,
		fileToKeep: "local" | "remote"
	) {
		const fileInfo = await this.fileSyncRepository.getFileSyncInfo(
			filePath
		);
		if (!fileInfo) {
			throw new Error(`Could not find file ${filePath} in database.`);
		}
		if (!fileInfo.localFile || !fileInfo.remoteFile) {
			throw new Error(
				"Tried to solve a conflict for a file " +
					`${filePath} that is not in conflict.`
			);
		}

		if (fileToKeep === "local") {
			await this.syncToBucket(fileInfo);
		} else {
			await this.syncToLocal(fileInfo);
		}
		await this.fileSyncRepository.markSynchronizationComplete(filePath);
	}

	private triggerProgressListeners(state: SyncProgressState) {
		for (const listener of this.progressListeners) {
			listener(state);
		}
	}

	/**
	 * Synchronize local files with S3 bucket.
	 */
	async startSync(onlyFinishLastSync = false) {
		// Ensure last synchronization was completed
		const existingFilesNeedingSync =
			await this.fileSyncRepository.getFilesInSynchronization();
		for (let i = 0; i < existingFilesNeedingSync.length - 1; i++) {
			const file = existingFilesNeedingSync[i];
			this.triggerProgressListeners({
				msg: `Synchronizing ${file.path}`,
				current: i + 1,
				total: existingFilesNeedingSync.length,
			});

			await this.syncFile(file.path);
		}
		if (onlyFinishLastSync) {
			return;
		}
		// Load files to be synchronized to database and synchronize them
		await this.loadFilesToBeSynchronizedToDatabase();
		const filesInSync =
			await this.fileSyncRepository.getFilesInSynchronization();
		for (let i = 0; i < filesInSync.length; i++) {
			const file = filesInSync[i];
			this.triggerProgressListeners({
				msg: `Synchronizing ${file.path}`,
				current: i + 1,
				total: filesInSync.length,
			});
			await this.syncFile(file.path);
		}
	}
}
