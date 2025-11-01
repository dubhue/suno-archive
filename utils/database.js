import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export class LibraryDB {
  constructor(dataDir, username) {
    const userDir = path.join(dataDir, username);
    const dbPath = path.join(userDir, 'library.db');

    // Ensure directory exists
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL'); // Better performance for concurrent access
    this.initSchema();
  }

  initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS clips (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        created_at TEXT,
        downloaded_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_created_at ON clips(created_at);
    `);
  }

  // Check if a clip exists by ID
  has(clipId) {
    const stmt = this.db.prepare('SELECT 1 FROM clips WHERE id = ?');
    return stmt.get(clipId) !== undefined;
  }

  // Get all clip IDs
  getAllIds() {
    const stmt = this.db.prepare('SELECT id FROM clips');
    return stmt.all().map(row => row.id);
  }

  // Insert a new clip
  insert(clip) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO clips (id, data, created_at)
      VALUES (?, ?, ?)
    `);
    stmt.run(clip.id, JSON.stringify(clip), clip.created_at);
  }

  // Insert multiple clips in a transaction
  insertMany(clips) {
    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO clips (id, data, created_at)
      VALUES (?, ?, ?)
    `);

    const insertMany = this.db.transaction((clips) => {
      for (const clip of clips) {
        insert.run(clip.id, JSON.stringify(clip), clip.created_at);
      }
    });

    insertMany(clips);
  }

  // Get all clips
  getAll() {
    const stmt = this.db.prepare('SELECT data FROM clips ORDER BY created_at DESC');
    return stmt.all().map(row => JSON.parse(row.data));
  }

  // Get total count
  count() {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM clips');
    return stmt.get().count;
  }

  // Close database connection
  close() {
    this.db.close();
  }
}
