import {
	CreateBucketCommand,
	DeleteBucketCommand,
	DeleteObjectCommand,
	ListObjectsV2Command,
	S3Client,
} from "@aws-sdk/client-s3";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join, relative } from "path";
import S3Helper from "../src/S3Helper";

// Connection settings for localstack S3 bucket running in a docker container
export const REGION = "us-east-1";
export const ENDPOINT = "http://localstack:4566";
export const ACCESS_KEY_ID = "test";
export const SECRET_ACCESS_KEY = "test";

const client = new S3Client({
	region: REGION,
	endpoint: ENDPOINT,
	credentials: {
		accessKeyId: ACCESS_KEY_ID,
		secretAccessKey: SECRET_ACCESS_KEY,
	},
	forcePathStyle: true,
});

export function getTestS3Helper(bucket: string) {
	return new S3Helper({
		endpoint: ENDPOINT,
		region: REGION,
		accessKeyId: ACCESS_KEY_ID,
		secretAccessKey: SECRET_ACCESS_KEY,
		bucket: bucket,
	});
}

export async function createBucket(bucket: string) {
	await client.send(new CreateBucketCommand({ Bucket: bucket }));
}

export async function deleteBucket(bucket: string) {
	await client.send(new DeleteBucketCommand({ Bucket: bucket }));
}

export async function deleteAllObjects(bucket: string) {
	const objects = await listObjects(bucket);
	for (const object of objects) {
		if (!object.Key) {
			continue;
		}
		await deleteObject(bucket, object.Key);
	}
}

export async function deleteObject(bucket: string, key: string) {
	await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function listObjects(bucket: string) {
	const { Contents } = await client.send(
		new ListObjectsV2Command({ Bucket: bucket })
	);

	return Contents || [];
}

export function createRandomVaultStructure(
	baseDir: string,
	amountOfFiles = 20,
	maxFilesInDirectory = 10,
	maxSubDirectories = 10,
	fileCounter = { val: 0 }
) {
	if (!existsSync(baseDir)) {
		mkdirSync(baseDir, { recursive: true });
	}
	let amountOfFilesToCreate = Math.round(Math.random() * maxFilesInDirectory);
	if (fileCounter.val + amountOfFilesToCreate > amountOfFiles) {
		amountOfFilesToCreate = amountOfFiles - fileCounter.val;
	}

	for (let i = 0; i < amountOfFilesToCreate; i++) {
		const randomString = Math.random().toString(36).substring(2, 8);
		const file = join(baseDir, `${fileCounter.val}_${randomString}.md`);
		writeFileSync(file, `# File ${fileCounter.val}}`);
		fileCounter.val++;
	}

	if (fileCounter.val >= amountOfFiles) {
		return;
	}

	const amountOfDirectoriesToCreate = Math.round(
		Math.random() * maxSubDirectories
	);
	for (let i = 0; i < amountOfDirectoriesToCreate; i++) {
		const randomString = Math.random().toString(36).substring(2, 8);
		const directory = join(baseDir, `${i}_${randomString}`);

		createRandomVaultStructure(
			directory,
			amountOfFiles,
			maxFilesInDirectory,
			maxSubDirectories,
			fileCounter
		);
	}
}

/**
 * Create a directory structure with files.
 *
 * Example of structure:
 *
 * {
 *  "dir1": {
 *   "file1.md": "# File 1",
 *   "file2.md": "# File 2"
 * },
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createVaultStructure(baseDir: string, structure: any) {
	if (!existsSync(baseDir)) {
		mkdirSync(baseDir, { recursive: true });
	}

	for (const key in structure) {
		if (typeof structure[key] === "object") {
			createVaultStructure(join(baseDir, key), structure[key]);
		} else {
			const file = join(baseDir, key);
			writeFileSync(file, structure[key]);
		}
	}
}

export function getVaultFiles(dir: string, baseDir = dir) {
	let filePaths: string[] = [];
	const items = readdirSync(dir, { withFileTypes: true });
	items.forEach((item) => {
		if (item.name.startsWith(".")) {
			return;
		}
		const fullPath = join(dir, item.name);
		const relativePath = relative(baseDir, fullPath);
		if (item.isDirectory()) {
			filePaths = filePaths.concat(getVaultFiles(fullPath, baseDir));
		} else if (item.isFile()) {
			filePaths.push(relativePath);
		}
	});
	return filePaths;
}

export function deleteVaultFiles(dir: string) {
	const items = readdirSync(dir, { withFileTypes: true });
	items.forEach((item) => {
		if (item.name.startsWith(".")) {
			return;
		}
		rmSync(join(dir, item.name), { recursive: true, force: true });
	});
}

export function readFileToArrayBuffer(filePath: string) {
	const buffer = readFileSync(filePath);
	return buffer.buffer.slice(
		buffer.byteOffset,
		buffer.byteOffset + buffer.byteLength
	);
}

export function saveArrayBufferToFile(buffer: ArrayBuffer, filePath: string) {
	const b = Buffer.from(buffer);
	writeFileSync(filePath, b);
}