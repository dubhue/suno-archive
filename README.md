# Suno Archive Tool

A self-hosted web tool for backing up and preserving your Suno creations. Designed to be reliable for massive personal archives (thousands of songs) with incremental sync support.

## Features

- **Incremental Sync**: Only downloads new tracks, skips existing ones
- **Smart Pagination**: Automatically stops fetching when reaching already-archived content (massive speedup for large archives)
- **Concurrent Downloads**: Configurable concurrency (default: 3 parallel downloads)
- **Automatic Retry**: Exponential backoff retry logic for failed requests
- **Safe Interruption Handling**: Resume from where you left off - partial downloads are safely re-downloaded
- **Per-User Storage**: Isolated storage directories for multiple users
- **Detailed Logging**: Timestamped logs for each archive run
- **Export to ZIP**: Download entire user archive as a ZIP file
- **Beautiful UI**: Modern, responsive web interface
- **Multiple Audio Formats**: Download MP3, WAV, or both formats
- **No Credentials Stored**: Your bearer token is only used during the request

## Quick Start

### Installation

```bash
npm install
```

### Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Edit `.env`:
```
DATA_DIR=/data/suno    # Where user archives are stored
PORT=8080              # Server port
```

### Running

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

The server will be available at `http://localhost:8080`

## Usage

1. Open the web interface in your browser
2. Enter your username
3. Paste your Suno bearer token (see [How to Get Your Bearer Token](#how-to-get-your-bearer-token))
4. Select audio format (MP3, WAV, or both)
5. **(Optional)** Check "Full Sync Mode" if:
   - This is your first run (auto-enabled)
   - A previous run was interrupted
   - You want to ensure your entire library is captured
6. **(Optional)** Check "Verify Files on Disk" if:
   - You've moved or deleted files from the download folder
   - You want to re-download missing files
   - You suspect files may be corrupted or incomplete
7. Click "Start Archive"
8. Wait for the download to complete
9. View your library or export as ZIP

## API Endpoints

### `POST /api/run`

Triggers an archive job for a user.

**Request:**
```json
{
  "username": "your-username",
  "cookie": "your-suno-bearer-token",
  "format": "mp3"
}
```

**Format Options:**
- `"mp3"` - Compressed MP3 format (default)
- `"wav"` - Lossless WAV format (may require premium plan)
- `"both"` - Both MP3 and WAV (falls back to MP3 if WAV unavailable)

**Response:**
```json
{
  "user": "your-username",
  "downloaded": 42,
  "failed": 0,
  "skipped": 3,
  "total": 1280,
  "errors": []
}
```

### `GET /api/library/:username`

Returns the user's library metadata as JSON.

**Response:**
```json
[
  {
    "id": "track-123",
    "title": "My Song",
    "audio_url": "https://...",
    ...
  }
]
```

### `GET /api/status/:username`

Returns the current job status for a user.

**Response:**
```json
{
  "username": "your-username",
  "status": "running",
  "progress": {
    "total": 100,
    "downloaded": 42,
    "failed": 0,
    "skipped": 3
  },
  "startTime": 1730000000000
}
```

### `POST /api/export/:username`

Downloads the user's entire archive as a ZIP file.

## Directory Structure

```
/data/suno/
  ├── alice/
  │    ├── library.db            # SQLite database with metadata
  │    ├── downloads/            # Downloaded audio files
  │    │    ├── My Song - track_123.mp3
  │    │    ├── My Song - track_123.wav
  │    │    └── Another Track - track_124.mp3
  │    └── logs/                 # Timestamped log files
  │         └── run-2025-10-31T12-00-00.log
  └── bob/
       ├── library.db
       └── downloads/
```

## How to Get Your Bearer Token

1. Log in to [suno.com](https://suno.com) in your browser
2. Open Developer Tools (F12 or Cmd+Opt+I on Mac, F12 or Ctrl+Shift+I on Windows/Linux)
3. Go to the **Network** tab
4. Refresh the page or navigate to your library
5. Click any request to `studio-api.prod.suno.com` (filter by "studio-api" for easier finding)
6. In the **Headers** section, find the **Authorization** header
7. Copy the bearer token value (it looks like: `Bearer eyJhbGc...`)
8. Paste the **entire value** including "Bearer " into the tool

**Alternative Method:**
1. In Developer Tools, go to the **Application** tab (Chrome) or **Storage** tab (Firefox)
2. Navigate to **Cookies** → `https://suno.com`
3. Find and copy the session/auth cookie value
4. Paste it into the tool (either cookie or bearer token works)

**Security Note:** Your bearer token is never stored persistently. It only exists in memory during the archive job and is immediately discarded afterward.

## Smart Pagination & Interruption Handling

### How Incremental Sync Works

**Smart Pagination Optimization:**
- The system tracks which songs are already archived in a SQLite database
- When fetching new content, it stops pagination after encountering 2 consecutive pages of already-downloaded content
- For large archives (1000+ songs), this reduces sync time from ~100 seconds to ~4 seconds when you only have a few new songs
- First-time archives automatically use full sync mode to build the complete library

**Safe Interruption Handling:**
- Database writes happen **incrementally** after each successful download
- If an archive job is interrupted (network failure, manual stop, server restart), progress is preserved
- Successfully downloaded tracks are already saved to the database
- Partial downloads are automatically re-downloaded and overwritten on the next run
- No risk of corrupted files - you always get complete audio files

**Full Sync Mode:**
- Disables smart pagination and fetches all pages from Suno
- Automatically enabled on first run (empty database)
- Can be manually enabled via checkbox in the UI or `fullSync: true` in the API
- Use this after an interrupted run to ensure your entire library is captured
- Prevents missing songs that might be beyond the early-stop threshold

**Verify Files Mode:**
- Checks the filesystem for existing files before downloading
- Skips downloads only if the actual file exists on disk
- Use this when you've moved/deleted files but the database still has records
- Slower than database-only checking, but ensures files are actually present
- Re-downloads missing or corrupted files automatically

**Example Scenario:**
1. First run: Downloads 1000 songs (full sync mode auto-enabled, all pages fetched, each saved to DB immediately)
2. Create 5 new songs on Suno
3. Second run: Smart pagination fetches only first 2 pages (~4 seconds), downloads 5 new songs
4. Job interrupted after downloading 3/5 songs → **Database has all 1003 songs (1000 old + 3 new)**
5. Third run (full sync enabled): Fetches all pages to be safe, downloads remaining 2 new songs

## Architecture

```
┌────────────────────────────┐
│        Frontend UI         │
│  (Browser, form + status)  │
└─────────────┬──────────────┘
              │
     HTTPS / REST
              │
┌─────────────┴──────────────┐
│        Fastify API         │
│  Node.js backend running   │
│  on your droplet or local  │
└─────────────┬──────────────┘
              │
 ┌────────────┴────────────┐
 │   Download Manager /    │
 │   Job Orchestrator      │
 └────────────┬────────────┘
              │
┌─────────────┴──────────────┐
│     File Storage Layer     │
│   /data/suno/{username}/   │
│  ├── library.json          │
│  ├── downloads/            │
│  └── logs/                 │
└─────────────┬──────────────┘
              │
┌─────────────┴──────────────┐
│      External APIs          │
│       (suno.com)            │
│    Auth via user cookie     │
└────────────────────────────┘
```

## Components

### Download Manager (`utils/downloadManager.js`)
- Fetches library from Suno API
- Manages concurrent downloads with configurable workers
- Implements retry logic with exponential backoff
- Supports multiple audio formats (MP3, WAV, or both)
- Gracefully handles format restrictions (e.g., WAV for premium users only)
- Tracks progress and errors

### Logger (`utils/logger.js`)
- Creates timestamped log files per run
- Logs to both file and console
- Structured logging with INFO/WARN/ERROR levels

### Job Manager (`utils/jobManager.js`)
- In-memory job tracking
- Provides status API for monitoring
- Tracks job lifecycle (running → completed/failed)

### File Helpers (`utils/fileHelpers.js`)
- Creates user directory structure
- Sanitizes usernames for security
- Ensures directories exist before operations

## Docker Deployment

Build the image:
```bash
docker build -t suno-archive .
```

Run the container:
```bash
docker run -d \
  -p 8080:8080 \
  -v /your/data/path:/data/suno \
  -e DATA_DIR=/data/suno \
  suno-archive
```

## Security Considerations

- **Bearer Token Never Stored**: User bearer tokens only exist in memory during requests
- **Input Sanitization**: Usernames are sanitized to prevent path traversal
- **User Isolation**: Each user has their own isolated directory
- **No Public File Serving**: Audio files are not exposed publicly unless explicitly routed
- **HTTPS Recommended**: Use a reverse proxy (NGINX/Caddy) for HTTPS in production

## Future Enhancements

- [ ] WebSocket support for real-time progress updates
- [ ] Background job scheduling (cron-style)
- [ ] Resume incomplete downloads
- [ ] S3/cloud storage backend option
- [ ] Multi-user authentication
- [ ] Track deduplication
- [ ] Metadata editing

## License

MIT

## Disclaimer

This tool is for personal archival use only. Ensure you comply with Suno's Terms of Service when using this tool.
