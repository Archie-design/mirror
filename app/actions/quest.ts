'use server';

import 'server-only';
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

export async function undoCheckIn(userId: string, questId: string): Promise<{
    success: boolean;
    error?: string;
    rewardDeducted?: number;
    newScore?: number;
}> {
    const supabase = getServiceClient();
    const logicalTodayStr = getLogicalDateStr();

    const { data: targetLogs, error: fetchError } = await supabase
        .from('DailyLogs')
        .select('*')
        .eq('UserID', userId)
        .eq('QuestID', questId)
        .order('Timestamp', { ascending: false })
        .limit(1);

    if (fetchError || !targetLogs || targetLogs.length === 0)
        return { success: false, error: '找不到打卡記錄' };

    const log = targetLogs[0];
    if (getLogicalDateStr(log.Timestamp) !== logicalTodayStr)
        return { success: false, error: '因果已定，僅限回溯今日紀錄' };

    const rewardToDeduct: number = log.RewardPoints ?? 0;

    const { error: deleteError } = await supabase
        .from('DailyLogs').delete().eq('id', log.id);
    if (deleteError) return { success: false, error: deleteError.message };

    const { data: user, error: userError } = await supabase
        .from('CharacterStats').select('Score').eq('UserID', userId).single();
    if (userError || !user) return { success: false, error: '找不到用戶資料' };

    const newScore = Math.max(0, (user.Score ?? 0) - rewardToDeduct);
    const { error: updateError } = await supabase
        .from('CharacterStats').update({ Score: newScore }).eq('UserID', userId);
    if (updateError) return { success: false, error: updateError.message };

    return { success: true, rewardDeducted: rewardToDeduct, newScore };
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
