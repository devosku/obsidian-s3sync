import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { FileSyncModel, FileSyncType } from "../src/types";
import { dirname, join, relative } from "path";
import { App } from "obsidian";

export default class FileSystemAdapter {
    private app: App;
    private vaultPath: string;

    constructor(vaultPath: string) {
        this.vaultPath = vaultPath;
    }

    getFilesRecursive(dir: string, baseDir = dir) {
        let files: Omit<FileSyncModel, "id">[] = [];
        const items = readdirSync(dir, { withFileTypes: true });
        items.forEach((item) => {
            if (item.name.startsWith(".")) {
                return;
            }
            const fullPath = join(dir, item.name);
            if (item.isDirectory()) {
                files = files.concat(this.getFilesRecursive(fullPath, baseDir));
            } else if (item.isFile()) {
                const relativePath = relative(baseDir, fullPath);
                const stats = statSync(fullPath);
                const file: Omit<FileSyncModel, "id"> = {
                    path: relativePath,
                    mtime: stats.mtimeMs,
                    size: stats.size,
                    type: FileSyncType.LocalFile,
                }
                files.push(file);
            }
        });
        return files;
	}

    getFiles() {
        return this.getFilesRecursive(this.vaultPath);
    }

    getFilesMap() {
        const files = this.getFiles();
        const fileSyncMap: Record<string, Omit<FileSyncModel, "id">> = {};
        for (const file of files) {
            fileSyncMap[file.path] = file;
        }
        return fileSyncMap;
    }

    async readBinary(path: string) {
        const absolutePath = join(this.vaultPath, path);
        const uint8Array = new Uint8Array(readFileSync(absolutePath));
        return uint8Array.buffer;
    }

    async writeBinary(path: string, data: ArrayBuffer) {
        const absolutePath = join(this.vaultPath, path);
        mkdirSync(dirname(absolutePath), { recursive: true });
        const uint8Array = new Uint8Array(data);
        writeFileSync(absolutePath, uint8Array);
    }

    async delete(path: string) {
        const absolutePath = join(this.vaultPath, path);
        rmSync(absolutePath);
    }
}