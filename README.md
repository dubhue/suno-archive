# Suno Archive Tool

A self-hosted web tool for backing up and preserving your Suno creations. Designed to be reliable for massive personal archives (thousands of songs) with incremental sync support.

## Features

- **Incremental Sync**: Only downloads new tracks, skips existing ones
- **Concurrent Downloads**: Configurable concurrency (default: 3 parallel downloads)
- **Automatic Retry**: Exponential backoff retry logic for failed requests
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
5. Click "Start Archive"
6. Wait for the download to complete
7. View your library or export as ZIP

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
