import { createHash } from "crypto";
import { createReadStream } from "fs";
import { readdir, stat } from "fs/promises";
import { join, relative } from "path";
import { FileModel } from "./types";

export function md5(filePath: string): Promise<string> {
	return new Promise((resolve) => {
		const hash = createHash("md5");
		const stream = createReadStream(filePath);
		stream.on("data", (data) => {
			hash.update(data);
		});
		stream.on("end", () => {
			resolve(hash.digest("hex"));
		});
	});
}

/**
 * Generator to recursively iterate over files in a directory.
 * @param dir Directory to search.
 * @param baseDir Directory to use as the base for relative paths.
 * @returns Paths of files relative to the base directory.
 */
export async function* getFiles(dir: string, baseDir = dir) {
	const items = await readdir(dir, { withFileTypes: true });

	for (const item of items) {
		const fullPath = join(dir, item.name);
		if (item.isDirectory()) {
			getFiles(fullPath, baseDir)
		} else if (item.isFile()) {
			const relativePath = relative(baseDir, fullPath);
			const stats = await stat(fullPath);
			const hash = await md5(fullPath);
			const file: FileModel = {
				path: relativePath,
				mtime: stats.mtimeMs,
				hash
			}
			yield file;
		}
	}
}
