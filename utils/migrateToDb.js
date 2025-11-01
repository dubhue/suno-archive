import fs from 'fs/promises';
import path from 'path';
import { LibraryDB } from './database.js';

/**
 * Migrate existing library.json to SQLite database
 */
export async function migrateJsonToDb(dataDir, username) {
  const libPath = path.join(dataDir, username, 'library.json');
  const backupPath = path.join(dataDir, username, 'library.json.backup');

  try {
    // Check if JSON file exists
    const jsonData = await fs.readFile(libPath, 'utf8');
    const clips = JSON.parse(jsonData);

    console.log(`Migrating ${clips.length} clips to database...`);

    // Initialize database
    const db = new LibraryDB(dataDir, username);

    // Insert all clips
    db.insertMany(clips);

    // Verify migration
    const count = db.count();
    console.log(`Migration complete: ${count} clips in database`);

    // Backup original JSON file
    await fs.copyFile(libPath, backupPath);
    console.log(`Backed up library.json to library.json.backup`);

    // Optionally delete original (commented out for safety)
    // await fs.unlink(libPath);

    db.close();
    return { success: true, count };
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('No library.json found - fresh database will be created');
      return { success: true, count: 0 };
    }
    throw err;
  }
}
