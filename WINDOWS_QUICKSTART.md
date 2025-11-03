# 🎶 Suno Archive — Windows Quickstart Guide

A full, simple setup guide for getting the Suno Archive Tool running on Windows. Perfect for anyone new to Node.js or the command line.

## 🧰 Prerequisites

- **Node.js 20+** (includes npm) — **Node.js 22 recommended** — install from [https://nodejs.org](https://nodejs.org)
- **A Suno account** at [https://studio.suno.com](https://studio.suno.com)

## 📦 1. Unzip & Open the Correct Folder

1. Download and unzip the project ZIP.
   You might see folders like:

   ```bash
   suno-archive-main/
   suno-archive-main (2)/
   ```

2. Open the folder until you see files like:

   ```bash
   package.json
   server.js
   .env.example
   ```

3. In File Explorer, click the address bar → type `cmd` → press Enter.
   You should now see something like:

   ```bash
   C:\Users\<you>\Downloads\suno-archive-main (2)\suno-archive-main>
   ```

## ⚙️ 2. Fix PowerShell Script Errors (if any)

If PowerShell says:

```bash
npm.ps1 cannot be loaded because running scripts is disabled
```

**→ Open Command Prompt (black window) instead**, or run this in PowerShell (Admin):

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

## 📥 3. Install Dependencies

Run this inside the folder that has `package.json`:

```bash
npm install
```

✅ You should see:

```bash
added 200+ packages in 10s
found 0 vulnerabilities
```

**If you get `ENOENT: no such file or directory, open 'package.json'`**, you're in the wrong folder — go one level deeper.

## 🧩 4. Create Your .env File

**Option A — Copy from example:**

```bash
copy .env.example .env
notepad .env
```

If blank or missing, paste this:

```env
DATA_DIR=./data
PORT=8080
RATE_LIMIT_MS=1000
```

Save and close, then check it:

```bash
type .env
```

Create data folder if needed:

```bash
mkdir data
```

## 🔑 5. Get Your Suno Bearer Token

1. Go to [https://studio.suno.com](https://studio.suno.com) and log in
2. Press `Ctrl+Shift+I` to open Developer Tools
3. Click the **Network** tab (make sure the red dot 🔴 is recording)
4. Press `F5` to refresh
5. Click a request in the Name column that starts with:
   - `v2/`
   - or `studio-api.prod.suno.com`
6. In the right panel, open the **Headers** tab → scroll to **Request Headers** → find:

   ```text
   authorization: Bearer eyJhbGciOi...
   ```

7. Copy everything **after** `Bearer ` (this is your token). **Keep it private.**

## 🚀 6. Start the Server

Back in Command Prompt:

```bash
npm start
```

You'll see:

```bash
Server listening at http://127.0.0.1:8080
```

That means it's running!

Then open in your browser:

```text
http://localhost:8080
```

## 🖥️ 7. Run Your First Archive

In your browser form:

- **Username**: any name (e.g. `lucy`)
- **Suno Bearer Token**: paste your token
- **Audio Format**: `mp3`
- **Download Limit**: `5` (for test)

Click **Start Archive** → you'll see progress.

When it says "✅ Archive complete!", check:

```bash
data\<username>\downloads\
```

You'll see `.mp3` files like `My Song - track_123.mp3`.

## 💾 8. For Large Libraries

- Remove **Download Limit** for full backups
- Check **Full Sync Mode** if a previous run was interrupted
- Check **Verify Files on Disk** if you've moved or deleted files
- You can safely stop & restart — it skips already downloaded files
- The rate limit and concurrency are now controlled via the UI (no need to configure via `.env` unless you want defaults)

## 📤 9. Export ZIP

Use the **Export ZIP** button in the UI to download everything as one archive.

## 🧰 Troubleshooting

| Problem                    | Solution                                                  |
| -------------------------- | --------------------------------------------------------- |
| `npm.ps1 cannot be loaded` | Use Command Prompt or set PowerShell policy               |
| `ENOENT: no package.json`  | Move into inner folder containing it                      |
| `EADDRINUSE: port 8080`    | Change `PORT` in `.env` (e.g. `9090`)                     |
| `429 Too Many Requests`    | Increase rate limit in `.env` (e.g. `RATE_LIMIT_MS=2000`) |
| Where are my files?        | In `data\<username>\downloads\`                           |

## ♻️ Incremental Sync

Re-running the same username will:

- Skip already downloaded tracks
- Only fetch new songs
- Update your `library.db`

**First run:** Full sync is automatically enabled (database is empty)

**Subsequent runs:** Smart pagination stops early when it finds existing content

## ⚠️ Token Safety

- Tokens are temporary — never commit them to GitHub
- This tool is for personal archival use per Suno's ToS
- Your token is never stored and only used during the request

## 🧠 TL;DR Quick Test

```bash
npm install
copy .env.example .env
npm start
```

→ Visit [http://localhost:8080](http://localhost:8080)
→ Run a test with `limit=5`, `format=mp3`

🎉 **Done!**
