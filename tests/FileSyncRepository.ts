import "fake-indexeddb/auto";
import FileSyncRepository from "../src/FileSyncRepository";
import { FileSyncType } from "../src/types";

describe("FileSyncRepository", () => {
	describe("upsert", () => {
        it("should insert new file history", async () => {
            const db = new FileSyncRepository("test");
            await db.upsert({
                path: "test",
                type: FileSyncType.RemoteFile,
                size: 1,
                mtime: 1
            });
            await db.upsert({
                path: "test",
                type: FileSyncType.LocalFile,
                size: 1,
                mtime: 1
            });
            const fileSync = await db.getAll();
            expect(fileSync.length).toBe(2);
            await db.deleteAll();
        });

        it("should update file history", async () => {
            const db = new FileSyncRepository("test");
            await db.upsert({
                path: "test",
                type: FileSyncType.RemoteFile,
                size: 1,
                mtime: 1
            });
            await db.upsert({
                path: "test",
                type: FileSyncType.RemoteFile,
                size: 2,
                mtime: 1
            });
            const fileSync = await db.getAll();
            expect(fileSync.length).toBe(1);
            expect(fileSync[0].size).toBe(2);
            await db.deleteAll();
        });
    });
});