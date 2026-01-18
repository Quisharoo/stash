import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { credentials, userId, syncType = 'bookmarks' } = await req.json()

        if (!credentials || !credentials.consumerKey || !credentials.consumerSecret || !credentials.accessToken || !credentials.accessSecret) {
            throw new Error('Missing Twitter OAuth 1.0a credentials');
        }

        if (!userId) throw new Error('User ID is required');

        console.log(`Starting Twitter OAuth 1.0a sync (${syncType}) for user ${userId}...`);

        // 1. Fetch User ID (Me)
        const meUrl = 'https://api.twitter.com/2/users/me';
        const headers = await getAuthHeaders(meUrl, 'GET', credentials);

        const userResponse = await fetch(meUrl, { headers });

        if (!userResponse.ok) {
            const error = await userResponse.json();
            throw new Error(`Twitter Auth Failed: ${JSON.stringify(error)}`);
        }

        const { data: twitterUser } = await userResponse.json();
        const twitterId = twitterUser.id;

        // 3. Fetch Bookmarks
        let endpoint = `https://api.twitter.com/2/users/${twitterId}/bookmarks`;
        const params = new URLSearchParams({
            'tweet.fields': 'created_at,entities,author_id',
            'expansions': 'author_id',
            'user.fields': 'name,username,profile_image_url'
        });
        const urlWithParams = `${endpoint}?${params.toString()}`;

        const bookmarkHeaders = await getAuthHeaders(urlWithParams, 'GET', credentials);

        const tweetsResponse = await fetch(urlWithParams, { headers: bookmarkHeaders });

        if (!tweetsResponse.ok) {
            const error = await tweetsResponse.json();
            throw new Error(`Failed to fetch tweets: ${JSON.stringify(error)}`);
        }

        const tweetsData = await tweetsResponse.json();
        const tweets = tweetsData.data || [];
        const includes = tweetsData.includes || { users: [] };

        // 4. Initialize Supabase Client
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // 5. Map and Upsert Tweets
        const saves = tweets.map((tweet: any) => {
            const author = includes.users.find((u: any) => u.id === tweet.author_id);
            return {
                user_id: userId,
                source_id: `tweet_${tweet.id}`,
                url: `https://twitter.com/i/web/status/${tweet.id}`,
                title: author ? `Tweet from @${author.username}` : 'Tweet',
                content: tweet.text,
                excerpt: tweet.text.substring(0, 200),
                site_name: 'Twitter',
                author: author ? author.name : 'Unknown',
                author_handle: author ? author.username : undefined,
                author_image_url: author ? author.profile_image_url : undefined,
                source: 'twitter_sync',
                created_at: tweet.created_at,
            };
        });

        if (saves.length > 0) {
            const { error: upsertError } = await supabase
                .from('saves')
                .upsert(saves, { onConflict: 'user_id, source_id' });

            if (upsertError) throw upsertError;
        }

        return new Response(
            JSON.stringify({ success: true, count: saves.length }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error('Error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        )
    }
})

// --- Helper for OAuth 1.0a Signature ---
// Using hmac-sha1 from a pure URL or manual implementation to avoid complexity

async function getAuthHeaders(url: string, method: string, creds: any) {
    const oauth = {
        consumer_key: creds.consumerKey,
        consumer_secret: creds.consumerSecret,
        token: creds.accessToken,
        token_secret: creds.accessSecret,
        nonce: Math.random().toString(36).substring(2),
        timestamp: Math.floor(Date.now() / 1000).toString(),
        version: '1.0',
        signature_method: 'HMAC-SHA1'
    };

    // 1. Parameter Normalization
    const urlObj = new URL(url);
    const params: Record<string, string> = {};

    // Add query params
    for (const [key, value] of urlObj.searchParams) {
        params[key] = value;
    }

    // Add OAuth params
    params['oauth_consumer_key'] = oauth.consumer_key;
    params['oauth_nonce'] = oauth.nonce;
    params['oauth_signature_method'] = oauth.signature_method;
    params['oauth_timestamp'] = oauth.timestamp;
    params['oauth_token'] = oauth.token;
    params['oauth_version'] = oauth.version;

    // Sort and Stringify
    const sortedKeys = Object.keys(params).sort();
    const paramString = sortedKeys.map(k =>
        `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`
    ).join('&');

    // 2. Base String Construction
    const baseUrl = url.split('?')[0];
    const signatureBaseString = `${method.toUpperCase()}&${encodeURIComponent(baseUrl)}&${encodeURIComponent(paramString)}`;

    // 3. Signing Key
    const signingKey = `${encodeURIComponent(oauth.consumer_secret)}&${encodeURIComponent(oauth.token_secret)}`;

    // 4. Calculate Signature (HMAC-SHA1)
    const signature = await hmacSha1(signingKey, signatureBaseString);

    // 5. Header Construction
    const headerParams = {
        oauth_consumer_key: oauth.consumer_key,
        oauth_nonce: oauth.nonce,
        oauth_signature: signature,
        oauth_signature_method: oauth.signature_method,
        oauth_timestamp: oauth.timestamp,
        oauth_token: oauth.token,
        oauth_version: oauth.version
    };

    const headerString = 'OAuth ' + Object.keys(headerParams).map(k =>
        `${k}="${encodeURIComponent(headerParams[k])}"`
    ).join(', ');

    return {
        'Authorization': headerString,
        'Content-Type': 'application/json'
    };
}

async function hmacSha1(key: string, message: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key);
    const msgData = encoder.encode(message);

    const cryptoKey = await crypto.subtle.importKey(
        "raw", keyData, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]
    );

    const signature = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
    return btoa(String.fromCharCode(...new Uint8Array(signature)));
}
