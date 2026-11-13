# Stash

A beautiful, self-hosted read-it-later "Newsfeed" application. Save articles, highlights, and Kindle notes to your own database.

**Your data. Your server. No subscription.**

---

## 🌟 Quick Start (Zero-Friction Setup)

### 1. Simple Cloud Setup (Recommended)
You can skip all prompts by creating a `.env` file (copy `.env.example`).
```bash
cp .env.example .env
# Open .env and add your SUPABASE_ACCESS_TOKEN and PROJECT_ID
node deploy.js
# Choose (C)loud when prompted.
```

### 2. Simple Local Setup
If you have Docker installed, you can run everything locally without even creating a Supabase account:
```bash
node deploy.js
# Choose (L)ocal when prompted.
```

---

## 🚀 Hosting & Production Security

### 1. Deploy to Vercel
I've already created a `vercel.json` for you. To deploy:
1. Install Vercel CLI: `npm i -g vercel`
2. Run `vercel` in the root directory.
3. Follow the CLI prompts to deploy.

### 🔐 Authentication and data isolation

Sign in with Supabase Auth in both the web app and Chrome extension, including
on localhost. Row ownership comes from that session; a configured user ID never
grants access. The public anonymous key identifies the project and is not a login.

For an existing installation, apply all migrations with `supabase db push` and
redeploy all Edge Functions with `supabase functions deploy`. The
`20261113000000_require_authenticated_ownership.sql` migration replaces legacy
open policies, isolates each user's saves, tags, folders and preferences, and
keeps integration tokens inaccessible to browser roles. A source merge alone
does not update a running database or function.

Set your own Supabase URL and public anonymous key with `node configure.js`.
Never put a service-role key in browser, extension, bookmarklet or shortcut code.
The tracked config files contain placeholders, not an existing user's project.
Legacy anonymous bookmarklets, the standalone save form and shortcuts must send
a valid Supabase user bearer token to the save functions; otherwise they receive
401. Prefer the authenticated Chrome extension; do not embed long-lived tokens
in bookmarks or share browser sessions with arbitrary websites.

The scheduled `send-digest` function requires the service-role bearer key from a
trusted server-side scheduler. It does not accept anonymous or user tokens.

Run the focused security checks with:

```bash
node --experimental-strip-types --test tests/*.test.mjs
python3 tests/database-security.py  # requires local PostgreSQL tools
```

---

## 🛠 Features
- **Newsfeed UI** - A modern, premium grid layout for your saved content.
- **Add URLs Directly** - Paste any link in the web app to save it.
- **Server-Side Scraper** - Automatically extracts clean article text.
- **Chrome Extension** - Save pages and highlights from your browser.
- **Kindle Sync** - Import highlights from `My Clippings.txt`.
- **Weekly Digest** - Get a summary of your weekly saves emailed to you.

---

## 📂 Project Structure
- `web/` - PWA Web App (the Newsfeed).
- `supabase/` - Database schema and Edge Functions.
- `extension/` - Chrome extension for saving while browsing.
- `deploy.js` - Automated setup & deployment script.

## ⚙️ Tech Stack
- **Frontend**: Vanilla JS, CSS (Modern Premium Design).
- **Backend**: Supabase (PostgreSQL + Edge Functions).
- **Hosting**: Vercel (Recommended), Netlify, or self-hosted.

## License
MIT.
