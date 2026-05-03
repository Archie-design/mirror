import { NextRequest, NextResponse } from 'next/server';
import { requireSelf, signPayload, AuthError } from '@/lib/auth';
import { randomBytes } from 'node:crypto';

// Initiates LINE Login OAuth flow
// GET /api/auth/line?action=login
// GET /api/auth/line?action=bind&uid=USER_ID
//   - bind 流程需發起者本人已登入（由 requireSelf 驗證 session cookie）
//   - state 以 HMAC 簽章避免竄改或 CSRF
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'login';
    const uid = searchParams.get('uid') || '';

    const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    if (!channelId) {
        return NextResponse.json({ error: 'LINE Login not configured' }, { status: 500 });
    }

    let state: string;
    const nonce = randomBytes(12).toString('hex');

    if (action === 'bind') {
        if (!uid) return NextResponse.redirect(`${appUrl}/?line_error=invalid_uid`);
        try {
            await requireSelf(uid);
        } catch (e) {
            if (e instanceof AuthError) {
                return NextResponse.redirect(`${appUrl}/?line_error=bind_unauthorized`);
            }
            return NextResponse.redirect(`${appUrl}/?line_error=server`);
        }
        // 簽章 10 分鐘有效；payload 含 uid，callback 驗簽後使用
        state = signPayload({ action: 'bind', uid, nonce }, 10 * 60);
    } else if (action === 'admin_login') {
        state = signPayload({ action: 'admin_login', nonce }, 10 * 60);
    } else {
        state = signPayload({ action: 'login', nonce }, 10 * 60);
    }

    const redirectUri = `${appUrl}/api/auth/line/callback`;

    const lineAuthUrl = new URL('https://access.line.me/oauth2/v2.1/authorize');
    lineAuthUrl.searchParams.set('response_type', 'code');
    lineAuthUrl.searchParams.set('client_id', channelId);
    lineAuthUrl.searchParams.set('redirect_uri', redirectUri);
    lineAuthUrl.searchParams.set('scope', 'profile');
    lineAuthUrl.searchParams.set('state', state);

    return NextResponse.redirect(lineAuthUrl.toString());
}
