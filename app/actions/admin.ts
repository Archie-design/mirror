'use server';

import 'server-only';
import { connectDb } from '@/lib/db';
import { createClient } from '@supabase/supabase-js';
import { verifyAdminSession } from '@/app/actions/admin-auth';

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
 * 測試用：將現有玩家隨機分配到大隊 / 小隊，並自動設定隊長與 TeamSettings。
 * 每支小隊 SQUAD_SIZE 人，每個大隊 SQUADS_PER_BATTALION 支小隊。
 * 可重複執行（覆蓋舊值）。
 */
export async function autoAssignSquadsForTesting(
    squadSize = 4,
    squadsPerBattalion = 3
) {
    if (!(await verifyAdminSession())) return { success: false, error: '無權限執行此操作' };

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
            const battalionName = `第${ZH_NUMS[battalionIdx] ?? battalionIdx + 1}大隊`;
            const squadName = `${battalionName}-小隊${ZH_NUMS[squadInBattalion - 1] ?? squadInBattalion}`;
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
    if (!(await verifyAdminSession())) return { success: false, error: '無權限執行此操作' };

    // Parse all rows first, then batch-insert with UNNEST (avoids N+1 per-row queries)
    const emails: string[] = [];
    const names: (string | null)[] = [];
    const birthdays: (string | null)[] = [];
    const squadNames: (string | null)[] = [];
    const teamNames: (string | null)[] = [];
    const isCaptains: boolean[] = [];
    const isCommandants: boolean[] = [];

    for (const row of csvContent.split('\n')) {
        const cols = row.split(',').map(c => c.trim());
        // Expecting: email, name, birthday, squad_name(大隊), team_name(小隊), is_captain, is_commandant
        const email = cols[0]?.toLowerCase();
        if (!email || !email.includes('@')) continue;
        emails.push(email);
        names.push(cols[1] || null);
        birthdays.push(cols[2] && /^\d{4}-\d{2}-\d{2}$/.test(cols[2]) ? cols[2] : null);
        squadNames.push(cols[3] || null);
        teamNames.push(cols[4] || null);
        isCaptains.push(String(cols[5]).toLowerCase() === 'true');
        isCommandants.push(String(cols[6]).toLowerCase() === 'true');
    }

    if (emails.length === 0) return { success: false, error: '未找到有效資料行' };

    const client = await connectDb();
    try {
        await client.query('BEGIN');

        // Batch upsert Rosters（2 queries total, regardless of row count）
        await client.query(`
            INSERT INTO "Rosters" (email, name, birthday, squad_name, team_name, is_captain, is_commandant)
            SELECT UNNEST($1::text[]), UNNEST($2::text[]), UNNEST($3::text[]),
                   UNNEST($4::text[]), UNNEST($5::text[]), UNNEST($6::boolean[]), UNNEST($7::boolean[])
            ON CONFLICT (email) DO UPDATE SET
                name         = EXCLUDED.name,
                birthday     = EXCLUDED.birthday,
                squad_name   = EXCLUDED.squad_name,
                team_name    = EXCLUDED.team_name,
                is_captain   = EXCLUDED.is_captain,
                is_commandant = EXCLUDED.is_commandant
        `, [emails, names, birthdays, squadNames, teamNames, isCaptains, isCommandants]);

        // Batch sync CharacterStats for already-registered members
        await client.query(`
            UPDATE "CharacterStats" AS cs
            SET "SquadName"    = v.squad_name,
                "TeamName"     = v.team_name,
                "IsCaptain"    = v.is_captain,
                "IsCommandant" = v.is_commandant,
                "Birthday"     = COALESCE(v.birthday, cs."Birthday")
            FROM UNNEST($1::text[], $2::text[], $3::text[], $4::boolean[], $5::boolean[], $6::text[])
              AS v(email, squad_name, team_name, is_captain, is_commandant, birthday)
            WHERE cs."Email" = v.email
        `, [emails, squadNames, teamNames, isCaptains, isCommandants, birthdays]);

        await client.query('COMMIT');
        await logAdminAction('roster_import', 'admin', undefined, undefined, { count: emails.length });
        return { success: true, count: emails.length };
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
    if (!(await verifyAdminSession())) return { success: false, error: '無權限執行此操作', members: [] };

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
    if (!(await verifyAdminSession())) return { success: false, error: '無權限執行此操作' };

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

// ── 成員管理：從名單中移除成員 ───────────────────────────────
// 用於開營一週內無條件退出：刪除學員的所有相關資料（CharacterStats、申請、報到、繳費、九宮格、Rosters 名冊等）
// DailyLogs 透過 ON DELETE CASCADE 自動清除
export async function deleteMember(
    targetUserId: string,
    actorName: string = 'admin'
) {
    if (!(await verifyAdminSession())) return { success: false, error: '無權限執行此操作' };

    const supabase = createClient(_supabaseUrl, _supabaseKey);
    const { data: before } = await supabase
        .from('CharacterStats')
        .select('Name, Email, SquadName, TeamName, IsCaptain, IsCommandant')
        .eq('UserID', targetUserId)
        .single();
    if (!before) return { success: false, error: '找不到此成員' };

    const client = await connectDb();
    try {
        await client.query('BEGIN');

        // 依序刪除所有引用此 UserID 的業務資料
        await client.query(`DELETE FROM "BonusApplications"         WHERE user_id   = $1`, [targetUserId]);
        await client.query(`DELETE FROM "CourseRegistrations"       WHERE user_id   = $1`, [targetUserId]);
        await client.query(`DELETE FROM "CourseAttendance"          WHERE user_id   = $1`, [targetUserId]);
        await client.query(`DELETE FROM "SquadGatheringCheckins"    WHERE user_id   = $1`, [targetUserId]);
        await client.query(`DELETE FROM "SquadGatheringAttendances" WHERE user_id   = $1`, [targetUserId]);
        await client.query(`DELETE FROM "OnlineGatheringApplications" WHERE user_id = $1`, [targetUserId]);
        await client.query(`DELETE FROM "UserNineGrid"              WHERE member_id = $1`, [targetUserId]);
        await client.query(`DELETE FROM "FinePayments"              WHERE user_id   = $1`, [targetUserId]);

        // 主角色（DailyLogs 會 CASCADE）
        await client.query(`DELETE FROM "CharacterStats" WHERE "UserID" = $1`, [targetUserId]);

        // 名冊（以 email 為主鍵；若無 email 則跳過）
        if (before.Email) {
            await client.query(`DELETE FROM "Rosters" WHERE email = $1`, [before.Email]);
        }

        await client.query('COMMIT');

        await logAdminAction('member_delete', actorName, targetUserId, before.Name, {
            squad: before.SquadName,
            team: before.TeamName,
            isCaptain: before.IsCaptain,
            isCommandant: before.IsCommandant,
            email: before.Email,
        });
        return { success: true };
    } catch (error: any) {
        await client.query('ROLLBACK');
        await logAdminAction('member_delete', actorName, targetUserId, before.Name, { error: error.message }, 'error');
        return { success: false, error: error.message };
    } finally {
        await client.end();
    }
}

// ── 成員管理：更新角色（隊長 / 大隊長）────────────────────────
export async function setMemberRole(
    targetUserId: string,
    role: 'captain' | 'commandant' | 'none',
    actorName: string = 'admin'
) {
    if (!(await verifyAdminSession())) return { success: false, error: '無權限執行此操作' };

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

// ── SystemSettings 更新（僅管理員）──────────────────────────────
// 原本 page.tsx 直接以 anon key upsert，配合收緊 RLS 後改走此 server action
export async function updateSystemSetting(key: string, value: string, actorName: string = 'admin') {
    if (!(await verifyAdminSession())) return { success: false, error: '無權限執行此操作' };
    if (!key || typeof key !== 'string') return { success: false, error: '設定名稱無效' };

    const supabase = createClient(_supabaseUrl, _supabaseKey);
    const { error } = await supabase
        .from('SystemSettings')
        .upsert({ SettingName: key, Value: value }, { onConflict: 'SettingName' });
    if (error) return { success: false, error: error.message };

    await logAdminAction('system_setting_update', actorName, key, undefined, {
        valuePreview: value.length > 80 ? value.slice(0, 80) + '…' : value,
    });
    return { success: true };
}

// ── 臨時加碼任務 CRUD（僅管理員）────────────────────────────────
export async function addTempQuest(
    title: string,
    sub: string,
    desc: string,
    reward: number,
    actorName: string = 'admin',
) {
    if (!(await verifyAdminSession())) return { success: false, error: '無權限執行此操作' };
    const trimmedTitle = (title || '').trim();
    if (!trimmedTitle) return { success: false, error: '標題不可為空' };
    if (!Number.isFinite(reward)) return { success: false, error: '分數無效' };

    const id = `temp_${Date.now()}`;
    const supabase = createClient(_supabaseUrl, _supabaseKey);
    const { error } = await supabase.from('temporaryquests').insert([{
        id, title: trimmedTitle, sub: sub?.trim() || '', desc: desc?.trim() || '',
        reward, limit_count: 1, active: true,
    }]);
    if (error) return { success: false, error: error.message };

    await logAdminAction('temp_quest_add', actorName, id, trimmedTitle, { reward });
    return { success: true, id };
}

export async function toggleTempQuest(id: string, active: boolean, actorName: string = 'admin') {
    if (!(await verifyAdminSession())) return { success: false, error: '無權限執行此操作' };
    if (!id) return { success: false, error: '任務 ID 無效' };

    const supabase = createClient(_supabaseUrl, _supabaseKey);
    const { error } = await supabase.from('temporaryquests').update({ active }).eq('id', id);
    if (error) return { success: false, error: error.message };

    await logAdminAction('temp_quest_toggle', actorName, id, undefined, { active });
    return { success: true };
}

export async function deleteTempQuest(id: string, actorName: string = 'admin') {
    if (!(await verifyAdminSession())) return { success: false, error: '無權限執行此操作' };
    if (!id) return { success: false, error: '任務 ID 無效' };

    const supabase = createClient(_supabaseUrl, _supabaseKey);
    const { error } = await supabase.from('temporaryquests').delete().eq('id', id);
    if (error) return { success: false, error: error.message };

    await logAdminAction('temp_quest_delete', actorName, id);
    return { success: true };
}
