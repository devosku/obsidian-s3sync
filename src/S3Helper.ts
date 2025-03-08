import {
	S3Client,
	PutObjectCommand,
	ListObjectsV2Command,
	DeleteObjectCommand,
	GetObjectCommand,
	HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { FileSyncModel, FileSyncType } from "./types";
import { Readable } from "stream";

interface S3HelperOptions {
	region: string;
	accessKeyId: string;
	secretAccessKey: string;
	bucket: string;
	endpoint?: string;
}

export interface ObjectInfo {
	key: string;
	mtime: number;
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

	async *listObjects(path?: string) {
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
					if (!item.Key || item.Key.endsWith("/")) {
						continue;
					} else if (path && !item.Key.startsWith(path)) {
						continue;
					} else if (!path && item.Key.startsWith(".obsidian")) {
						continue;
					}

					const head = await this.client.send(
						new HeadObjectCommand({
							Bucket: this.bucket,
							Key: item.Key,
						})
					);
					const file: Omit<FileSyncModel, "id"> = {
						path: item.Key || "",
						mtime: head.Metadata?.mtime
							? +head.Metadata?.mtime
							: -1,
						size: item.Size || 0,
						type: FileSyncType.RemoteFile
					};
					yield file;
				}
			}
		} while (continuationToken);
	}

	private async objectBodyToArrayBuffer(
		body?: Readable | ReadableStream | Blob
	): Promise<ArrayBuffer> {
		if (!body) {
			throw new Error("Object body is empty");
		}

		if (body instanceof Blob) {
			return body.arrayBuffer();
		}

		if (body instanceof ReadableStream) {
			return new Response(body).arrayBuffer();
		}

		if (body instanceof Readable) {
			return (await new Promise((resolve, reject) => {
				const chunks: Uint8Array[] = [];
				body.on("data", (chunk) => chunks.push(chunk));
				body.on("error", reject);
				body.on("end", () => {
					const buffer = Buffer.concat(chunks);
					resolve(
						buffer.buffer.slice(
							buffer.byteOffset,
							buffer.byteOffset + buffer.byteLength
						)
					);
				});
			})) as ArrayBuffer;
		}

		throw new Error("Unsupported body type");
	}

	async downloadObject(key: string): Promise<ArrayBuffer> {
		const { Body } = await this.client.send(
			new GetObjectCommand({
				Bucket: this.bucket,
				Key: key,
			})
		);
		if (!Body) {
			throw new Error(`Object not found: ${key}`);
		}
		return this.objectBodyToArrayBuffer(Body);
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
			mtime: head.Metadata?.mtime ? +head.Metadata?.mtime : -1,
			hash: head.ETag ? JSON.parse(head.ETag) : "",
		};
	}

	async uploadObject(
		key: string,
		content: ArrayBuffer,
		metadata?: Record<string, string>
	) {
		await this.client.send(
			new PutObjectCommand({
				Bucket: this.bucket,
				Key: key,
				Body: new Uint8Array(content),
				Metadata: metadata,
			})
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
