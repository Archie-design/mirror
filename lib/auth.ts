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

// ── 通用 HMAC 簽章工具（例如 OAuth state）────────────────────────────────
// 簽章 payload 會附 expireTs，驗簽時會同步檢查是否過期。
// 使用 base64url 編碼以安全放入 URL query string。

function b64urlEncode(buf: Buffer): string {
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Buffer {
    const pad = (4 - (s.length % 4)) % 4;
    return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad), 'base64');
}

// 簽 payload（JSON 可序列化物件）並加上過期時間
// 回傳 `<b64url(payload)>.<b64url(hmac)>`
export function signPayload<T extends object>(payload: T, ttlSeconds: number): string {
    const expireTs = Math.floor(Date.now() / 1000) + ttlSeconds;
    const body = { ...payload, expireTs };
    const json = JSON.stringify(body);
    const payloadEncoded = b64urlEncode(Buffer.from(json, 'utf8'));
    const mac = createHmac('sha256', getSecret()).update(payloadEncoded).digest();
    return `${payloadEncoded}.${b64urlEncode(mac)}`;
}

// 驗簽 + 過期檢查；失敗回 null
export function verifyPayload<T extends object = Record<string, unknown>>(token: string | undefined | null): T | null {
    if (!token) return null;
    const dot = token.indexOf('.');
    if (dot < 1) return null;
    const payloadEncoded = token.slice(0, dot);
    const macEncoded = token.slice(dot + 1);
    if (!payloadEncoded || !macEncoded) return null;

    let expected: Buffer;
    try {
        expected = createHmac('sha256', getSecret()).update(payloadEncoded).digest();
    } catch { return null; }

    const received = b64urlDecode(macEncoded);
    if (received.length !== expected.length) return null;
    try {
        if (!timingSafeEqual(received, expected)) return null;
    } catch { return null; }

    let payload: T & { expireTs?: number };
    try {
        payload = JSON.parse(b64urlDecode(payloadEncoded).toString('utf8'));
    } catch { return null; }

    if (typeof payload.expireTs !== 'number' || payload.expireTs < Math.floor(Date.now() / 1000)) return null;
    return payload;
}
