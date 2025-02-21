import { App, DataWriteOptions } from "obsidian";
import { FileSyncModel, FileSyncType } from "./types";

export default class FileSystemAdapter {
    private app: App;

    constructor(app: App) {
        this.app = app;
    }

    getFiles() {
        const files = this.app.vault.getFiles();
        const fileSyncList: Omit<FileSyncModel, "id">[] = [];
        for (const file of files) {
            fileSyncList.push({
                path: file.path,
                size: file.stat.size,
                mtime: file.stat.mtime,
                type: FileSyncType.LocalFile,
            });
        }
        return fileSyncList;
    }

    getFilesMap() {
        const files = this.app.vault.getFiles();
        const fileSyncMap: Record<string, Omit<FileSyncModel, "id">> = {};
        for (const file of files) {
            fileSyncMap[file.path] = {
                path: file.path,
                size: file.stat.size,
                mtime: file.stat.mtime,
                type: FileSyncType.LocalFile,
            };
        }
        return fileSyncMap;
    }

    async readBinary(path: string) {
        return this.app.vault.adapter.readBinary(path);
    }

    private async ensureFoldersExists(path: string) {
        const split = path.split("/");
        for (let i = 1; i < split.length; i++) {
            const folderPath = split.slice(0, i).join("/");
            if (!this.app.vault.getAbstractFileByPath(folderPath)) {
                await this.app.vault.createFolder(folderPath);
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