'use server';

import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';

import { type CourseKey } from '@/lib/courseConfig';
import { verifyAdminSession } from '@/app/actions/admin-auth';

const getSupabase = () => createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function verifyVolunteerPassword(input: string): Promise<boolean> {
    if (!input) return false;
    const { data } = await getSupabase()
        .from('SystemSettings')
        .select('SettingValue')
        .eq('SettingName', 'VolunteerPassword')
        .maybeSingle();
    const stored = (data?.SettingValue ?? '').toString();
    if (!stored) return false;
    const a = Buffer.from(input, 'utf8');
    const b = Buffer.from(stored, 'utf8');
    if (a.length !== b.length) return false;
    try { return timingSafeEqual(a, b); } catch { return false; }
}

/**
 * Register a user for a course by matching name + last 3 digits of phone.
 * Returns the registration UUID to be encoded in QR code.
 * If already registered, returns the existing registration ID.
 */
export async function registerForCourse(
    name: string,
    phone3: string,
    courseKey: CourseKey
): Promise<{ success: true; registrationId: string; userName: string } | { success: false; error: string }> {
    const trimmedName = name.trim();
    const trimmedPhone = phone3.trim();

    if (!trimmedName || trimmedPhone.length !== 3 || !/^\d{3}$/.test(trimmedPhone)) {
        return { success: false, error: '請填寫正確的姓名與手機末三碼（3位數字）' };
    }

    // Match against CharacterStats (UserID ends with phone3)
    const { data: users, error: fetchErr } = await getSupabase()
        .from('CharacterStats')
        .select('UserID, Name')
        .eq('Name', trimmedName)
        .ilike('UserID', `%${trimmedPhone}`);

    if (fetchErr) return { success: false, error: '查詢失敗，請稍後再試' };
    if (!users || users.length === 0) {
        return { success: false, error: '找不到符合的學員資料，請確認姓名與手機末三碼是否正確' };
    }
    // 多人撞名 + 手機末 3 碼相同：無法唯一識別，拒絕自動配對以防冒用
    if (users.length > 1) {
        return { success: false, error: '姓名與末三碼撞名，無法自動識別，請聯繫工作人員以完整手機號驗證' };
    }

    const user = users[0];

    // Check for existing registration (ON CONFLICT DO NOTHING pattern)
    const { data: existing } = await getSupabase()
        .from('CourseRegistrations')
        .select('id')
        .eq('user_id', user.UserID)
        .eq('course_key', courseKey)
        .single();

    if (existing) {
        return { success: true, registrationId: existing.id, userName: user.Name };
    }

    // Create new registration
    const { data: newReg, error: insertErr } = await getSupabase()
        .from('CourseRegistrations')
        .insert({ user_id: user.UserID, course_key: courseKey })
        .select('id')
        .single();

    if (insertErr || !newReg) {
        return { success: false, error: '報名失敗，請稍後再試' };
    }

    return { success: true, registrationId: newReg.id, userName: user.Name };
}

/**
 * Mark attendance by scanning registration QR code (UUID).
 * 需管理員 session 或正確的志工密碼。
 */
export async function markAttendance(
    registrationId: string,
    note: string = 'admin',
    volunteerPassword?: string,
): Promise<
    | { success: true; userName: string; courseKey: CourseKey; alreadyCheckedIn: boolean }
    | { success: false; error: string }
> {
    const isAdmin = await verifyAdminSession();
    if (!isAdmin) {
        const ok = volunteerPassword ? await verifyVolunteerPassword(volunteerPassword) : false;
        if (!ok) return { success: false, error: '無權限：需管理員身份或正確的志工密碼' };
    }

    // Look up the registration
    const { data: reg, error: regErr } = await getSupabase()
        .from('CourseRegistrations')
        .select('user_id, course_key')
        .eq('id', registrationId)
        .single();

    if (regErr || !reg) {
        return { success: false, error: '無效的 QR 碼，找不到對應報名記錄' };
    }

    // Get user name
    const { data: user } = await getSupabase()
        .from('CharacterStats')
        .select('Name')
        .eq('UserID', reg.user_id)
        .single();

    const userName = user?.Name ?? reg.user_id;
    const courseKey = reg.course_key as CourseKey;

    // Check if already checked in
    const { data: existing } = await getSupabase()
        .from('CourseAttendance')
        .select('id')
        .eq('user_id', reg.user_id)
        .eq('course_key', courseKey)
        .single();

    if (existing) {
        return { success: true, userName, courseKey, alreadyCheckedIn: true };
    }

    // Insert attendance record
    const { error: attendErr } = await getSupabase()
        .from('CourseAttendance')
        .insert({ user_id: reg.user_id, course_key: courseKey, checked_in_by: note });

    if (attendErr) {
        return { success: false, error: '報到寫入失敗，請重試' };
    }

    return { success: true, userName, courseKey, alreadyCheckedIn: false };
}

/**
 * Get full attendance list for a course.
 * 需管理員 session 或傳入正確的志工密碼。
 * 未授權時回傳空陣列，避免洩露學員報到資料。
 */
export async function getCourseAttendanceList(
    courseKey: CourseKey,
    volunteerPassword?: string,
): Promise<{ userId: string; userName: string; attendedAt: string }[]> {
    const isAdmin = await verifyAdminSession();
    if (!isAdmin) {
        const ok = volunteerPassword ? await verifyVolunteerPassword(volunteerPassword) : false;
        if (!ok) return [];
    }

    const { data, error } = await getSupabase()
        .from('CourseAttendance')
        .select('user_id, attended_at')
        .eq('course_key', courseKey)
        .order('attended_at', { ascending: false });

    if (error || !data) return [];

    const userIds = data.map(r => r.user_id);
    if (userIds.length === 0) return [];

    const { data: users } = await getSupabase()
        .from('CharacterStats')
        .select('UserID, Name')
        .in('UserID', userIds);

    const nameMap = new Map((users ?? []).map(u => [u.UserID, u.Name]));

    return data.map(r => ({
        userId: r.user_id,
        userName: nameMap.get(r.user_id) ?? r.user_id,
        attendedAt: r.attended_at,
    }));
}
