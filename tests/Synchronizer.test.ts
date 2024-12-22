import "fake-indexeddb/auto";
import {
	ACCESS_KEY_ID,
	createBucket,
	createRandomVaultStructure,
	deleteAllObjects,
	deleteBucket,
	ENDPOINT,
	REGION,
	SECRET_ACCESS_KEY,
	deleteVaultFiles,
	readFileToArrayBuffer,
} from "./helpers";
import { rmSync, statSync } from "fs";
import Synchronizer, { ConflictError } from "../src/Synchronizer";
import { join } from "path";
import { tmpdir } from "os";
import { writeFile, mkdtemp } from "fs/promises";
import FileSystemAdapter from "./FileSystemAdapter";
import FileSyncRepository from "../src/FileSyncRepository";
import S3Helper from "../src/S3Helper";

function getSynchronizer(vaultPath: string) {
	const fileSystem = new FileSystemAdapter(vaultPath);
	const fileSyncRepository = new FileSyncRepository("testdb");

	return new Synchronizer(fileSystem, fileSyncRepository, {
		bucket: "test",
		region: REGION,
		accessKeyId: ACCESS_KEY_ID,
		secretAccessKey: SECRET_ACCESS_KEY,
		endpoint: ENDPOINT,
	});
}

async function wipeDatabase() {
	const fileSyncRepository = new FileSyncRepository("testdb");
	await fileSyncRepository.deleteAll();
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
	await wipeDatabase();
});

async function listBucketObjects(s3: S3Helper) {
	const objects = [];
	for await (const o of s3.listObjects()) {
		objects.push(o);
	}
	return objects;
}

describe("Synchronizer", () => {
	describe("startSync", () => {
		test("Files should be synced correctly", async () => {
			// Test that files get synced from local to bucket
			const temporaryVaultPath = await createTempVault(10);
			const synchronizer = getSynchronizer(temporaryVaultPath);
			await synchronizer.startSync();
			let objects = await listBucketObjects(synchronizer.s3);
			expect(objects.length).toBe(10);

			// Test that files get synced from bucket to local
			deleteVaultFiles(temporaryVaultPath);
			await wipeDatabase();
			await synchronizer.startSync();
			const files = synchronizer.fileSystem.getFiles();
			expect(files.length).toBe(10);

			// Test that files get synced both ways
			deleteVaultFiles(temporaryVaultPath);
			await wipeDatabase();
			await writeFile(
				join(temporaryVaultPath, "test.md"),
				"This is a test file"
			);
			await synchronizer.startSync();
			const filesAfterSync = synchronizer.fileSystem.getFiles();
			expect(filesAfterSync.length).toBe(11);
			objects = await listBucketObjects(synchronizer.s3);
			expect(objects.length).toBe(11);
		}, 20000);

		test("FileSync database should be cleaned after sync", async () => {
			const temporaryVaultPath = await createTempVault(10);
			const synchronizer = getSynchronizer(temporaryVaultPath);
			await synchronizer.startSync();

			const dbEntries = await synchronizer.fileSyncRepository.getAll();
			expect(dbEntries.length).toBe(10);
		});

		test("File updated locally should be updated in bucket", async () => {
			const temporaryVaultPath = await createTempVault(10);
			const synchronizer = getSynchronizer(temporaryVaultPath);
			await synchronizer.startSync();

			const files = synchronizer.fileSystem.getFiles();
			const updatedFile = files[0];
			const filePath = join(temporaryVaultPath, updatedFile.path);
			const content = "This is a new content";
			await writeFile(filePath, content);
			await synchronizer.startSync();

			const buffer = await synchronizer.s3.downloadObject(
				updatedFile.path
			);
			const fileContents = new TextDecoder().decode(buffer);
			expect(fileContents).toBe(content);
		});

		test("File updated in bucket should be updated locally", async () => {
			const temporaryVaultPath = await createTempVault(10);
			const synchronizer = getSynchronizer(temporaryVaultPath);
			await synchronizer.startSync();
			const files = synchronizer.fileSystem.getFiles();
			const updatedFile = files[0];

			const tmpFiles = await mkdtemp(
				join(tmpdir(), "obsidian-s3sync-testfiles-")
			);
			const content = "This is a new content";
			const filePath = join(tmpFiles, "test.md");
			await writeFile(filePath, content);
			let buffer = readFileToArrayBuffer(filePath);
			const mtime = statSync(filePath).mtimeMs.toString();
			await synchronizer.s3.uploadObject(updatedFile.path, buffer, {
				mtime,
			});

			await synchronizer.startSync();
			buffer = await synchronizer.fileSystem.readBinary(updatedFile.path);
			const fileContents = new TextDecoder().decode(buffer);
			expect(fileContents).toBe(content);
		});

		test("Should throw ConflictError when file is updated both locally and in bucket but have same mtime", async () => {
			const temporaryVaultPath = await createTempVault(2);
			const synchronizer = getSynchronizer(temporaryVaultPath);
			await synchronizer.startSync();
			const files = synchronizer.fileSystem.getFiles();
			const updatedFile = files[0];
			const localFileContent = "This is the local file content";
			await synchronizer.fileSystem.writeBinary(
				updatedFile.path,
				new TextEncoder().encode(localFileContent).buffer
			);
			const tmpFiles = await mkdtemp(
				join(tmpdir(), "obsidian-s3sync-testfiles-")
			);
			const remoteFileContent = "This is the remote file content";
			await writeFile(join(tmpFiles, "temp.md"), remoteFileContent);
			const updatedFileBuffer = readFileToArrayBuffer(
				join(tmpFiles, "temp.md")
			);
			const mtime = statSync(
				join(temporaryVaultPath, updatedFile.path)
			).mtimeMs.toString();
			await synchronizer.s3.uploadObject(
				updatedFile.path,
				updatedFileBuffer,
				{
					mtime,
				}
			);

			expect.assertions(2);
			try {
				await synchronizer.startSync();
			} catch (e) {
				expect(e).toBeInstanceOf(ConflictError);
				expect(e.conflict.localFile.path).toBe(updatedFile.path);
			}
		});

		test("File updated locally and in bucket should be updated both ways", async () => {
			const temporaryVaultPath = await createTempVault(2);
			const synchronizer = getSynchronizer(temporaryVaultPath);
			await synchronizer.startSync();
			const files = synchronizer.fileSystem.getFiles();
			const updatedFile1 = files[0];
			const updatedFile2 = files[1];
			const localFileContent = "This is the local file content";
			await synchronizer.fileSystem.writeBinary(
				updatedFile1.path,
				new TextEncoder().encode(localFileContent).buffer
			);
			await synchronizer.fileSystem.writeBinary(
				updatedFile2.path,
				new TextEncoder().encode(localFileContent).buffer
			);
			const tmpFiles = await mkdtemp(
				join(tmpdir(), "obsidian-s3sync-testfiles-")
			);
			const remoteFileContent = "This is the remote file content";
			await writeFile(join(tmpFiles, "temp1.md"), remoteFileContent);
			await writeFile(join(tmpFiles, "temp2.md"), remoteFileContent);

			// Update file 1
			const updatedFile1Buffer = readFileToArrayBuffer(
				join(tmpFiles, "temp1.md")
			);
			const mtime1 = statSync(
				join(tmpFiles, "temp1.md")
			).mtimeMs.toString();
			await synchronizer.s3.uploadObject(
				updatedFile1.path,
				updatedFile1Buffer,
				{
					mtime: mtime1,
				}
			);

			// Update file 2
			const updatedFile2Buffer = readFileToArrayBuffer(
				join(tmpFiles, "temp2.md")
			);
			const mtime2 = statSync(
				join(tmpFiles, "temp2.md")
			).mtimeMs.toString();
			await synchronizer.s3.uploadObject(
				updatedFile2.path,
				updatedFile2Buffer,
				{
					mtime: mtime2,
				}
			);

			expect.assertions(6);
			try {
				await synchronizer.startSync();
			} catch (e) {
				if (e instanceof ConflictError) {
					expect(e.conflict.localFile?.path).toBe(updatedFile1.path);
					await synchronizer.manuallySolveFileConflict(
						updatedFile1.path,
						"local"
					);
					try {
						await synchronizer.startSync(true);
					} catch (e) {
						if (e instanceof ConflictError) {
							expect(e.conflict.localFile?.path).toBe(updatedFile2.path);
							await synchronizer.manuallySolveFileConflict(
								updatedFile2.path,
								"remote"
							);
							await synchronizer.startSync(true);
							const newUpdatedFile1Buffer =
								await synchronizer.s3.downloadObject(
									updatedFile1.path
								);
							const newUpdatedFile2Buffer =
								await synchronizer.s3.downloadObject(
									updatedFile2.path
								);
							const remoteFile1Contents =
								new TextDecoder().decode(newUpdatedFile1Buffer);
							const remoteFile2Contents =
								new TextDecoder().decode(newUpdatedFile2Buffer);
							const localFile1Contents = new TextDecoder().decode(
								readFileToArrayBuffer(
									join(temporaryVaultPath, updatedFile1.path)
								)
							);
							const localFile2Contents = new TextDecoder().decode(
								readFileToArrayBuffer(
									join(temporaryVaultPath, updatedFile2.path)
								)
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
			const temporaryVaultPath = await createTempVault(10);
			const synchronizer = getSynchronizer(temporaryVaultPath);
			await synchronizer.startSync();
			const files = synchronizer.fileSystem.getFiles();
			const fileToDelete = files[0].path;
			rmSync(join(temporaryVaultPath, fileToDelete));
			await synchronizer.startSync();
			const objects = await listBucketObjects(synchronizer.s3);
			expect(objects.length).toBe(9);
			rmSync(temporaryVaultPath, { recursive: true });
		});

		test("File deleted from bucket should be deleted locally", async () => {
			// When there is no change since last sync in the local file we
			// should delete it.
			const temporaryVaultPath = await createTempVault(10);
			const synchronizer = getSynchronizer(temporaryVaultPath);
			await synchronizer.startSync();
			const objects = await listBucketObjects(synchronizer.s3);
			const objectToDelete = objects[0];
			await synchronizer.s3.deleteObject(objectToDelete.path);
			await synchronizer.startSync();
			const files = synchronizer.fileSystem.getFiles();
			expect(files.length).toBe(9);
		});

		test("File deleted from bucket should not be deleted locally when it has changed", async () => {
			const temporaryVaultPath = await createTempVault(10);
			const synchronizer = getSynchronizer(temporaryVaultPath);
			await synchronizer.startSync();
			const objects = await listBucketObjects(synchronizer.s3);
			const objectToDelete = objects[0];
			await synchronizer.s3.deleteObject(objectToDelete.path);
			const filePath = join(temporaryVaultPath, objectToDelete.path);
			await writeFile(filePath, "This is a new content");
			await synchronizer.startSync();
			const files = synchronizer.fileSystem.getFiles();
			expect(files.length).toBe(10);
		});

		test("File deleted locally should not be deleted from bucket when it has changed", async () => {
			const temporaryVaultPath = await createTempVault(10);
			const synchronizer = getSynchronizer(temporaryVaultPath);
			await synchronizer.startSync();
			let files = synchronizer.fileSystem.getFiles();
			const updatedFile = files[0];
			const filePath = join(temporaryVaultPath, updatedFile.path);
			await writeFile(filePath, "This is a new content");
			const buffer = await readFileToArrayBuffer(filePath);
			await synchronizer.s3.uploadObject(updatedFile.path, buffer, {
				mtime: statSync(filePath).mtimeMs.toString(),
			});
			rmSync(filePath);
			await synchronizer.startSync();
			files = synchronizer.fileSystem.getFiles();
			expect(files.length).toBe(10);
		});
	});
});