'use server';

import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { requireSelf, authErrorResponse } from '@/lib/auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export type GatheringCheckin = {
    userId: string;
    userName: string | null;
    checkedInAt: string;
};

export type GatheringStatus = {
    gatheringId: string;
    checkins: GatheringCheckin[];
    allMemberCount: number;
    isComplete: boolean;
};

// ── 成員掃碼報到 ──────────────────────────────────────────────────────────
export async function checkInToGathering(
    gatheringId: string,
    userId: string,
    userName: string
): Promise<{ success: boolean; error?: string; alreadyCheckedIn?: boolean }> {
    try { await requireSelf(userId); } catch (e) { return authErrorResponse(e)!; }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { error } = await supabase
        .from('SquadGatheringCheckins')
        .upsert(
            { gathering_id: gatheringId, user_id: userId, user_name: userName },
            { onConflict: 'gathering_id,user_id', ignoreDuplicates: true }
        );

    if (error) {
        // 已報到（unique constraint）視為成功
        if (error.code === '23505') return { success: true, alreadyCheckedIn: true };
        return { success: false, error: '報到失敗：' + error.message };
    }
    return { success: true };
}

// ── 查詢某場定聚的到場狀況 ───────────────────────────────────────────────
export async function getGatheringStatus(
    gatheringId: string,
    allMemberCount: number
): Promise<{ success: boolean; status?: GatheringStatus; error?: string }> {
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
        .from('SquadGatheringCheckins')
        .select('user_id, user_name, checked_in_at')
        .eq('gathering_id', gatheringId)
        .order('checked_in_at', { ascending: true });

    if (error) return { success: false, error: error.message };

    const checkins: GatheringCheckin[] = (data || []).map(r => ({
        userId: r.user_id,
        userName: r.user_name,
        checkedInAt: r.checked_in_at,
    }));

    return {
        success: true,
        status: {
            gatheringId,
            checkins,
            allMemberCount,
            isComplete: checkins.length >= allMemberCount,
        },
    };
}

// ── 查詢用戶個人的報到紀錄（供掃碼落地頁確認）────────────────────────────
export async function getUserGatheringCheckin(
    gatheringId: string,
    userId: string
): Promise<{ checkedIn: boolean }> {
    try { await requireSelf(userId); } catch { return { checkedIn: false }; }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data } = await supabase
        .from('SquadGatheringCheckins')
        .select('id')
        .eq('gathering_id', gatheringId)
        .eq('user_id', userId)
        .maybeSingle();
    return { checkedIn: !!data };
}
