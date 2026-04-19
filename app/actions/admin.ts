'use server';

import 'server-only';
import { connectDb } from '@/lib/db';
import { createClient } from '@supabase/supabase-js';

const _supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const _supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// ── 通用管理操作 Log ──────────────────────────────────────
export async function logAdminAction(
    action: string,
    actor: string,
    targetId?: string,
    targetName?: string,
    details?: Record<string, any>,
    result: 'success' | 'error' = 'success'
) {
    try {
        const supabase = createClient(_supabaseUrl, _supabaseKey);
        await supabase.from('AdminActivityLog').insert({
            action, actor, target_id: targetId, target_name: targetName, details, result,
        });
    } catch (_) { /* log failure should never break the main flow */ }
}


const ZH_NUMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十',
    '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十'];

/**
 * 測試用：將現有玩家隨機分配到發行商 / 劇組，並自動設定隊長與 TeamSettings。
 * 每支劇組 SQUAD_SIZE 人，每個發行商 SQUADS_PER_BATTALION 支劇組。
 * 可重複執行（覆蓋舊值）。
 */
export async function autoAssignSquadsForTesting(
    squadSize = 4,
    squadsPerBattalion = 3
) {
    
    const client = await connectDb();
    try {
        await client.query('BEGIN');

        // 1. 取得所有玩家並隨機排列
        const { rows: allUsers } = await client.query<{ UserID: string; Name: string }>(
            `SELECT "UserID", "Name" FROM "CharacterStats" ORDER BY "UserID"`
        );
        if (allUsers.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: '資料庫中尚無玩家' };
        }

        // Fisher-Yates shuffle
        for (let i = allUsers.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allUsers[i], allUsers[j]] = [allUsers[j], allUsers[i]];
        }

        // 2. 分組
        const squads: { battalionName: string; squadName: string; members: typeof allUsers }[] = [];
        for (let i = 0; i < allUsers.length; i += squadSize) {
            const squadIdx = squads.length;
            const battalionIdx = Math.floor(squadIdx / squadsPerBattalion);
            const squadInBattalion = (squadIdx % squadsPerBattalion) + 1;
            const battalionName = `第${ZH_NUMS[battalionIdx] ?? battalionIdx + 1}發行商`;
            const squadName = `${battalionName}-劇組${ZH_NUMS[squadInBattalion - 1] ?? squadInBattalion}`;
            squads.push({ battalionName, squadName, members: allUsers.slice(i, i + squadSize) });
        }

        // 3. 更新 CharacterStats + upsert TeamSettings（批次操作避免 N+1）
        const userIds: string[] = [];
        const squadNames: string[] = [];
        const teamNames: string[] = [];
        const isCaptainFlags: boolean[] = [];
        const distinctTeamNames: string[] = [];

        for (const squad of squads) {
            distinctTeamNames.push(squad.squadName);
            for (let mi = 0; mi < squad.members.length; mi++) {
                userIds.push(squad.members[mi].UserID);
                squadNames.push(squad.battalionName);
                teamNames.push(squad.squadName);
                isCaptainFlags.push(mi === 0);
            }
        }

        await client.query(
            `UPDATE "CharacterStats" AS cs
             SET "SquadName" = v.squad_name,
                 "TeamName"  = v.team_name,
                 "IsCaptain" = v.is_captain
             FROM UNNEST($1::text[], $2::text[], $3::text[], $4::boolean[])
               AS v(user_id, squad_name, team_name, is_captain)
             WHERE cs."UserID" = v.user_id`,
            [userIds, squadNames, teamNames, isCaptainFlags]
        );

        await client.query(
            `INSERT INTO "TeamSettings" (team_name, team_coins)
             SELECT UNNEST($1::text[]), 0
             ON CONFLICT (team_name) DO NOTHING`,
            [distinctTeamNames]
        );

        await client.query('COMMIT');

        await logAdminAction('auto_assign_squads', 'admin', undefined, undefined, {
            totalPlayers: allUsers.length,
            squadCount: squads.length,
            battalionCount: Math.ceil(squads.length / squadsPerBattalion),
        });
        return {
            success: true,
            totalPlayers: allUsers.length,
            squadCount: squads.length,
            battalionCount: Math.ceil(squads.length / squadsPerBattalion),
            summary: squads.map(s => ({
                squad: s.squadName,
                members: s.members.map((m, i) => `${m.Name}${i === 0 ? '（隊長）' : ''}`)
            })),
        };
    } catch (error: any) {
        await client.query('ROLLBACK');
        await logAdminAction('auto_assign_squads', 'admin', undefined, undefined, { error: error.message }, 'error');
        return { success: false, error: error.message };
    } finally {
        await client.end();
    }
}

export async function importRostersData(csvContent: string) {
    
    const client = await connectDb();

    try {
        await client.query('BEGIN');

        const rows = csvContent.split('\n');
        let count = 0;

        for (const row of rows) {
            const cols = row.split(',').map(c => c.trim());
            // Expecting: email, name, birthday, squad_name(發行商), team_name(劇組), is_captain, is_commandant
            const email = cols[0]?.toLowerCase();
            if (!email || !email.includes('@')) continue;

            const name = cols[1] || null;
            const birthday = cols[2] && /^\d{4}-\d{2}-\d{2}$/.test(cols[2]) ? cols[2] : null;
            const squad_name = cols[3] || null;
            const team_name = cols[4] || null;
            const is_captain = String(cols[5]).toLowerCase() === 'true';
            const is_commandant = String(cols[6]).toLowerCase() === 'true';

            await client.query(`
                INSERT INTO "Rosters" (email, name, birthday, squad_name, team_name, is_captain, is_commandant)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (email)
                DO UPDATE SET
                    name = EXCLUDED.name,
                    birthday = EXCLUDED.birthday,
                    squad_name = EXCLUDED.squad_name,
                    team_name = EXCLUDED.team_name,
                    is_captain = EXCLUDED.is_captain,
                    is_commandant = EXCLUDED.is_commandant
            `, [email, name, birthday, squad_name, team_name, is_captain, is_commandant]);

            // If they already created a CharacterStat, automatically sync all fields
            await client.query(`
                UPDATE "CharacterStats"
                SET "SquadName" = $2, "TeamName" = $3, "IsCaptain" = $4, "IsCommandant" = $5,
                    "Birthday" = COALESCE($6, "Birthday")
                WHERE "Email" = $1
            `, [email, squad_name, team_name, is_captain, is_commandant, birthday]);

            count++;
        }

        await client.query('COMMIT');
        await logAdminAction('roster_import', 'admin', undefined, undefined, { count });
        return { success: true, count };
    } catch (error: any) {
        await client.query('ROLLBACK');
        await logAdminAction('roster_import', 'admin', undefined, undefined, { error: error.message }, 'error');
        return { success: false, error: error.message };
    } finally {
        await client.end();
    }
}


// ── 成員管理：列出全部成員 ────────────────────────────────
export async function listAllMembers() {
    const supabase = createClient(_supabaseUrl, _supabaseKey);
    const { data, error } = await supabase
        .from('CharacterStats')
        .select('UserID, Name, Email, SquadName, TeamName, IsCaptain, IsCommandant, Score, Streak')
        .order('Name');
    if (error) return { success: false, error: error.message, members: [] };
    return { success: true, members: data || [] };
}

// ── 成員管理：轉隊（更換 SquadName / TeamName）──────────────
export async function transferMember(
    targetUserId: string,
    newSquadName: string | null,
    newTeamName: string | null,
    actorName: string = 'admin'
) {
    const supabase = createClient(_supabaseUrl, _supabaseKey);
    const { data: before } = await supabase.from('CharacterStats').select('Name, SquadName, TeamName').eq('UserID', targetUserId).single();
    if (!before) return { success: false, error: '找不到此成員' };

    const { error } = await supabase
        .from('CharacterStats')
        .update({ SquadName: newSquadName, TeamName: newTeamName })
        .eq('UserID', targetUserId);
    if (error) return { success: false, error: error.message };

    await logAdminAction('member_transfer', actorName, targetUserId, before.Name, {
        from: { squad: before.SquadName, team: before.TeamName },
        to: { squad: newSquadName, team: newTeamName },
    });
    return { success: true };
}

// ── 成員管理：更新角色（隊長 / 大隊長）────────────────────────
export async function setMemberRole(
    targetUserId: string,
    role: 'captain' | 'commandant' | 'none',
    actorName: string = 'admin'
) {
    const supabase = createClient(_supabaseUrl, _supabaseKey);
    const { data: member } = await supabase.from('CharacterStats').select('Name').eq('UserID', targetUserId).single();
    if (!member) return { success: false, error: '找不到此成員' };

    const { error } = await supabase
        .from('CharacterStats')
        .update({
            IsCaptain: role === 'captain',
            IsCommandant: role === 'commandant',
        })
        .eq('UserID', targetUserId);
    if (error) return { success: false, error: error.message };

    await logAdminAction('set_member_role', actorName, targetUserId, member.Name, { role });
    return { success: true };
}
