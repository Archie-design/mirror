import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { getLogicalDateStr } from '@/lib/utils/time';

// 這個檔案**不是** 'use server'：不會被 Next.js 曝露為 server action，
// 因此可以放「不做 requireSelf 的內部入帳函式」供其他 server action（例如
// bonus.ts 的審核流程）呼叫。client 無法直接透過 RPC 觸發這裡的程式。

function getServiceClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

export async function processCheckInCore(
    userId: string,
    questId: string,
    questTitle: string,
    questReward: number
): Promise<{ success: boolean; error?: string; rewardCapped?: boolean; user?: unknown }> {
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

    const result = data as { success: boolean; error?: string; rewardCapped?: boolean; user?: unknown };
    if (!result.success) return { success: false, error: result.error };

    return { success: true, rewardCapped: result.rewardCapped ?? false, user: result.user };
}
