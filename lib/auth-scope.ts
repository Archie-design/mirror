import type { SupabaseClient } from '@supabase/supabase-js';

// 取得 commandant 所屬大隊範圍：本大隊名稱 + 本大隊內所有小隊名稱
// 用於後台 action 限制大隊長僅能看見/操作本大隊資料。
// 回傳 null 表示呼叫者不是大隊長或缺少 SquadName。
export async function getCommandantTeamNames(
    supabase: SupabaseClient,
    commandantUserId: string,
): Promise<{ squadName: string; teamNames: string[] } | null> {
    const { data: caller } = await supabase
        .from('CharacterStats')
        .select('IsCommandant, SquadName')
        .eq('UserID', commandantUserId)
        .maybeSingle();
    if (!caller?.IsCommandant || !caller.SquadName) return null;

    const { data: teams } = await supabase
        .from('CharacterStats')
        .select('TeamName')
        .eq('SquadName', caller.SquadName)
        .not('TeamName', 'is', null);

    const teamNames = Array.from(
        new Set((teams ?? []).map(t => t.TeamName).filter(Boolean) as string[])
    );
    return { squadName: caller.SquadName, teamNames };
}
