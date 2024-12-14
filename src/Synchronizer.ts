import { S3SyncPluginSettings } from "main";
import S3Helper from "./S3Helper";
import { FileModel } from "./types";
import { insertOrUpdateFile } from "./db";
import { getFiles } from "./utils";

/**
 * This is a function that should return all files in the vault.
 * The paths should be relative to the vault root path and should not start with a slash.
 */

export default class Synchronizer {
	private vaultPath: string;
	private s3: S3Helper;

	constructor(
		vaultPath: string,
		settings: S3SyncPluginSettings
	) {
		this.vaultPath = vaultPath.replace(/\/$/, "");
		this.s3 = new S3Helper({ ...settings });
	}

	async getS3Objects() {
		const s3Objects = await this.s3.listObjects();
		const map = new Map<string, FileModel>();
		for (const object of s3Objects) {
			map.set(object.path, object);
		}
		return map;
	}

	/**
	 * Synchronize local files with S3 bucket.
	 * 
	 * For a single file to be synchronized, one of the following needs to be true:
	 * - The file is not present in the S3 bucket.
	 * - The file is present in the S3 bucket but has a different hash or mtime.
	 * - The file is not present locally.
	 * - The file is present locally but has a different hash or mtime.
	 * 
	 * To determine which file should be kept, the following rules are applied:
	 * - If the file is not present in the S3 bucket, upload it.
	 * - If the file is present in the S3 bucket but has a different hash or mtime, upload it.
	 * 
	 */
	async startSync() {
		const localFiles = await this.getLocalFiles();
		const s3Objects = await this.getS3Objects();

		for await (const file of getFiles(this.vaultPath)) {
			insertOrUpdateFile({ ...file, remote: false, syncInProgress: true });
		}

		// Upload or overwrite files
		for (const [relativePath, file] of localFiles) {
			const s3Object = s3Objects.get(relativePath);
			if (!s3Object) {
				await this.s3.uploadObject(
					relativePath,
					`${this.vaultPath}/${file.path}`
				);
				continue;
			}

			if (
				!s3Object.mtime ||
				s3Object.mtime < file.mtime
			) {
				await this.s3.uploadObject(
					relativePath,
					`${this.vaultPath}/${file.path}`
				);
			}
		}

		// Delete files not present locally
		for (const [s3Key] of s3Objects) {
			if (!localFiles.has(s3Key)) {
				await this.s3.deleteObject(s3Key);
			}
		}
	}
}
