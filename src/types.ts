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
    syncInProgress?: boolean;
}

export type DatabaseFileModel = Required<FileModel>;
export type NewDatabaseFileModel = Required<FileModel> & { id?: number };

export function isFileModel(obj: unknown): obj is FileModel {
    const asFileModel = obj as FileModel;
    return (
        typeof asFileModel.path === 'string' &&
        typeof asFileModel.mtime === 'number' &&
        typeof asFileModel.hash === 'string' &&
        typeof asFileModel.remote === 'boolean' &&
        typeof asFileModel.syncInProgress === 'boolean'
    );
}

export interface StatusModel {
    id: number;
    lastSyncTime: number;
}

export function isStatusModel(obj: unknown): obj is StatusModel {
    const asStatusModel = obj as StatusModel;
    return (
        typeof asStatusModel.id === 'number' &&
        typeof asStatusModel.lastSyncTime === 'number'
    );
}
