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
        const { twitterToken, userId, syncType = 'bookmarks' } = await req.json()

        if (!twitterToken) throw new Error('Twitter token is required')
        if (!userId) throw new Error('User ID is required')

        console.log(`Starting Twitter sync (${syncType}) for user ${userId}...`);

        // 1. Get Twitter User ID (needed for bookmarks endpoint)
        const userResponse = await fetch('https://api.twitter.com/2/users/me', {
            headers: { 'Authorization': `Bearer ${twitterToken}` }
        });

        if (!userResponse.ok) {
            const error = await userResponse.json();
            throw new Error(`Twitter API error: ${JSON.stringify(error)}`);
        }

        const { data: twitterUser } = await userResponse.json();
        const twitterId = twitterUser.id;

        // 2. Fetch Bookmarks or Likes
        // Note: Needs 'tweet.fields=created_at,entities,author_id,public_metrics'
        // and 'expansions=author_id'
        let endpoint = `https://api.twitter.com/2/users/${twitterId}/bookmarks?tweet.fields=created_at,entities,author_id&expansions=author_id&user.fields=name,username,profile_image_url`;
        if (syncType === 'likes') {
            endpoint = `https://api.twitter.com/2/users/${twitterId}/liked_tweets?tweet.fields=created_at,entities,author_id&expansions=author_id&user.fields=name,username,profile_image_url`;
        }

        const tweetsResponse = await fetch(endpoint, {
            headers: { 'Authorization': `Bearer ${twitterToken}` }
        });

        if (!tweetsResponse.ok) {
            const error = await tweetsResponse.json();
            throw new Error(`Failed to fetch tweets: ${JSON.stringify(error)}`);
        }

        const tweetsData = await tweetsResponse.json();
        const tweets = tweetsData.data || [];
        const includes = tweetsData.includes || { users: [] };

        // 3. Initialize Supabase Client
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // 4. Map and Upsert Tweets
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
        console.error('Keys:', {
            hasUrl: !!Deno.env.get('SUPABASE_URL'),
            hasServiceKey: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
        });
        console.error('Error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            {
                status: 200, // Return 200 so client can read the error message
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        )
    }
})
