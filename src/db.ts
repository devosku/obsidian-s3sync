import Database from "better-sqlite3";
import {
	FileInfo,
	isDatabaseFileModel,
	isStatusModel,
	NewDatabaseFileModel,
} from "./types";
import { existsSync } from "fs";

// Holds the path to the database file after init() is called
let _dbPath: string;

class InvalidDataError extends Error {
	constructor() {
		super("Something went wrong and database returned invalid data");
	}
}

class DatabaseNotInitializedError extends Error {
	constructor() {
		super("Database not initialized");
	}
}

function getDatabase() {
	if (typeof _dbPath !== "string" || !existsSync(_dbPath)) {
		throw new DatabaseNotInitializedError();
	}
	return new Database(_dbPath);
}

function createTables(db: ReturnType<typeof Database>) {
	let stmt = db.prepare(`
        CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL,
            mtime INTEGER NOT NULL,
            hash TEXT NOT NULL,
			remote BOOLEAN NOT NULL,
            synchronizing BOOLEAN NOT NULL,
            UNIQUE(path, remote, synchronizing)
        );
    `);
	stmt.run();
	stmt = db.prepare(`
        CREATE TABLE IF NOT EXISTS status (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lastSyncTime INTEGER NOT NULL
        );
	`);
	stmt.run();
}

export function init(dbPath: string) {
	_dbPath = dbPath;
	let db;
	try {
		db = new Database(_dbPath);
	} catch (e) {
		throw new Error(
			`Could not connect to the database (${dbPath}): ${e.message}`
		);
	}
	try {
		createTables(db);
	} finally {
		db.close();
	}
}

export function insertOrUpdateFile(file: NewDatabaseFileModel) {
	const db = getDatabase();
	try {
		const stmt = db.prepare(`
            INSERT INTO files (path, mtime, hash, remote, synchronizing)
            VALUES (:path, :mtime, :hash, :remote, :synchronizing)
            ON CONFLICT(path, remote, synchronizing) DO UPDATE SET
            mtime = :mtime,
            hash = :hash;
        `);
		stmt.run({
			path: file.path,
			mtime: file.mtime,
			hash: file.hash,
			remote: file.remote ? 1 : 0,
			synchronizing: file.synchronizing ? 1 : 0,
		});
	} finally {
		db.close();
	}
}

export function deleteFile(
	path: string,
	remote: boolean,
	synchronizing: boolean
) {
	const db = getDatabase();
	try {
		const stmt = db.prepare(
			"DELETE FROM files WHERE path = ? AND remote = ? AND synchronizing = ?"
		);
		stmt.run(path, remote ? 1 : 0, synchronizing ? 1 : 0);
	} finally {
		db.close();
	}
}

export function deleteFilesNotNeedingSynchronization() {
	const db = getDatabase();
	try {
		const stmt = db.prepare(`
			WITH localF AS (
				SELECT * FROM files
				WHERE remote = 0
				AND synchronizing = 1
			),
			remoteF AS (
				SELECT * FROM files
				WHERE remote = 1
				AND synchronizing = 1
			),
			toDelete AS (
				SELECT localF.id AS local_id, remoteF.id AS remote_id
				FROM localF
				INNER JOIN remoteF ON localF.path = remoteF.path
				AND localF.hash = remoteF.hash 
				AND localF.mtime = remoteF.mtime
			)
			DELETE FROM files
			WHERE id IN (
				SELECT local_id FROM toDelete
				UNION
				SELECT remote_id FROM toDelete
			);
		`);
		stmt.run();
	} finally {
		db.close();
	}
}

export function markFileSynchronizationComplete(path: string) {
	const db = getDatabase();
	try {
		const stmt = db.prepare(
			"DELETE FROM files WHERE path = ? AND synchronizing = 1"
		);
		stmt.run(path);
	} finally {
		db.close();
	}
}

export function getFilesInSynchronization() {
	const db = getDatabase();
	const paths = [];
	try {
		const stmt = db.prepare(
			"SELECT path FROM files WHERE synchronizing = 1 GROUP BY path"
		);
		const results = stmt.all();
		for (const result of results) {
			// @ts-ignore - too lazy to fix this.. should be fine (TM)
			paths.push(result.path);
		}
		return paths;
	} finally {
		db.close();
	}
}

export function getFileInfo(filePath: string) {
	const db = getDatabase();

	const fileInfo: FileInfo = {
		prevLocalFile: null,
		currentLocalFile: null,
		prevRemoteFile: null,
		currentRemoteFile: null,
	};

	try {
		const stmt = db.prepare("SELECT * FROM files WHERE path = ?");
		const results = stmt.all(filePath);
		if (!results) {
			return null;
		}
		for (const result of results) {
			if (isDatabaseFileModel(result)) {
				if (result.remote) {
					if (result.synchronizing) {
						fileInfo.currentRemoteFile = result;
					} else {
						fileInfo.prevRemoteFile = result;
					}
				} else {
					if (result.synchronizing) {
						fileInfo.currentLocalFile = result;
					} else {
						fileInfo.prevLocalFile = result;
					}
				}
			} else {
				throw new InvalidDataError();
			}
		}
		return fileInfo;
	} finally {
		db.close();
	}
}

export function getLastSyncTime(): number {
	const db = getDatabase();
	try {
		const stmt = db.prepare("SELECT * FROM status WHERE id = 1");
		const result = stmt.get();
		if (!result) {
			return 0;
		}
		if (isStatusModel(result)) {
			return result.lastSyncTime;
		} else {
			throw new InvalidDataError();
		}
	} finally {
		db.close();
	}
}

export function setLastSyncTime(lastSyncTime: number) {
	const db = getDatabase();
	try {
		const stmt = db.prepare(`
            INSERT INTO status (id, lastSyncTime)
            VALUES (1, :lastSyncTime)
            ON CONFLICT(id) DO UPDATE SET
            lastSyncTime = :lastSyncTime;
        `);
		stmt.run({ lastSyncTime });
	} finally {
		db.close();
	}
}
