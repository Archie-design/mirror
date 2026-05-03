'use server';

import 'server-only';
import { cookies } from 'next/headers';
import { timingSafeEqual } from 'node:crypto';
import { ADMIN_COOKIE, ADMIN_TTL_SECONDS, computeAdminToken } from '@/lib/admin-token';

function getAdminPassword(): string {
    const pw = process.env.ADMIN_PASSWORD;
    if (!pw) {
        if (process.env.NODE_ENV !== 'production') {
            console.warn('[admin-auth] ADMIN_PASSWORD not set; falling back to "123" in dev');
            return '123';
        }
        throw new Error('ADMIN_PASSWORD env var not set');
    }
    return pw;
}

function safeEqualString(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

export async function loginAdmin(password: string): Promise<{ success: boolean; error?: string }> {
    if (typeof password !== 'string' || password.length === 0 || password.length > 256) {
        return { success: false, error: 'invalid' };
    }
    let expected: string;
    try {
        expected = getAdminPassword();
    } catch {
        return { success: false, error: 'config' };
    }
    if (!safeEqualString(password, expected)) {
        return { success: false, error: 'invalid' };
    }
    const c = await cookies();
    c.set(ADMIN_COOKIE, computeAdminToken(), {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: ADMIN_TTL_SECONDS,
        path: '/',
    });
    return { success: true };
}

export async function logoutAdmin(): Promise<void> {
    const c = await cookies();
    c.set(ADMIN_COOKIE, '', { httpOnly: true, maxAge: 0, path: '/' });
}

export async function verifyAdminSession(): Promise<boolean> {
    const c = await cookies();
    const token = c.get(ADMIN_COOKIE)?.value;
    if (!token) return false;
    return safeEqualString(token, computeAdminToken());
}
