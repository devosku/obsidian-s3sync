export enum FileSyncType {
	LastSyncedFile = 0,
	RemoteFile = 1,
	LocalFile = 2,
}

export interface FileSyncModel {
	id: number;
	/**
	 * Relative path to the file.
	 *
	 * This path is relative to the vault root path and should not start with a slash.
	 * For files coming from the S3 bucket, this path should be the key of the object.
	 */
	path: string;
	/**
	 * Last modified time of the file in seconds since the Unix epoch.
	 * TODO: Make a better explanation of this field.
	 */
	mtime: number;
	/**
	 * Size of the file
	 */
	size: number;
	/**
	 * Whether this is the last synced, remote or local file.
	 */
	type: FileSyncType;
}

export function isFileSyncModel(obj: unknown): obj is FileSyncModel {
	const asFileSyncModel = obj as FileSyncModel;
	return (
		typeof asFileSyncModel.path === "string" &&
		typeof asFileSyncModel.mtime === "number" &&
		typeof asFileSyncModel.size === "number"
	);
}

export interface StatusModel {
	id: number;
	lastSyncTime: number;
}

export function isStatusModel(obj: unknown): obj is StatusModel {
	const asStatusModel = obj as StatusModel;
	return (
		typeof asStatusModel.id === "number" &&
		typeof asStatusModel.lastSyncTime === "number"
	);
}

export interface FileSyncInfo {
	lastSyncedFile?: FileSyncModel;
	localFile?: FileSyncModel;
	remoteFile?: FileSyncModel;
}

export function isFileSyncInfo(obj: unknown): obj is FileSyncInfo {
	const asFileSyncIfno = obj as FileSyncInfo;
	return (
		(asFileSyncIfno.lastSyncedFile === undefined ||
			isFileSyncModel(asFileSyncIfno.lastSyncedFile)) &&
		(asFileSyncIfno.localFile === undefined ||
			isFileSyncModel(asFileSyncIfno.localFile)) &&
		(asFileSyncIfno.remoteFile === undefined ||
			isFileSyncModel(asFileSyncIfno.remoteFile))
	)
}

export interface IFileSystemAdapter {
	getFiles(): Omit<FileSyncModel, "id">[];
	getFilesMap(): Record<string, Omit<FileSyncModel, "id">>;
	readBinary(path: string): Promise<ArrayBuffer>;
	writeBinary(path: string, data: ArrayBuffer): Promise<void>;
	delete(path: string): Promise<void>;
}

export interface SyncProgressState {
	msg: string;
	current: number;
	total: number;
}