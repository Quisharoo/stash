
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { action, code, redirectUrl, userId } = await req.json()
        const clientId = Deno.env.get('TWITTER_CLIENT_ID');
        const clientSecret = Deno.env.get('TWITTER_CLIENT_SECRET');

        if (!clientId || !clientSecret) {
            throw new Error('Twitter credentials missing on server');
        }

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // 1. Start Auth: Return URL
        if (action === 'start_auth') {
            const state = `stash_${Math.random().toString(36).substring(7)}`;

            // For simplicity in this demo, we use 'code_challenge=plain' to avoid importing complex crypto libs
            // In production, use S256 with a proper challenge string
            // We need to persist state/challenge if we were strict, but for this simple app we'll be loose
            const authUrl = new URL('https://twitter.com/i/oauth2/authorize');
            authUrl.searchParams.append('response_type', 'code');
            authUrl.searchParams.append('client_id', clientId);
            authUrl.searchParams.append('redirect_uri', redirectUrl); // e.g. https://stash-psi-sand.vercel.app
            authUrl.searchParams.append('scope', 'tweet.read users.read bookmark.read offline.access');
            authUrl.searchParams.append('state', state);
            authUrl.searchParams.append('code_challenge', 'challenge');
            authUrl.searchParams.append('code_challenge_method', 'plain');

            return new Response(JSON.stringify({ url: authUrl.toString() }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // 2. Exchange Code for Token (This part happens when the user comes BACK to the app, but simplified handling here)
        // Wait... client side app.js can't handle the callback easily without a backend route to "finish" it.
        // Actually, the app will reload with ?code=...
        // We need a way to swap that code.
        // Let's assume the client sends the code here.

        if (action === 'exchange_token') {
            if (!code) throw new Error('No code provided');

            // Exchange code
            const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`)
                },
                body: new URLSearchParams({
                    code,
                    grant_type: 'authorization_code',
                    client_id: clientId,
                    redirect_uri: redirectUrl,
                    code_verifier: 'challenge' // Must match the one sent in step 1
                })
            });

            if (!tokenResponse.ok) {
                const err = await tokenResponse.json();
                throw new Error('Token exchange failed: ' + JSON.stringify(err));
            }

            const tokenData = await tokenResponse.json();
            // tokenData contains: access_token, refresh_token, expires_in

            // Save tokens to DB for this user
            // We need a 'profiles' table or similar to store keys securely. 
            // For now, let's just create a 'twitter_tokens' table or store in a jsonb column on a user table if exists?
            // Let's create a dedicated table for tokens if it doesn't exist, OR just return it to client to save in localstorage (less secure but works for this "private" app).

            // Safer: Update the 'user_api_keys' table if we had one.
            // Let's store it in a new table 'integrations'

            const { error: dbError } = await supabase
                .from('integrations') // We will create this table
                .upsert({
                    user_id: userId,
                    provider: 'twitter',
                    access_token: tokenData.access_token,
                    refresh_token: tokenData.refresh_token,
                    expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
                }, { onConflict: 'user_id, provider' });

            if (dbError) throw dbError;

            return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        throw new Error('Invalid action');

    } catch (error) {
        console.error('Auth error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        )
    }
})
