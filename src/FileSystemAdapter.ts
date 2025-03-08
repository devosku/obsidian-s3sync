import { App, DataWriteOptions } from "obsidian";
import { FileSyncModel, FileSyncType } from "./types";

export default class FileSystemAdapter {
    private app: App;

    private ignoredDirs = [
        ".obsidian/plugins/s3sync",
        ".obsidian/plugins/obsidian-s3sync",
        ".git"
    ];

    constructor(app: App) {
        this.app = app;
    }

    async getFilesMap(path?: string) {
        const filePaths = await this.getFilesRecursive(path);
        const fileSyncList: Record<string, Omit<FileSyncModel, "id">> = {};
        for (const filePath of filePaths) {
            if (!path && filePath.startsWith(".obsidian")) {
                continue;
            }
            const stat = await this.app.vault.adapter.stat(filePath);
            if (!stat) {
                continue;
            }
            fileSyncList[filePath] = {
                path: filePath,
                size: stat.size,
                mtime: stat.mtime,
                type: FileSyncType.LocalFile,
            };
        }
        return fileSyncList;
    }

    private isIgnoredDir(path: string) {
        return this.ignoredDirs.some((dir) => path.includes(dir));
    }

    private async getFilesRecursive(path = "/", filePaths: string[] = []) {
        const files = await this.app.vault.adapter.list(path);
        filePaths.push(...files.files);
        for (const dir of files.folders) {
            if (this.isIgnoredDir(dir)) {
                continue;
            }
            await this.getFilesRecursive(dir, filePaths);
        }
        return filePaths;
    }

    async readBinary(path: string) {
        return this.app.vault.adapter.readBinary(path);
    }

    private async ensureFoldersExists(path: string) {
        const split = path.split("/");
        for (let i = 1; i < split.length; i++) {
            const folderPath = split.slice(0, i).join("/");
            if (!this.app.vault.getAbstractFileByPath(folderPath)) {
                try {
                    await this.app.vault.createFolder(folderPath);
                } catch {
                    // Folder already exists
                }
            }
        }
    }

    async writeBinary(path: string, data: ArrayBuffer, options?: DataWriteOptions) {
        await this.ensureFoldersExists(path);
        return this.app.vault.adapter.writeBinary(path, data, options);
    }

    async delete(path: string) {
        return this.app.vault.adapter.remove(path);
    }
}