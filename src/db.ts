import * as Database from "better-sqlite3";
import { DatabaseFileModel, FileModel as DatabaseFileModel, isFileModel, isStatusModel, NewDatabaseFileModel } from "./types";

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

function createFileTable(db: ReturnType<typeof Database>) {
	const stmt = db.prepare(`
        CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL,
            mtime INTEGER NOT NULL,
            hash TEXT NOT NULL,
            remote BOOLEAN NOT NULL,
            syncInProgress BOOLEAN NOT NULL,
            UNIQUE(path, remote, syncInProgress)
        );
    `);
	stmt.run();
}

function createStatusTable(db: ReturnType<typeof Database>) {
	const stmt = db.prepare(`
        CREATE TABLE IF NOT EXISTS status (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lastSyncTime INTEGER NOT NULL
        );
    `);
	stmt.run();
}

export function init(dbPath: string) {
	_dbPath = dbPath;
	const db = new Database(_dbPath);
	try {
		createFileTable(db);
		createStatusTable(db);
	} finally {
		db.close();
	}
}

export function getFile(
	path: string,
    remote: boolean
): DatabaseFileModel | null {
	if (!_dbPath) {
		throw new DatabaseNotInitializedError();
	}
	const db = new Database(_dbPath);
	try {
		const stmt = db.prepare(
			"SELECT * FROM files WHERE path = ? AND remote = ?"
		);
		const result = stmt.get(path, remote);
		if (!result) {
			return null;
		}
		if (isFileModel(result)) {
			return result;
		} else {
			throw new InvalidDataError();
		}
	} finally {
		db.close();
	}
}

export function insertOrUpdateFile(file: NewDatabaseFileModel) {
	if (!_dbPath) {
		throw new DatabaseNotInitializedError();
	}
	const db = new Database(_dbPath);
	try {
		const stmt = db.prepare(`
            INSERT INTO files (path, mtime, hash, remote, syncInProgress)
            VALUES (:path, :mtime, :hash, :remote, :syncInProgress)
            ON CONFLICT(path, remote) DO UPDATE SET
            mtime = :mtime,
            hash = :hash;
        `);
		stmt.run(file);
	} finally {
		db.close();
	}
}

export function getLastSyncTime(): number {
	if (!_dbPath) {
		throw new DatabaseNotInitializedError();
	}
	const db = new Database(_dbPath);
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
	if (!_dbPath) {
		throw new DatabaseNotInitializedError();
	}
	const db = new Database(_dbPath);
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
