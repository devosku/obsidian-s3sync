import {
	createBucket,
	createRandomVaultStructure,
	deleteAllObjects,
	deleteBucket,
	getVaultFiles,
	getTestS3Helper,
	listObjects,
} from "./helpers";
import { md5 } from "../src/utils";
import { existsSync } from "fs";
import { mkdtemp, stat } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

/**
 * Create a temporary vault with a random directory structure.
 */
async function createTempVault(amountOfFiles: number): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "obsidian-s3sync-vault-"));
	createRandomVaultStructure(dir, amountOfFiles, 100, 100);
	return dir;
}

beforeEach(async () => {
	await createBucket("test");
});

afterEach(async () => {
	await deleteAllObjects("test");
	await deleteBucket("test");
});

describe("S3Helper", () => {
	describe("uploadObject", () => {
		test("Uploading a file", async () => {
			const s3 = getTestS3Helper("test");
			const temporaryVaultPath = await createTempVault(1);
			const files = getVaultFiles(temporaryVaultPath);
			const file = files[0];
			const fileMtimeBefore = await stat(
				join(temporaryVaultPath, file)
			).then((s) => s.mtimeMs);
			// sleep for 1 second to ensure the mtime is different
			await new Promise((resolve) => setTimeout(resolve, 1000));
			await s3.uploadObject(file, join(temporaryVaultPath, file));
			const fileMtimeAfter = await stat(
				join(temporaryVaultPath, file)
			).then((s) => s.mtimeMs);
			expect(fileMtimeBefore).toBeLessThan(fileMtimeAfter);
			const objects = await listObjects("test");
			expect(objects.length).toBe(1);
			const objectMtime = objects[0].LastModified
				? new Date(objects[0].LastModified).getTime()
				: 0;
			expect(fileMtimeAfter).toBe(objectMtime);
		});
	});

	describe("deleteObject", () => {
		test("Deleting an object from S3", async () => {
			const s3 = getTestS3Helper("test");
			const temporaryVaultPath = await createTempVault(1);
			const files = getVaultFiles(temporaryVaultPath);
			const file = files[0];
			await s3.uploadObject(file, join(temporaryVaultPath, file));
			await s3.deleteObject(file);
			const objects = await listObjects("test");
			expect(objects.length).toBe(0);
		});
	});

	describe("downloadObject", () => {
		test("Downloading an object", async () => {
			const s3 = getTestS3Helper("test");
			const temporaryVaultPath = await createTempVault(1);
			const files = getVaultFiles(temporaryVaultPath);
			const file = files[0];
			await s3.uploadObject(file, join(temporaryVaultPath, file));
			const downloadDir = await mkdtemp(
				join(tmpdir(), "obsidian-s3sync-testfiles-")
			);
			await s3.downloadObject(file, join(downloadDir, file));
			expect(existsSync(join(downloadDir, file))).toBe(true);
			expect(await md5(join(downloadDir, file))).toBe(
				await md5(join(temporaryVaultPath, file))
			);
			const originalFileMtime = (await stat(join(temporaryVaultPath, file))).mtimeMs;
			const downloadedFileMtime = (await stat(join(downloadDir, file))).mtimeMs;
			expect(originalFileMtime).toBe(downloadedFileMtime);
		});
	});

	describe("listObjects", () => {
		test("Listing objects in a bucket", async () => {
			const s3 = getTestS3Helper("test");
			const temporaryVaultPath = await createTempVault(4);
			const files = getVaultFiles(temporaryVaultPath);
			for (const file of files) {
				await s3.uploadObject(file, join(temporaryVaultPath, file));
			}

			const objects = [];
			for await (const o of s3.listObjects()) {
				objects.push(o);
				const localFilePath = files.find((f) => f === o.path);
				expect(localFilePath).toBeDefined();
				// @ts-ignore
				const localFileHash = await md5(join(temporaryVaultPath, localFilePath));
				expect(localFileHash).toBe(o.hash);
			}
			expect(objects.length).toBe(4);
		});
	});
});
