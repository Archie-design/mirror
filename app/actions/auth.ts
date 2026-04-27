'use server';

import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { setSessionCookie, clearSessionCookie } from '@/lib/auth';
import { standardizePhone } from '@/lib/utils/phone';
import { initMemberGrid } from '@/app/actions/nine-grid';
import { FORTUNE_COMPANIONS, getLowestFortune } from '@/components/Login/RegisterForm';
import type { CharacterStats } from '@/types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export async function loginWithPhone(
    name: string,
    phoneSuffix: string
): Promise<{ success: boolean; userId?: string; stats?: CharacterStats; error?: string }> {
    if (typeof name !== 'string' || typeof phoneSuffix !== 'string') {
        return { success: false, error: '參數錯誤' };
    }
    const trimmedName = name.trim();
    const trimmedSuffix = phoneSuffix.trim();
    if (!trimmedName || !trimmedSuffix) return { success: false, error: '請輸入姓名與手機末三碼' };

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
        .from('CharacterStats')
        .select('*')
        .eq('Name', trimmedName)
        .like('UserID', `%${trimmedSuffix}`);

    if (error) return { success: false, error: '系統連線異常' };
    const match = (data && data[0]) as CharacterStats | undefined;
    if (!match) return { success: false, error: '查無此觀影者帳號。' };

    await setSessionCookie(match.UserID);
    return { success: true, userId: match.UserID, stats: match };
}

export async function registerAccount(input: {
    name: string;
    phone: string;
    email?: string;
    fortunes?: Record<string, number>;
}): Promise<{ success: boolean; userId?: string; stats?: CharacterStats; error?: string }> {
    const name = input.name?.trim();
    const email = input.email?.trim()?.toLowerCase() || null;
    if (!name || !input.phone) return { success: false, error: '請輸入姓名與手機號碼' };

    const userId = standardizePhone(input.phone);
    if (!userId) return { success: false, error: '手機號碼格式錯誤' };

    const supabase = createClient(supabaseUrl, supabaseKey);

    const newChar: Record<string, unknown> = {
        UserID: userId,
        Name: name,
        Score: 0,
        Streak: 0,
        LastCheckIn: null,
        Email: email,
    };

    if (input.fortunes) {
        for (const f of FORTUNE_COMPANIONS) {
            newChar[f.dbCol] = input.fortunes[f.key] ?? 0;
        }
    }

    // 檢查 Rosters 名冊自動帶入小隊
    if (email) {
        const { data: rosterMatch } = await supabase
            .from('Rosters')
            .select('*')
            .eq('email', email)
            .single();
        if (rosterMatch) {
            newChar.SquadName = rosterMatch.squad_name;
            newChar.TeamName = rosterMatch.team_name;
            newChar.IsCaptain = rosterMatch.is_captain;
        }
    }

    const { error: insertErr } = await supabase.from('CharacterStats').insert([newChar]);
    if (insertErr) {
        const isDuplicate = insertErr.code === '23505'; // unique_violation
        return {
            success: false,
            error: isDuplicate
                ? '此手機號碼已經建立過帳號，請直接登入。'
                : `註冊失敗：${insertErr.message}`,
        };
    }

    // 先設定 session cookie，後續 initMemberGrid 的 requireSelf 才能通過
    await setSessionCookie(userId);

    // 依最低五運自動初始化九宮格
    if (input.fortunes) {
        const lowestFortune = getLowestFortune(input.fortunes);
        await initMemberGrid(userId, lowestFortune.companion);
    }

    return { success: true, userId, stats: newChar as unknown as CharacterStats };
}

export async function logoutUser(): Promise<void> {
    await clearSessionCookie();
}
