# Leonard's Locks — Git Setup & Deployment Guide

## Files in This Project

```
leonards-locks/
├── index.html        ← Main app shell + HTML
├── app.js            ← Core logic (tabs, setup, odds fetching, cache)
├── picks.js          ← Picks generation algorithm
├── bets.js           ← Bet tracking, history, pending bets
├── stats.js          ← Team stats, matchup analyzer
├── teamstats.js      ← Default Barttorvik team database
├── styles.css        ← Dark/light theme, all styling
├── invite.js         ← NEW: Invite link system (add this!)
└── .gitignore        ← Keeps secrets out of git
```

---

## Step 1 — Create Your Repository on GitHub

1. Go to **github.com** → click **New** (green button)
2. Name it: `bracket-odds` (or `leonards-locks`)
3. Set to **Public** (required for free GitHub Pages)
4. Leave "Add README" **unchecked** — add files yourself
5. Click **Create repository**

---

## Step 2 — Initialize Git Locally

Open Terminal in your project folder and run:

```bash
# Initialize
git init
git add .
git commit -m "Initial commit - Leonard's Locks NCAA app"

# Connect to GitHub (replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/bracket-odds.git
git branch -M main
git push -u origin main
```

---

## Step 3 — Enable GitHub Pages (Free Hosting)

1. On GitHub, go to your repo → **Settings** → **Pages**
2. Under **Source**, select: **Deploy from a branch**
3. Branch: **main** / Folder: **/ (root)**
4. Click **Save**
5. Wait ~60 seconds — your app will be live at:
   ```
   https://YOUR_USERNAME.github.io/bracket-odds
   ```

---

## Step 4 — Add invite.js to Your App

Add ONE line to `index.html` right before the closing `</body>` tag:

```html
<script src="teamstats.js"></script>
<script src="app.js"></script>
<script src="stats.js"></script>
<script src="bets.js"></script>
<script src="picks.js"></script>
<script src="invite.js"></script>   ← ADD THIS LINE
</body>
```

---

## Step 5 — Create .gitignore

Create a file called `.gitignore` in your project root:

```
# Never commit API keys
config.js
.env
secrets.js

# System files
.DS_Store
Thumbs.db
*.log

# Node (if you ever add a build step)
node_modules/
```

> ⚠️ **API keys are stored in localStorage only** — they're never in your code files, so they're already safe to commit. The `.gitignore` is a safety net for future config files.

---

## How the Invite Link System Works

### You (Leonard) Generate the Link:
1. Open the app → **TOOLS** → **KEYS** tab
2. Scroll to **INVITE LINK — SHARE WITH FRIENDS**
3. Optionally enter a passphrase (e.g., `leonards2025`)
4. Tap **GENERATE & COPY INVITE LINK**
5. The link is copied to clipboard — text/iMessage it to your group

### Your Friends Click the Link:
- Keys auto-load into their browser's localStorage
- App launches immediately — no setup required
- The URL hash is cleaned so keys aren't bookmarked

### Example Generated Link:
```
https://bspangler0519.github.io/bracket-odds#llk=eyJvIjoiYWJjMTIzI...
```

### Security Details:
| Feature | Detail |
|---|---|
| Keys in URL hash | Hash fragment is **never sent to the server** — browser-only |
| Obfuscation | Base64 encoded (prevents casual reading) |
| Optional passphrase | XOR cipher layer — send passphrase via SMS separately |
| localStorage only | Keys saved on device, not in your GitHub code |
| One-time use | Hash cleaned from URL after loading |

---

## Deploying Updates

After making changes, push to GitHub to update the live site:

```bash
git add .
git commit -m "Update: [describe your change]"
git push
```

GitHub Pages auto-deploys within ~60 seconds.

---

## Common Git Commands Reference

| Command | What it does |
|---|---|
| `git status` | See changed files |
| `git add .` | Stage all changes |
| `git commit -m "msg"` | Save a snapshot |
| `git push` | Upload to GitHub |
| `git pull` | Download latest |
| `git log --oneline` | See commit history |

---

## Sharing the App URL

Send this to your group:
```
https://YOUR_USERNAME.github.io/bracket-odds
```

Or generate a personalized invite link with keys pre-loaded (see Step 4 above).
