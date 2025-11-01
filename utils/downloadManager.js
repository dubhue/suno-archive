import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';

export class DownloadManager {
  constructor({ dataDir, username, cookie, logger, concurrency = 3, maxRetries = 3, rateLimitMs = 1000, limit = null, format = 'mp3', existingIds = new Set(), db = null, fullSync = false, verifyFiles = false, dlDir = null }) {
    this.dataDir = dataDir;
    this.username = username;
    this.cookie = cookie;
    this.logger = logger;
    this.concurrency = concurrency;
    this.maxRetries = maxRetries;
    this.rateLimitMs = rateLimitMs; // Delay between downloads to respect rate limits
    this.limit = limit; // Optional limit for testing
    this.format = format; // 'mp3', 'wav', or 'both'
    this.existingIds = existingIds; // Set of existing IDs for smart pagination
    this.db = db; // Database instance for incremental writes
    this.fullSync = fullSync; // If true, disable smart pagination and fetch all pages
    this.verifyFiles = verifyFiles; // If true, check filesystem for existing files
    this.dlDir = dlDir; // Download directory for filesystem checks

    this.progress = {
      total: 0,
      downloaded: 0,
      failed: 0,
      skipped: 0,
      status: 'idle'
    };

    this.errors = [];
  }

  async fetchLibrary() {
    this.logger.info(`[${this.username}] Fetching library from Suno...`);

    let allItems = [];
    let page = 0;
    let hasMore = true;
    let consecutiveExistingPages = 0;
    const EARLY_STOP_THRESHOLD = 2; // Stop after 2 consecutive pages of all-existing content

    // Calculate max pages needed if limit is set (20 items per page)
    const maxPages = this.limit ? Math.ceil(this.limit / 20) : Infinity;

    // Paginate through all pages to get complete library
    while (hasMore && page < maxPages) {
      // Rate limit between page requests (after first page)
      if (page > 0) {
        await this.sleep(2000); // 2 seconds between page requests to avoid rate limits
      }

      const url = `https://studio-api.prod.suno.com/api/feed/v2?hide_disliked=true&hide_gen_stems=true&hide_studio_clips=true&page=${page}`;

      const res = await this.retryFetch(url, {
        headers: {
          'Authorization': `Bearer ${this.cookie}`,
          'Content-Type': 'application/json'
        },
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to fetch library (page ${page}): ${res.status} ${res.statusText}\n${text}`);
      }

      const data = await res.json();
      const clips = data.clips || data.songs || data.data || data.items || [];

      if (clips.length === 0) {
        hasMore = false;
      } else {
        allItems.push(...clips);
        this.logger.info(`[${this.username}] Fetched page ${page}: ${clips.length} items (total: ${allItems.length})`);

        // Log first clip structure on first page for debugging
        if (page === 0 && clips.length > 0) {
          this.logger.info(`[${this.username}] Sample clip fields: ${Object.keys(clips[0]).join(', ')}`);
        }

        // Smart pagination: check if all clips on this page already exist (unless fullSync is enabled)
        if (!this.fullSync && this.existingIds.size > 0) {
          const newClipsOnPage = clips.filter(c => !this.existingIds.has(c.id)).length;

          if (newClipsOnPage === 0) {
            consecutiveExistingPages++;
            this.logger.info(`[${this.username}] Page ${page} contains all existing content (${consecutiveExistingPages}/${EARLY_STOP_THRESHOLD} consecutive)`);

            if (consecutiveExistingPages >= EARLY_STOP_THRESHOLD) {
              this.logger.info(`[${this.username}] Early stop: ${EARLY_STOP_THRESHOLD} consecutive pages of existing content`);
              hasMore = false;
            }
          } else {
            consecutiveExistingPages = 0; // Reset counter if we find new content
            this.logger.info(`[${this.username}] Page ${page} contains ${newClipsOnPage} new items`);
          }
        } else if (this.fullSync) {
          const newClipsOnPage = clips.filter(c => !this.existingIds.has(c.id)).length;
          this.logger.info(`[${this.username}] Full sync mode: Page ${page} has ${newClipsOnPage} new items (smart pagination disabled)`);
        }

        page++;

        // Stop early if we've exceeded the limit
        if (this.limit && allItems.length >= this.limit) {
          hasMore = false;
        }
      }
    }

    this.logger.info(`[${this.username}] Found ${allItems.length} total items`);
    return { items: allItems };
  }

  async retryFetch(url, options, attempt = 1) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (err) {
      if (attempt < this.maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        this.logger.warn(`[${this.username}] Retry ${attempt}/${this.maxRetries} after ${delay}ms: ${err.message}`);
        await this.sleep(delay);
        return this.retryFetch(url, options, attempt + 1);
      }
      throw err;
    }
  }

  async downloadItem(item, dlDir) {
    if (!item.audio_url) {
      this.logger.warn(`[${this.username}] No audio URL for item ${item.id}, skipping`);
      this.progress.skipped++;
      return false;
    }

    // Create safe filename base: "title - id"
    const safeTitle = (item.title || 'untitled')
      .replace(/[/\\?%*:|"<>]/g, '-') // Replace invalid chars
      .replace(/\s+/g, ' ')            // Normalize whitespace
      .trim()
      .slice(0, 100);                   // Limit length

    const fileBase = `${safeTitle} - ${item.id}`;

    // Determine which formats to download
    const formats = this.format === 'both' ? ['mp3', 'wav'] : [this.format];

    // If verifyFiles is enabled, check if all required files exist
    if (this.verifyFiles) {
      let allFilesExist = true;
      for (const fmt of formats) {
        const fileName = `${fileBase}.${fmt}`;
        const filePath = path.join(dlDir, fileName);
        try {
          await fs.access(filePath);
        } catch {
          allFilesExist = false;
          break;
        }
      }

      if (allFilesExist) {
        this.logger.info(`[${this.username}] ⏭ ${fileBase} (files exist, skipping)`);
        this.progress.skipped++;
        return true; // File exists, consider it a success
      }
    }

    let successCount = 0;
    const formatErrors = [];

    for (const fmt of formats) {
      try {
        // Rate limiting: wait before each download
        if (this.rateLimitMs > 0) {
          await this.sleep(this.rateLimitMs);
        }

        const fileName = `${fileBase}.${fmt}`;
        const outPath = path.join(dlDir, fileName);

        // Construct URL for the format (wav URLs typically end with .wav, mp3 with .mp3)
        const audioUrl = item.audio_url.replace(/\.(mp3|wav)$/, `.${fmt}`);

        const audio = await this.retryFetch(audioUrl, {
          headers: {
            'Authorization': `Bearer ${this.cookie}`
          }
        });

        if (!audio.ok) {
          // Handle format-specific errors (e.g., WAV restricted by plan)
          if (audio.status >= 400 && audio.status < 500) {
            formatErrors.push(`${fmt.toUpperCase()} not available (HTTP ${audio.status})`);
            this.logger.warn(`[${this.username}] ${fmt.toUpperCase()} format not available for ${item.id} (plan restriction?)`);
            continue; // Try next format without failing
          }
          throw new Error(`HTTP ${audio.status} for ${fmt}`);
        }

        const buf = Buffer.from(await audio.arrayBuffer());
        await fs.writeFile(outPath, buf);

        this.logger.info(`[${this.username}] ✓ ${fileName} (${this.progress.downloaded}/${this.progress.total})`);
        successCount++;
      } catch (err) {
        formatErrors.push(`${fmt}: ${err.message}`);
        this.logger.error(`[${this.username}] Failed to download ${fmt} for ${fileBase}: ${err.message}`);
      }
    }

    // Consider it successful if at least one format downloaded
    if (successCount > 0) {
      this.progress.downloaded++;
      if (formatErrors.length > 0) {
        // Log partial success
        this.logger.warn(`[${this.username}] Partial success for ${item.id}: ${formatErrors.join(', ')}`);
      }
      return true;
    } else {
      // All formats failed
      this.progress.failed++;
      this.errors.push({ id: item.id, error: formatErrors.join('; ') });
      this.logger.error(`[${this.username}] ✗ ${fileBase}: All formats failed - ${formatErrors.join('; ')}`);
      return false;
    }
  }

  async downloadBatch(items, dlDir) {
    const queue = [...items];
    const workers = [];

    for (let i = 0; i < this.concurrency; i++) {
      workers.push(this.worker(queue, dlDir));
    }

    await Promise.all(workers);
  }

  async worker(queue, dlDir) {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item) {
        const success = await this.downloadItem(item, dlDir);

        // Write to database immediately after successful download
        if (success && this.db) {
          try {
            this.db.insert(item);
            this.existingIds.add(item.id); // Update in-memory set for smart pagination
          } catch (err) {
            this.logger.error(`[${this.username}] Failed to write ${item.id} to database: ${err.message}`);
          }
        }
      }
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getProgress() {
    return { ...this.progress };
  }

  getErrors() {
    return [...this.errors];
  }
}
