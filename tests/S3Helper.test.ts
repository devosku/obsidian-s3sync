import {
	ACCESS_KEY_ID,
	createBucket,
	deleteAllObjects,
	deleteBucket,
	ENDPOINT,
	listObjects,
	REGION,
	SECRET_ACCESS_KEY,
} from "./helpers";
import { md5 } from "../src/utils";
import { existsSync } from "fs";
import S3Helper from "../src/S3Helper";

export function getTestS3Helper(bucket: string) {
	return new S3Helper({
		endpoint: ENDPOINT,
		region: REGION,
		accessKeyId: ACCESS_KEY_ID,
		secretAccessKey: SECRET_ACCESS_KEY,
		bucket: bucket,
	});
}
beforeAll(async () => {
	await createBucket("test");
});

afterAll(async () => {
	await deleteAllObjects("test");
	await deleteBucket("test");
});

describe("S3Helper", () => {
	describe("uploadObject", () => {
		test("Uploading a file", async () => {
			const s3 = getTestS3Helper("test");
			const key = "file1.md";
			const file1 = require.resolve(`./vault/${key}`);
			await s3.uploadObject(key, file1);
			const objects = await listObjects("test");
            expect(objects.length).toBe(1);
		});
	});

    describe("deleteObject", () => {
		test("Deleting an object from S3", async () => {
			const s3 = getTestS3Helper("test");
			const key = "file1.md";
			const file1 = require.resolve(`./vault/${key}`);
			await s3.uploadObject(key, file1);
			await s3.deleteObject(key);
			const objects = await listObjects("test");
            expect(objects.length).toBe(0);
        });
    });

	describe("downloadObject", () => {
		test("Downloading an object", async () => {
			const s3 = getTestS3Helper("test");
			const key = "file1.md";
			const file1 = require.resolve(`./vault/${key}`);
			await s3.uploadObject(key, file1);
			const downloadPath = `/tmp/${key}`;
			await s3.downloadObject(key, downloadPath);
            expect(existsSync(downloadPath)).toBe(true);
            expect(await md5(downloadPath)).toBe(await md5(file1));
		});
	});

	describe("listObjects", () => {
		test("Listing objects in a bucket", async () => {
			const s3 = getTestS3Helper("test");
			const key1 = "file1.md";
			const key2 = "file2.md";
			const file1 = require.resolve(`./vault/${key1}`);
			const file2 = require.resolve(`./vault/${key2}`);
			await s3.uploadObject(key1, file1);
			await s3.uploadObject(key2, file2);
			const objects = await s3.listObjects();
			expect(objects.length).toBe(2);
			expect(objects[0].path).toBe(key1);
			expect(objects[1].path).toBe(key2);
			const file1Hash = await md5(file1);
			const file2Hash = await md5(file2);
			expect(objects[0].hash).toBe(file1Hash);
			expect(objects[1].hash).toBe(file2Hash);
		});
	});
});
