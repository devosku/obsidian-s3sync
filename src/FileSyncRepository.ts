import { FileSyncModel, FileSyncType, isFileSyncInfo } from "./types";
import { Dexie, EntityTable } from "dexie";

export default class FileSyncRepository {
	private db: Dexie & {
		fileSync: EntityTable<FileSyncModel, "id">;
	};
	private version = 1;

	constructor(databaseName: string) {
		// @ts-ignore
		this.db = new Dexie(databaseName);
		this.db.version(this.version).stores({
			fileSync: "++id, [path+type]",
		});
	}

	/**
	 * Insert or update file history model to database.
	 * @param fileSync File history model
	 * @returns
	 */
	async upsert(fileSync: Omit<FileSyncModel, "id">) {
		const existing = await this.db.fileSync
			.where({
				path: fileSync.path,
				type: fileSync.type,
			})
			.first();
		if (existing) {
			await this.db.fileSync.update(existing.id, {
				path: fileSync.path,
				type: fileSync.type,
				size: fileSync.size,
				mtime: fileSync.mtime,
			});
		} else {
			await this.db.fileSync.add({
				path: fileSync.path,
				type: fileSync.type,
				size: fileSync.size,
				mtime: fileSync.mtime,
			});
		}
	}

	async delete(path: string, type: FileSyncType) {
		return this.db.fileSync
			.where({
				path: path,
				type: type,
			})
			.delete();
	}

	async deleteAll() {
		return this.db.fileSync.clear();
	}

	async getAll() {
		return this.db.fileSync.toArray();
	}

	async getFileSyncInfo(path: string) {
		const fileSyncInfo: any = {};
		await this.db.fileSync
			.filter((fileSync) => fileSync.path === path)
			.each((fileSync) => {
				switch (fileSync.type) {
					case FileSyncType.LastSyncedFile:
						fileSyncInfo.lastSyncedFile = fileSync;
						break;
					case FileSyncType.LocalFile:
						fileSyncInfo.localFile = fileSync;
						break;
					case FileSyncType.RemoteFile:
						fileSyncInfo.remoteFile = fileSync;
						break;
					default:
						throw new Error(
							"File history entry has invalid type: " +
								fileSync.type
						);
				}
			});
		if (Object.keys(fileSyncInfo).length === 0) {
			return null;
		}
		if (!isFileSyncInfo(fileSyncInfo)) {
			throw new Error("Database returned invalid data");
		}
		return fileSyncInfo;
	}

	async markSynchronizationComplete(path: string) {
		return this.db.fileSync
			.filter((fileSync) => {
				return (
					fileSync.path === path &&
					(fileSync.type === FileSyncType.LocalFile ||
						fileSync.type === FileSyncType.RemoteFile)
				);
			})
			.delete();
	}

	async getFilesInSynchronization() {
		return this.db.fileSync
			.filter(
				(fileSync) =>
					fileSync.type === FileSyncType.LocalFile ||
					fileSync.type === FileSyncType.RemoteFile
			)
			.toArray();
	}
}
