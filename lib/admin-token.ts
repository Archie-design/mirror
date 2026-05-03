import { createHmac } from 'node:crypto';

export const ADMIN_COOKIE = 'admin_session';
export const ADMIN_TTL_SECONDS = 30 * 60;

const TOKEN_LABEL = 'admin-session-v1';

export function computeAdminToken(): string {
    if (process.env.NODE_ENV === 'production' && !process.env.AUTH_SESSION_SECRET) {
        throw new Error('AUTH_SESSION_SECRET env var is required in production');
    }
    const pw = process.env.ADMIN_PASSWORD;
    const fallback = (!pw && process.env.NODE_ENV !== 'production') ? '123' : (pw ?? '');
    const secret = process.env.AUTH_SESSION_SECRET || fallback;
    return createHmac('sha256', secret).update(TOKEN_LABEL).digest('hex');
}
