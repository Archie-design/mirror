import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';

// 驗證 HMAC 簽章 session cookie 並回傳 UserID。
// 不再清除 cookie——cookie 是長效 session，供後續 server action 身分驗證使用。
export async function GET() {
    const uid = await getSessionUser();
    if (!uid) {
        return NextResponse.json({ error: 'no_session' }, { status: 401 });
    }
    return NextResponse.json({ userId: uid });
}
