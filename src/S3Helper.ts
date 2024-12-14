import {
	S3Client,
	PutObjectCommand,
	ListObjectsV2Command,
	DeleteObjectCommand,
	GetObjectCommand,
} from "@aws-sdk/client-s3";
import { createReadStream, createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { FileModel } from "./types";

interface S3HelperOptions {
	region: string;
	accessKeyId: string;
	secretAccessKey: string;
	bucket: string;
	endpoint?: string;
}

export interface ObjectInfo {
	key: string;
	lastModified?: number;
	hash: string;
}

/**
 * Wrapper class for AWS S3 SDK to simplify common operations.
 */
export default class S3Helper {
	private client: S3Client;
	private bucket: string;

	constructor(options: S3HelperOptions) {
		this.client = new S3Client({
			region: options.region,
			credentials: {
				accessKeyId: options.accessKeyId,
				secretAccessKey: options.secretAccessKey,
			},
			endpoint: options.endpoint,
			forcePathStyle: options.endpoint ? true : false,
		});
		this.bucket = options.bucket;
	}

	async listObjects() {
		const objects: FileModel[] = [];
		let continuationToken: string | undefined;

		do {
			const { Contents, NextContinuationToken } = await this.client.send(
				new ListObjectsV2Command({
					Bucket: this.bucket,
					ContinuationToken: continuationToken,
				})
			);
			continuationToken = NextContinuationToken;
			if (Contents) {
				objects.push(
					...Contents.map((item) => ({
						path: item.Key || "",
						mtime: item.LastModified
							? Math.floor(item.LastModified.getTime() / 1000)
							: -1,
						hash: item.ETag || "",
						remote: true,
					}))
				);
			}
		} while (continuationToken);

		return objects;
	}

	async downloadObject(key: string, filePath: string) {
		const fileStream = createWriteStream(filePath);
		const { Body } = await this.client.send(
			new GetObjectCommand({
				Bucket: this.bucket,
				Key: key,
			})
		);
		if (!Body) {
			throw new Error(`Object not found: ${key}`);
		}
		await pipeline(Body as Readable, fileStream);
		console.log(`Downloaded: ${key} -> ${filePath}`);
	}

	async uploadObject(
		key: string,
		filePath: string,
		metadata?: Record<string, string>
	) {
		const fileStream = createReadStream(filePath);
		await this.client.send(
			new PutObjectCommand({
				Bucket: this.bucket,
				Key: key,
				Body: fileStream,
				Metadata: metadata,
			})
		);
		console.log(`Uploaded: ${filePath} -> ${key}`);
	}

	async deleteObject(key: string) {
		await this.client.send(
			new DeleteObjectCommand({
				Bucket: this.bucket,
				Key: key,
			})
		);
		console.log(`Deleted: ${key}`);
	}
}
