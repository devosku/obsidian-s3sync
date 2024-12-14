import {
	ACCESS_KEY_ID,
	createBucket,
	createRandomVaultStructure,
	deleteAllObjects,
	deleteBucket,
	ENDPOINT,
	getFilesRecursively,
	listObjects,
	REGION,
	SECRET_ACCESS_KEY,
} from "./helpers";
import { mkdtemp, rmSync, statSync } from "fs";
import Synchronizer from "../src/Synchronizer";
import { join } from "path";
import { tmpdir } from "os";
import { getTestS3Helper } from "./S3Helper.test";
import { md5 } from "src/utils";
import { FileModel } from "src/types";

function getSynchronizer(vaultPath: string) {
	const fileProvider = async () => {
		const filePaths = getFilesRecursively(vaultPath);
		const files = filePaths.map(async (filePath) => {
			const stat = statSync(join(vaultPath, filePath));
			const hash = await md5(filePath);
			return {
				path: filePath,
				mtime: stat.mtimeMs,
				hash
			} as FileModel;
		});
		return Promise.all(files);
	};
	return new Synchronizer(vaultPath, fileProvider, {
		bucket: "test",
		region: REGION,
		accessKeyId: ACCESS_KEY_ID,
		secretAccessKey: SECRET_ACCESS_KEY,
		endpoint: ENDPOINT
	});
}

/**
 * Create a temporary vault with a random directory structure.
 */
async function createTempVault(amountOfFiles: number): Promise<string> {
	return new Promise((resolve, reject) => {
		mkdtemp(join(tmpdir(), "obsidian-s3sync-vault-"), (err, dir) => {
			if (err) {
				reject(err);
			}
			console.log(`Creating temporary vault: ${dir}`);
			createRandomVaultStructure(dir, amountOfFiles, 100, 100);
			resolve(dir);
		});
	});
}

beforeAll(async () => {
	await createBucket("test");
});

afterAll(async () => {
	await deleteAllObjects("test");
	await deleteBucket("test");
});

describe("Synchronizer", () => {
	describe("startSync", () => {
		test("First time sync when bucket is empty and local files exist", async () => {
			const temporaryVaultPath = await createTempVault(100);
			const synchronizer = getSynchronizer(temporaryVaultPath);
			await synchronizer.startSync();
			const objects = await listObjects("test");
			expect(objects.length).toBe(100);
			rmSync(temporaryVaultPath, { recursive: true });
		});

		test("First time sync when bucket is not empty and local files exist", async () => {
			await getTestS3Helper("test").uploadObject(__filename, join(__dirname, __filename));
			// const temporaryVaultPath = await createTempVault(100);
			// const synchronizer = getSynchronizer(temporaryVaultPath);
			// expect(await synchronizer.startSync()).toThrow();
			const objects = await listObjects("test");
			console.log(objects);
			// expect(objects.length).toBe(1);
			// rmSync(temporaryVaultPath, { recursive: true });
		});
	});
});


// Scenarios to test:
// 1. First time sync when bucket is empty and local files exist
// 2. First time sync when bucket is not empty and local files exist
// 3. Sync when bucket and local files are in sync
// 4. Sync when bucket has files that are not in local
// 5. Sync when local has files that are not in bucket
// 6. Sync when local has files with different content
// 7. Sync when local has files with different mtime
// 8. Sync when local has files with different content and mtime
// 9. Sync when local has files that are not in bucket and vice versa
