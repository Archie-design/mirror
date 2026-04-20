import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { signUserId, SESSION_COOKIE, SESSION_TTL_SECONDS } from '@/lib/auth';

// Handles LINE Login OAuth callback
// GET /api/auth/line/callback?code=XXX&state=YYY
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state') || 'login';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    if (!code) {
        return NextResponse.redirect(`${appUrl}/?line_error=cancelled`);
    }

    const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
    const channelSecret = process.env.LINE_LOGIN_CHANNEL_SECRET;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    if (!channelId || !channelSecret) {
        return NextResponse.redirect(`${appUrl}/?line_error=config`);
    }

    const redirectUri = `${appUrl}/api/auth/line/callback`;

    try {
        // Step 1: Exchange code for access token
        const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri,
                client_id: channelId,
                client_secret: channelSecret,
            }),
        });

        if (!tokenRes.ok) {
            return NextResponse.redirect(`${appUrl}/?line_error=token`);
        }

        const tokenData = await tokenRes.json();
        const accessToken: string = tokenData.access_token;

        // Step 2: Get LINE user profile
        const profileRes = await fetch('https://api.line.me/v2/profile', {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!profileRes.ok) {
            return NextResponse.redirect(`${appUrl}/?line_error=profile`);
        }

        const profile = await profileRes.json();
        const lineUserId: string = profile.userId;

        const supabase = createClient(supabaseUrl, supabaseKey);

        // Step 3: Handle state
        if (state.startsWith('bind:')) {
            // Binding flow: link LINE account to existing game account
            const uid = state.slice(5); // strip "bind:"
            if (!uid) {
                return NextResponse.redirect(`${appUrl}/?line_error=invalid_state`);
            }

            // Check if this LINE account is already bound to another user
            const { data: existing } = await supabase
                .from('CharacterStats')
                .select('UserID')
                .eq('LineUserId', lineUserId)
                .maybeSingle();

            if (existing && existing.UserID !== uid) {
                return NextResponse.redirect(`${appUrl}/?line_error=already_bound`);
            }

            const { error } = await supabase
                .from('CharacterStats')
                .update({ LineUserId: lineUserId })
                .eq('UserID', uid);

            if (error) {
                return NextResponse.redirect(`${appUrl}/?line_error=bind_failed`);
            }

            return NextResponse.redirect(`${appUrl}/?line_bound=success`);
        } else {
            // Login flow: find user by LINE ID
            const { data: user, error: lookupError } = await supabase
                .from('CharacterStats')
                .select('UserID')
                .eq('LineUserId', lineUserId)
                .maybeSingle();

            if (lookupError) {
                console.error('[LINE callback] DB lookup error:', lookupError.message);
                return NextResponse.redirect(`${appUrl}/?line_error=server`);
            }

            if (!user) {
                return NextResponse.redirect(`${appUrl}/?line_error=not_bound&lid=${encodeURIComponent(lineUserId)}`);
            }

            // 設定長效簽章 session cookie（HMAC-signed UserID），供 server action 驗證身分
            const res = NextResponse.redirect(`${appUrl}/?line_auth=1`);
            res.cookies.set(SESSION_COOKIE, signUserId(user.UserID), {
                httpOnly: true,
                sameSite: 'lax',
                maxAge: SESSION_TTL_SECONDS,
                path: '/',
                secure: process.env.NODE_ENV === 'production',
            });
            return res;
        }
    } catch {
        return NextResponse.redirect(`${appUrl}/?line_error=server`);
    }
}
