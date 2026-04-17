import { NextRequest, NextResponse } from 'next/server';

// Consumes the short-lived LINE login handoff cookie and returns the UserID.
// The cookie is set by /api/auth/line/callback and is HttpOnly — the client
// cannot read it directly, so it calls this endpoint to exchange it.
export async function GET(request: NextRequest) {
    const uid = request.cookies.get('line_session_uid')?.value;

    if (!uid) {
        return NextResponse.json({ error: 'no_session' }, { status: 401 });
    }

    // Clear the cookie immediately — single-use handoff token
    const res = NextResponse.json({ userId: uid });
    res.cookies.set('line_session_uid', '', {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 0,
        path: '/',
    });
    return res;
}
