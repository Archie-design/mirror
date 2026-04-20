import 'server-only';
import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'line_session_uid';
const TOKEN_LABEL = 'session-v1';
// 活動期間至 2026-06-28；保守給 120 天覆蓋整季
export const SESSION_TTL_SECONDS = 120 * 24 * 60 * 60;

export class AuthError extends Error {
    code: 'UNAUTHENTICATED' | 'UNAUTHORIZED';
    constructor(code: 'UNAUTHENTICATED' | 'UNAUTHORIZED') {
        super(code);
        this.code = code;
    }
}

function getSecret(): string {
    const s = process.env.AUTH_SESSION_SECRET;
    if (s) return s;
    if (process.env.NODE_ENV !== 'production') return 'dev-only-auth-secret-do-not-use-in-prod';
    throw new Error('AUTH_SESSION_SECRET env var not set');
}

function hmac(userId: string): string {
    return createHmac('sha256', getSecret()).update(`${TOKEN_LABEL}:${userId}`).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

export function signUserId(userId: string): string {
    return `${userId}.${hmac(userId)}`;
}

export function verifyToken(token: string | undefined): string | null {
    if (!token) return null;
    const dot = token.lastIndexOf('.');
    if (dot < 1) return null;
    const userId = token.slice(0, dot);
    const mac = token.slice(dot + 1);
    if (!userId || !mac) return null;
    let expected: string;
    try {
        expected = hmac(userId);
    } catch {
        return null;
    }
    return safeEqual(mac, expected) ? userId : null;
}

export async function getSessionUser(): Promise<string | null> {
    const c = await cookies();
    return verifyToken(c.get(SESSION_COOKIE)?.value);
}

export async function requireUser(): Promise<string> {
    const uid = await getSessionUser();
    if (!uid) throw new AuthError('UNAUTHENTICATED');
    return uid;
}

// server action 入口：比對 client 傳入的 userId 與 session cookie 是否一致
export async function requireSelf(claimedUserId: string): Promise<string> {
    const sessionUid = await requireUser();
    if (sessionUid !== claimedUserId) throw new AuthError('UNAUTHORIZED');
    return sessionUid;
}

function cookieOptions(maxAge: number) {
    return {
        httpOnly: true,
        sameSite: 'lax' as const,
        secure: process.env.NODE_ENV === 'production',
        maxAge,
        path: '/',
    };
}

export async function setSessionCookie(userId: string): Promise<void> {
    const c = await cookies();
    c.set(SESSION_COOKIE, signUserId(userId), cookieOptions(SESSION_TTL_SECONDS));
}

export async function clearSessionCookie(): Promise<void> {
    const c = await cookies();
    c.set(SESSION_COOKIE, '', cookieOptions(0));
}

// 將 AuthError 轉為 server action 回傳格式的 helper
export function authErrorResponse(err: unknown): { success: false; error: string } | null {
    if (err instanceof AuthError) {
        return { success: false, error: err.code === 'UNAUTHENTICATED' ? '請先登入' : '無權限執行此操作' };
    }
    return null;
}
