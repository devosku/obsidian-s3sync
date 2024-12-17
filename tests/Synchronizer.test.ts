import {
	ACCESS_KEY_ID,
	createBucket,
	createRandomVaultStructure,
	deleteAllObjects,
	deleteBucket,
	ENDPOINT,
	getVaultFiles,
	getTestS3Helper,
	REGION,
	SECRET_ACCESS_KEY,
	deleteVaultFiles,
} from "./helpers";
import { mkdirSync, rmSync } from "fs";
import Synchronizer, { ConflictError } from "../src/Synchronizer";
import { join } from "path";
import { tmpdir } from "os";
import { writeFile, mkdtemp, readFile } from "fs/promises";
import * as db from "../src/db";

function getSynchronizer(vaultPath: string) {
	const dbPath = join(
		vaultPath,
		".obsidian",
		"plugins",
		"obsidian-s3sync",
		"db.sqlite"
	);
	mkdirSync(join(vaultPath, ".obsidian", "plugins", "obsidian-s3sync"), {
		recursive: true,
	});
	return new Synchronizer(vaultPath, dbPath, {
		bucket: "test",
		region: REGION,
		accessKeyId: ACCESS_KEY_ID,
		secretAccessKey: SECRET_ACCESS_KEY,
		endpoint: ENDPOINT,
	});
}

function wipeDatabase(vaultPath: string) {
	const dbPath = join(
		vaultPath,
		".obsidian",
		"plugins",
		"obsidian-s3sync",
		"db.sqlite"
	);
	rmSync(dbPath);
	db.init(dbPath);
}

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

async function listBucketObjects() {
	const s3 = getTestS3Helper("test");
	const objects = [];
	for await (const o of s3.listObjects()) {
		objects.push(o);
	}
	return objects;
}

describe("Synchronizer", () => {
	describe("startSync", () => {
		test("Files should be synced correctly first time", async () => {
			// Test that files get synced from local to bucket
			const temporaryVaultPath = await createTempVault(100);
			const synchronizer = getSynchronizer(temporaryVaultPath);
			await synchronizer.startSync();
			let objects = await listBucketObjects();
			expect(objects.length).toBe(100);

			// Test that files get synced from bucket to local
			deleteVaultFiles(temporaryVaultPath);
			wipeDatabase(temporaryVaultPath);
			await synchronizer.startSync();
			const files = getVaultFiles(temporaryVaultPath);
			expect(files.length).toBe(100);

			// Test that files get synced both ways
			deleteVaultFiles(temporaryVaultPath);
			wipeDatabase(temporaryVaultPath);
			await writeFile(
				join(temporaryVaultPath, "test.md"),
				"This is a test file"
			);
			await synchronizer.startSync();
			const filesAfterSync = getVaultFiles(temporaryVaultPath);
			expect(filesAfterSync.length).toBe(101);
			objects = await listBucketObjects();
			expect(objects.length).toBe(101);
		}, 10000);

		test("File updated locally should be updated in bucket", async () => {
			const temporaryVaultPath = await createTempVault(100);
			const synchronizer = getSynchronizer(temporaryVaultPath);
			await synchronizer.startSync();

			const files = getVaultFiles(temporaryVaultPath);
			const updatedFile = files[0];
			const filePath = join(temporaryVaultPath, updatedFile);
			const content = "This is a new content";
			await writeFile(filePath, content);
			await synchronizer.startSync();

			const tmpFiles = await mkdtemp(
				join(tmpdir(), "obsidian-s3sync-testfiles-")
			);
			const s3 = await getTestS3Helper("test");
			await s3.downloadObject(updatedFile, join(tmpFiles, updatedFile));
			const fileContents = await readFile(
				join(tmpFiles, updatedFile),
				"utf-8"
			);
			expect(fileContents).toBe(content);
		});

		test("File updated in bucket should be updated locally", async () => {
			const temporaryVaultPath = await createTempVault(100);
			const synchronizer = getSynchronizer(temporaryVaultPath);
			await synchronizer.startSync();
			const files = getVaultFiles(temporaryVaultPath);
			const updatedFile = files[0];

			const tmpFiles = await mkdtemp(
				join(tmpdir(), "obsidian-s3sync-testfiles-")
			);
			const content = "This is a new content";
			const filePath = join(tmpFiles, "test.md");
			await writeFile(filePath, content);
			const s3 = await getTestS3Helper("test");
			await s3.uploadObject(updatedFile, filePath);

			await synchronizer.startSync();
			const fileContents = await readFile(
				join(temporaryVaultPath, updatedFile),
				"utf-8"
			);
			expect(fileContents).toBe(content);
		});

		test("File updated locally and in bucket should be updated both ways", async () => {
			const temporaryVaultPath = await createTempVault(100);
			const synchronizer = getSynchronizer(temporaryVaultPath);
			await synchronizer.startSync();
			const files = getVaultFiles(temporaryVaultPath);
			const updatedFile1 = files[0];
			const updatedFile2 = files[1];
			const localFileContent = "This is the local file content";
			await writeFile(
				join(temporaryVaultPath, updatedFile1),
				localFileContent
			);
			await writeFile(
				join(temporaryVaultPath, updatedFile2),
				localFileContent
			);

			const tmpFiles = await mkdtemp(
				join(tmpdir(), "obsidian-s3sync-testfiles-")
			);
			const remoteFileContent = "This is the remote file content";
			await writeFile(join(tmpFiles, "temp1.md"), remoteFileContent);
			await writeFile(join(tmpFiles, "temp2.md"), remoteFileContent);
			const s3 = await getTestS3Helper("test");
			await s3.uploadObject(updatedFile1, join(tmpFiles, "temp1.md"));
			await s3.uploadObject(updatedFile2, join(tmpFiles, "temp2.md"));
			try {
				await expect(synchronizer.startSync()).rejects.toThrow();
				await synchronizer.startSync();
			} catch (e) {
				expect(e).toBeInstanceOf(ConflictError);
				if (e instanceof ConflictError) {
					expect(e.conflict).toBe(updatedFile1);
					await expect(
						synchronizer.startSync(true)
					).rejects.toThrow();
					await synchronizer.manuallySolveFileConflict(
						updatedFile1,
						"local"
					);
					await expect(
						synchronizer.startSync(true)
					).rejects.toThrow();
					try {
						await synchronizer.startSync(true);
					} catch (e) {
						expect(e).toBeInstanceOf(ConflictError);
						if (e instanceof ConflictError) {
							expect(e.conflict).toBe(updatedFile2);
							await synchronizer.manuallySolveFileConflict(
								updatedFile1,
								"remote"
							);
							await synchronizer.startSync(true);
							await s3.downloadObject(
								updatedFile1,
								join(tmpFiles, "temp1.md")
							);
							await s3.downloadObject(
								updatedFile1,
								join(tmpFiles, "temp2.md")
							);
							const remoteFile1Contents = await readFile(
								join(tmpFiles, "temp1.md"),
								"utf-8"
							);
							const localFile1Contents = await readFile(
								join(temporaryVaultPath, updatedFile1),
								"utf-8"
							);
							const remoteFile2Contents = await readFile(
								join(tmpFiles, "temp2.md"),
								"utf-8"
							);
							const localFile2Contents = await readFile(
								join(temporaryVaultPath, updatedFile2),
								"utf-8"
							);

							expect(remoteFile1Contents).toBe(localFileContent);
							expect(localFile1Contents).toBe(localFileContent);
							expect(remoteFile2Contents).toBe(remoteFileContent);
							expect(localFile2Contents).toBe(remoteFileContent);
						}
					}
				}
			}
		});

		test("File deleted locally should be deleted from bucket", async () => {
			const temporaryVaultPath = await createTempVault(100);
			const synchronizer = getSynchronizer(temporaryVaultPath);
			await synchronizer.startSync();
			const files = getVaultFiles(temporaryVaultPath);
			const fileToDelete = files[0];
			rmSync(join(temporaryVaultPath, fileToDelete));
			await synchronizer.startSync();
			const objects = await listBucketObjects();
			expect(objects.length).toBe(99);
			rmSync(temporaryVaultPath, { recursive: true });
		});

		test("File deleted from bucket should be deleted locally", async () => {
			// When there is no change since last sync in the local file we
			// should delete it.
			const s3 = await getTestS3Helper("test");
			const temporaryVaultPath = await createTempVault(100);
			const synchronizer = getSynchronizer(temporaryVaultPath);
			await synchronizer.startSync();
			const objects = await listBucketObjects();
			const objectToDelete = objects[0];
			await s3.deleteObject(objectToDelete.path);
			await synchronizer.startSync();
			const files = getVaultFiles(temporaryVaultPath);
			expect(files.length).toBe(99);
		});

		test("File deleted from bucket should not be deleted locally when it has changed", async () => {
			const s3 = await getTestS3Helper("test");
			const temporaryVaultPath = await createTempVault(100);
			const synchronizer = getSynchronizer(temporaryVaultPath);
			await synchronizer.startSync();
			const objects = await listBucketObjects();
			const objectToDelete = objects[0];
			await s3.deleteObject(objectToDelete.path);
			const filePath = join(temporaryVaultPath, objectToDelete.path);
			await writeFile(filePath, "This is a new content");
			await synchronizer.startSync();
			expect(getVaultFiles(temporaryVaultPath).length).toBe(100);
		});

		test("File deleted locally should not be deleted from bucket when it has changed", async () => {
			const temporaryVaultPath = await createTempVault(100);
			const synchronizer = getSynchronizer(temporaryVaultPath);
			await synchronizer.startSync();
			const files = getVaultFiles(temporaryVaultPath);
			const updatedFile = files[0];
			const filePath = join(temporaryVaultPath, updatedFile);
			await writeFile(filePath, "This is a new content");
			const s3 = await getTestS3Helper("test");
			await s3.uploadObject(updatedFile, filePath);
			rmSync(filePath);
			await synchronizer.startSync();
			expect(getVaultFiles(temporaryVaultPath).length).toBe(100);
		});
	});
});

// TODO: test that paths are always unix style
