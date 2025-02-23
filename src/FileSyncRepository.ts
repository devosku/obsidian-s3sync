import { FileSyncInfo, FileSyncModel, FileSyncType, isFileSyncInfo } from "./types";
import { openDB, IDBPDatabase } from "idb";

export default class FileSyncRepository {
	private db: IDBPDatabase;
	private storeName: string;

	constructor(db: IDBPDatabase, storeName: string) {
		this.db = db;
		this.storeName = storeName;
	}

	public static async init(databaseName: string, version = 1) {
		const storeName = "fileSyncRepository";
		const db = await openDB(databaseName, version, {
			upgrade(db) {
				// Create the object store if it doesn't exist
				if (!db.objectStoreNames.contains(storeName)) {
					const store = db.createObjectStore(storeName, {
						keyPath: "id",
						autoIncrement: true,
					});
					store.createIndex("path_type", ["path", "type"], {
						unique: true,
					});
					store.createIndex("path", "path", { unique: false });
					store.createIndex("type", "type", { unique: false });
					return;
				}
			},
		});
		return new FileSyncRepository(db, storeName);
	}

	async close() {
		if (this.db) {
			this.db.close();
		}
	}

	/**
	 * Insert or update file history model to database.
	 * @param fileSync File history model
	 * @returns
	 */
	async upsert(fileSync: Omit<FileSyncModel, "id">) {
		const tx = this.db.transaction(this.storeName, "readwrite");
		const store = tx.objectStore(this.storeName);
		const index = store.index("path_type");

		const existingKey = await index.getKey([fileSync.path, fileSync.type]);

		if (existingKey) {
			const existing = await store.get(existingKey);
			await store.put({
				...existing,
				path: fileSync.path,
				type: fileSync.type,
				size: fileSync.size,
				mtime: fileSync.mtime,
			});
		} else {
			await store.add({
				path: fileSync.path,
				type: fileSync.type,
				size: fileSync.size,
				mtime: fileSync.mtime,
			});
		}

		await tx.done;
	}

	async delete(path: string, type: FileSyncType) {
		const tx = this.db.transaction(this.storeName, "readwrite");
		const index = tx.store.index("path_type");
		const key = await index.getKey([path, type]);

		if (key) {
			await tx.store.delete(key);
		}

		await tx.done;
	}

	async deleteAll() {
		const tx = this.db.transaction(this.storeName, "readwrite");
		await tx.store.clear();
		await tx.done;
	}

	async getAll() {
		return this.db.getAll(this.storeName);
	}

	async getFileSyncInfo(path: string) {
		const fileSyncInfo: FileSyncInfo = {};
		const tx = this.db.transaction(this.storeName, "readonly");
		const index = tx.store.index("path");

		const records = await index.getAll(path);

		for (const fileSync of records) {
			fileSync as FileSyncInfo;
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
						"File history entry has invalid type: " + fileSync.type
					);
			}
		}

		if (Object.keys(fileSyncInfo).length === 0) {
			return null;
		}

		if (!isFileSyncInfo(fileSyncInfo)) {
			throw new Error("Database returned invalid data");
		}

		return fileSyncInfo;
	}

	async markSynchronizationComplete(path: string) {
		const tx = this.db.transaction(this.storeName, "readwrite");
		const index = tx.store.index("path");
		let cursor = await index.openCursor(path);

		while (cursor) {
			if (
				cursor.value.path === path &&
				(cursor.value.type === FileSyncType.LocalFile ||
					cursor.value.type === FileSyncType.RemoteFile)
			) {
				await cursor.delete();
			}
			cursor = await cursor.continue();
		}

		await tx.done;
	}

	async getFilesInSynchronization() {
		const tx = this.db.transaction(this.storeName, "readonly");
		const store = tx.store;
		const fileMap = new Map<string, FileSyncModel>();

		let cursor = await store.openCursor();

		while (cursor) {
			const fileSync = cursor.value;
			if (
				fileSync.type === FileSyncType.LocalFile ||
				fileSync.type === FileSyncType.RemoteFile
			) {
				fileMap.set(fileSync.path, fileSync);
			}
			cursor = await cursor.continue();
		}

		return Array.from(fileMap.values());
	}
}
