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

### 🔐 Security & Multi-User
Once hosted on a public domain (like Vercel), Stash automatically turns on the **Login Screen** for security.
- **Local Development**: Stash skips the login for convenience when running on `localhost`.
- **Production**: You will need to sign in using the email/password you created in your Supabase Auth dashboard.

### 🛡️ Hardened RLS (Optional)
If you want to be extremely secure, you can revert the "relaxed" RLS policies and use strict per-user filters once you have logged in.

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
