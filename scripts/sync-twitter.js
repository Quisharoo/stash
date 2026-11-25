const { execSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https'); // For the outbound request to Supabase

const PORT = 3005;

// Load .env
const envPath = path.resolve(__dirname, '../.env');
let env = {};
if (fs.existsSync(envPath)) {
    env = fs.readFileSync(envPath, 'utf8').split('\n').reduce((acc, line) => {
        const [key, val] = line.split('=');
        if (key && val) acc[key.trim()] = val.trim();
        return acc;
    }, {});
}

const USER_ID = env.USER_ID;
const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/sync-twitter`;

if (!USER_ID || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('❌ Missing required environment variables in .env');
    console.error('Please ensure .env exists in the project root.');
    process.exit(1);
}

const requestHandler = (req, res) => {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Private-Network', 'true'); // Allow local network access from https

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.url === '/sync' && req.method === 'POST') {
        console.log('🔄 Received sync request from web app...');

        try {
            doSync()
                .then((count) => {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, count: count }));
                })
                .catch((err) => {
                    console.error('❌ Sync failed:', err.message);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: err.message }));
                });
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: err.message }));
        }
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
};

const server = http.createServer(requestHandler);

server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        console.log(`\n⚠️  Port ${PORT} is in use (Bridge already running).`);
        console.log('🔄 Proceeding with one-off sync only...\n');
        doSync()
            .then(() => process.exit(0))
            .catch((err) => {
                console.error('\n❌ Sync failed:', err.message);
                process.exit(1);
            });
    } else {
        console.error('Server error:', e);
    }
});

server.listen(PORT, async (err) => {
    if (err) {
        return console.log('something bad happened', err);
    }
    console.log(`\n🚀 Local Twitter Bridge is running on port ${PORT}`);

    // Run one sync immediately on start!
    try {
        await doSync();
    } catch (e) {
        console.error('Initial sync failed:', e.message);
    }

    console.log(`\n👉 You can keep this running to enable the "Sync" button in the web app.`);
    console.log(`   (Note: Web button might be blocked by browser security on HTTPS sites. Using this script directly is most reliable.)\n`);
});

async function doSync() {
    console.log('🐦 Fetching bookmarks from Twitter for user ' + USER_ID);

    // 1. Run bird to get bookmarks as JSON
    // We remove --max-pages as it is not supported
    try {
        const output = execSync('npx -y @steipete/bird bookmarks --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); // capture stderr

        let tweets;
        try {
            tweets = JSON.parse(output);
        } catch (e) {
            // output might contain non-json text if npx logs info
            throw new Error('Failed to parse bird output. Please check your login.');
        }

        if (!Array.isArray(tweets) || tweets.length === 0) {
            console.log('No bookmarks found.');
            return 0;
        }

        console.log(`📦 Found ${tweets.length} bookmarks. Sending to Cloud...`);

        // 2. Send to Supabase Edge Function
        const payload = JSON.stringify({
            userId: USER_ID,
            sourceType: 'import_json',
            tweets: tweets
        });

        return new Promise((resolve, reject) => {
            const url = new URL(FUNCTION_URL);
            const options = {
                hostname: url.hostname,
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'Content-Length': Buffer.byteLength(payload)
                }
            };

            const remoteReq = https.request(options, (remoteRes) => {
                let data = '';
                remoteRes.on('data', (chunk) => data += chunk);
                remoteRes.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        if (result.error) {
                            reject(new Error(result.error));
                        } else {
                            console.log(`✅ Success! Synced ${result.count} items.\n`);
                            resolve(result.count);
                        }
                    } catch (e) {
                        reject(new Error('Invalid response from server' + data));
                    }
                });
            });

            remoteReq.on('error', (e) => {
                reject(e);
            });

            remoteReq.write(payload);
            remoteReq.end();
        });

    } catch (err) {
        // execSync throws if command fails
        // err.stderr contains the error output
        const errorMessage = err.stderr ? err.stderr.toString() : err.message;
        throw new Error('Bird command failed: ' + errorMessage);
    }
}
