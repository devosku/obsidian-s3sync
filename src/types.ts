export interface FileModel {
	id?: number;
	/**
	 * Relative path to the file.
	 *
	 * This path is relative to the vault root path and should not start with a slash.
	 * For files coming from the S3 bucket, this path should be the key of the object.
	 */
	path: string;
	/**
	 * Last modified time of the file in seconds since the Unix epoch.
	 */
	mtime: number;
	/**
	 * MD5 hash of the file content.
	 */
	hash: string;
	/**
	 * Whether the file is stored in the S3 bucket.
	 */
	remote?: boolean;
	/**
	 * Whether the file is currently being synchronized.
	 */
	synchronizing?: boolean;
}

export type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;

export type DatabaseFileModel = Required<FileModel>;
export type NewDatabaseFileModel = Optional<Required<FileModel>, "id">;

export function isFileModel(obj: unknown): obj is FileModel {
	const asFileModel = obj as FileModel;
	return (
		typeof asFileModel.path === "string" &&
		typeof asFileModel.mtime === "number" &&
		typeof asFileModel.hash === "string"
	);
}

export function isDatabaseFileModel(obj: unknown): obj is DatabaseFileModel {
	const asDatabaseFileModel = obj as DatabaseFileModel;
	return (
		isFileModel(obj) &&
		asDatabaseFileModel.id !== undefined &&
		asDatabaseFileModel.remote !== undefined &&
		asDatabaseFileModel.synchronizing !== undefined
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

export interface FileInfo {
	prevLocalFile: DatabaseFileModel | null;
	currentLocalFile: DatabaseFileModel | null;
	prevRemoteFile: DatabaseFileModel | null;
	currentRemoteFile: DatabaseFileModel | null;
}