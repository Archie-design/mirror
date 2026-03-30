'use server';

import { createClient } from '@supabase/supabase-js';
import { getLogicalDateStr } from '@/lib/utils/time';
import { calculateLevelFromExp, FLEX_QUEST_IDS } from '@/lib/constants';

// Server-side Supabase client（使用 service role，繞過 RLS）
function getServiceClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

export async function processCheckInTransaction(
    userId: string,
    questId: string,
    questTitle: string,
    questReward: number
) {
    const supabase = getServiceClient();
    const logicalTodayStr = getLogicalDateStr();

    // 在 TypeScript 端預算新等級（傳入 SQL function，一次完成所有更新）
    const { data: statsRow } = await supabase
        .from('CharacterStats')
        .select('Exp')
        .eq('UserID', userId)
        .single();

    const currentExp = parseInt(String(statsRow?.Exp ?? 0), 10);
    const newLevel = calculateLevelFromExp(currentExp + questReward);

    const { data, error } = await supabase.rpc('process_checkin', {
        p_user_id:        userId,
        p_quest_id:       questId,
        p_quest_title:    questTitle,
        p_quest_reward:   questReward,
        p_new_level:      newLevel,
        p_flex_quest_ids: Array.from(FLEX_QUEST_IDS),
        p_logical_today:  logicalTodayStr,
    });

    if (error) {
        return { success: false, error: error.message };
    }

    const result = data as { success: boolean; error?: string; rewardCapped?: boolean; user?: any };

    if (!result.success) {
        return { success: false, error: result.error };
    }

    return { success: true, rewardCapped: result.rewardCapped ?? false, user: result.user };
}

export async function clearTodayLogs(userId: string) {
    const supabase = getServiceClient();
    const logicalTodayStr = getLogicalDateStr();

    const { data, error } = await supabase.rpc('clear_today_logs', {
        p_user_id:       userId,
        p_logical_today: logicalTodayStr,
    });

    if (error) {
        return { success: false, error: error.message };
    }

    return { success: true };
}
