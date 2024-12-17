import {
	S3Client,
	PutObjectCommand,
	ListObjectsV2Command,
	DeleteObjectCommand,
	GetObjectCommand,
	HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { createReadStream, createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { FileModel } from "./types";
import { mkdir, utimes } from "fs/promises";
import { dirname } from "path";

interface S3HelperOptions {
	region: string;
	accessKeyId: string;
	secretAccessKey: string;
	bucket: string;
	endpoint?: string;
}

export interface ObjectInfo {
	key: string;
	lastModified: number;
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

	async *listObjects() {
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
				for (const item of Contents) {
					const file: FileModel = {
						path: item.Key || "",
						mtime: item.LastModified
							? item.LastModified.getTime()
							: 0,
						hash: item.ETag ? JSON.parse(item.ETag) : "",
						remote: true,
					};
					yield file;
				}
			}
		} while (continuationToken);
	}

	async downloadObject(key: string, filePath: string) {
		const dirPath = dirname(filePath);
		await mkdir(dirPath, { recursive: true });
		const fileStream = createWriteStream(filePath);
		const { Body, LastModified } = await this.client.send(
			new GetObjectCommand({
				Bucket: this.bucket,
				Key: key,
			})
		);
		if (!Body) {
			throw new Error(`Object not found: ${key}`);
		}
		await pipeline(Body as Readable, fileStream);
		await utimes(filePath, LastModified || 0, LastModified || 0);
	}

	async getObjectInfo(key: string): Promise<ObjectInfo> {
		const head = await this.client.send(
			new HeadObjectCommand({
				Bucket: this.bucket,
				Key: key,
			})
		);

		return {
			key: key,
			lastModified: head.LastModified ? head.LastModified.getTime() : 0,
			hash: head.ETag ? JSON.parse(head.ETag) : "",
		};
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
		const objectInfo = await this.getObjectInfo(key);
		await utimes(
			filePath,
			new Date(objectInfo.lastModified),
			new Date(objectInfo.lastModified)
		);
	}

	async deleteObject(key: string) {
		await this.client.send(
			new DeleteObjectCommand({
				Bucket: this.bucket,
				Key: key,
			})
		);
	}
}
