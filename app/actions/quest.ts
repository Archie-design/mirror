'use server';

import { createClient } from '@supabase/supabase-js';
import { getLogicalDateStr } from '@/lib/utils/time';

function getServiceClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

// 通用打卡入帳：呼叫 process_checkin RPC（含每日上限檢查）
// quest logic 已移至 SQL 函式（參見 202604160001_new_quest_system.sql）
export async function processCheckInTransaction(
    userId: string,
    questId: string,
    questTitle: string,
    questReward: number
) {
    const supabase = getServiceClient();
    const logicalTodayStr = getLogicalDateStr();

    const { data, error } = await supabase.rpc('process_checkin', {
        p_user_id:       userId,
        p_quest_id:      questId,
        p_quest_title:   questTitle,
        p_quest_reward:  questReward,
        p_logical_today: logicalTodayStr,
    });

    if (error) return { success: false, error: error.message };

    const result = data as { success: boolean; error?: string; rewardCapped?: boolean; user?: any };
    if (!result.success) return { success: false, error: result.error };

    return { success: true, rewardCapped: result.rewardCapped ?? false, user: result.user };
}

export async function clearTodayLogs(userId: string) {
    const supabase = getServiceClient();
    const logicalTodayStr = getLogicalDateStr();

    const { data, error } = await supabase.rpc('clear_today_logs', {
        p_user_id:       userId,
        p_logical_today: logicalTodayStr,
    });

    if (error) return { success: false, error: error.message };
    return { success: true };
}
