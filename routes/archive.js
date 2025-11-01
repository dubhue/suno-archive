import fs from 'fs/promises';
import path from 'path';
import { ensureUserDirs, sanitizeName } from '../utils/fileHelpers.js';
import { DownloadManager } from '../utils/downloadManager.js';
import { Logger } from '../utils/logger.js';
import { jobManager } from '../utils/jobManager.js';
import { LibraryDB } from '../utils/database.js';
import { migrateJsonToDb } from '../utils/migrateToDb.js';
import archiver from 'archiver';

export default async function archiveRoutes(fastify, opts) {
  const { dataDir } = opts;

  fastify.post('/run', async (req, reply) => {
    const { username, cookie, limit, rateLimitMs, format } = req.body;
    if (!cookie || !username)
      return reply.code(400).send({ error: 'Missing username or token' });

    const user = sanitizeName(username);
    const { baseDir, dlDir } = await ensureUserDirs(dataDir, user);

    // Initialize job tracking
    jobManager.create(user);

    // Initialize logger
    const logger = new Logger({
      dataDir,
      username: user,
      fastifyLogger: fastify.log
    });
    await logger.init();

    try {
      // Migrate from JSON to database if needed
      await migrateJsonToDb(dataDir, user);

      // Initialize database
      const db = new LibraryDB(dataDir, user);

      // Initialize download manager
      const dm = new DownloadManager({
        dataDir,
        username: user,
        cookie,
        logger,
        concurrency: 3,
        maxRetries: 3,
        rateLimitMs: rateLimitMs || 1000, // Default 1 second between downloads
        limit: limit || null, // Pass limit to control page fetching
        format: format || 'mp3' // Default to mp3 if not specified
      });

      // Get existing clip IDs from database
      const oldIds = new Set(db.getAllIds());

      // Fetch latest library from Suno
      const lib = await dm.fetchLibrary();

      let newItems = lib.items.filter(i => !oldIds.has(i.id));

      // Apply limit if specified (for testing)
      if (limit && limit > 0) {
        newItems = newItems.slice(0, limit);
        await logger.info(`Limiting download to ${limit} items for testing`);
      }

      dm.progress.total = newItems.length;

      await logger.info(`Found ${newItems.length} new items to download`);

      // Download all new items with concurrency control
      if (newItems.length > 0) {
        await dm.downloadBatch(newItems, dlDir);
      }

      // Save new items to database
      if (newItems.length > 0) {
        db.insertMany(newItems);
      }

      const totalCount = db.count();
      await logger.info(`Library updated: ${totalCount} total items`);

      // Complete job
      const stats = dm.getProgress();
      await logger.complete(stats);
      jobManager.complete(user, stats);

      db.close();

      return {
        user,
        downloaded: stats.downloaded,
        failed: stats.failed,
        skipped: stats.skipped,
        total: totalCount,
        errors: dm.getErrors()
      };
    } catch (err) {
      await logger.error(`Archive failed: ${err.message}`);
      jobManager.fail(user, err.message);
      return reply.code(500).send({ error: err.message });
    }
  });

  // Return current user library metadata
  fastify.get('/library/:username', async (req, reply) => {
    const user = sanitizeName(req.params.username);
    try {
      const db = new LibraryDB(dataDir, user);
      const clips = db.getAll();
      db.close();
      return clips;
    } catch {
      return reply.code(404).send({ error: 'No library found' });
    }
  });

  // Get job status
  fastify.get('/status/:username', async (req, reply) => {
    const user = sanitizeName(req.params.username);
    const job = jobManager.get(user);

    if (!job) {
      return reply.code(404).send({ error: 'No job found for this user' });
    }

    return job;
  });

  // Export user archive as ZIP
  fastify.post('/export/:username', async (req, reply) => {
    const user = sanitizeName(req.params.username);
    const userDir = path.join(dataDir, user);

    try {
      await fs.access(userDir);
    } catch {
      return reply.code(404).send({ error: 'User archive not found' });
    }

    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('error', (err) => {
      fastify.log.error(`Archive error for ${user}: ${err.message}`);
      reply.code(500).send({ error: 'Failed to create archive' });
    });

    reply.header('Content-Type', 'application/zip');
    reply.header('Content-Disposition', `attachment; filename="${user}-archive.zip"`);
    reply.send(archive);

    archive.directory(userDir, false);
    archive.finalize();
  });
}