'use server';

import 'server-only';
import { revalidateTag } from 'next/cache';
import { connectDb } from '@/lib/db';
import { createClient } from '@supabase/supabase-js';
import { verifyAdminSession } from '@/app/actions/admin-auth';
import { standardizePhone } from '@/lib/utils/phone';
import { requireUser } from '@/lib/auth';
import { formatCsvRows } from '@/lib/utils/csv';
import { BOOTSTRAP_CACHE_TAG } from '@/app/actions/bootstrap';

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
    } catch (error) {
        await client.query('ROLLBACK');
        const msg = error instanceof Error ? error.message : String(error);
        await logAdminAction('auto_assign_squads', 'admin', undefined, undefined, { error: msg }, 'error');
        return { success: false, error: msg };
    } finally {
        await client.end();
    }
}

export async function importRostersData(csvContent: string) {
    try {
        if (!(await verifyAdminSession())) return { success: false, error: '無權限執行此操作' };

        const phones: string[] = [];
        const names: (string | null)[] = [];
        const birthdays: (string | null)[] = [];
        const squadNames: (string | null)[] = [];
        const teamNames: (string | null)[] = [];
        const isCaptains: boolean[] = [];
        const isCommandants: boolean[] = [];

        for (const row of csvContent.split('\n')) {
            const cols = row.split(',').map(c => c.trim());
            // Expecting: phone, name, birthday, squad_name(大隊), team_name(小隊), is_captain, is_commandant
            const phoneRaw = cols[0];
            if (!phoneRaw) continue;
            const phone = standardizePhone(phoneRaw);
            if (phone.length !== 9) continue; // 略過表頭與不合法列
            phones.push(phone);
            names.push(cols[1] || null);
            birthdays.push(cols[2] && /^\d{4}-\d{2}-\d{2}$/.test(cols[2]) ? cols[2] : null);
            squadNames.push(cols[3] || null);
            teamNames.push(cols[4] || null);
            isCaptains.push(String(cols[5]).toLowerCase() === 'true');
            isCommandants.push(String(cols[6]).toLowerCase() === 'true');
        }

        if (phones.length === 0) return { success: false, error: '未找到有效資料行' };

        const client = await connectDb();
        try {
            await client.query('BEGIN');

            // Batch upsert Rosters
            await client.query(`
                INSERT INTO "Rosters" (phone, name, birthday, squad_name, team_name, is_captain, is_commandant)
                SELECT UNNEST($1::text[]), UNNEST($2::text[]), UNNEST($3::text[]),
                       UNNEST($4::text[]), UNNEST($5::text[]), UNNEST($6::boolean[]), UNNEST($7::boolean[])
                ON CONFLICT (phone) DO UPDATE SET
                    name          = EXCLUDED.name,
                    birthday      = EXCLUDED.birthday,
                    squad_name    = EXCLUDED.squad_name,
                    team_name     = EXCLUDED.team_name,
                    is_captain    = EXCLUDED.is_captain,
                    is_commandant = EXCLUDED.is_commandant
            `, [phones, names, birthdays, squadNames, teamNames, isCaptains, isCommandants]);

            // Batch sync CharacterStats（UserID 即標準化後 phone）
            await client.query(`
                UPDATE "CharacterStats" AS cs
                SET "SquadName"    = v.squad_name,
                    "TeamName"     = v.team_name,
                    "IsCaptain"    = v.is_captain,
                    "IsCommandant" = v.is_commandant,
                    "Birthday"     = COALESCE(v.birthday, cs."Birthday")
                FROM UNNEST($1::text[], $2::text[], $3::text[], $4::boolean[], $5::boolean[], $6::text[])
                  AS v(phone, squad_name, team_name, is_captain, is_commandant, birthday)
                WHERE cs."UserID" = v.phone
            `, [phones, squadNames, teamNames, isCaptains, isCommandants, birthdays]);

            await client.query('COMMIT');
            await logAdminAction('roster_import', 'admin', undefined, undefined, { count: phones.length });
            return { success: true, count: phones.length };
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            const msg = error instanceof Error ? error.message : String(error);
            await logAdminAction('roster_import', 'admin', undefined, undefined, { error: msg }, 'error');
            return { success: false, error: msg };
        } finally {
            await client.end().catch(() => {});
        }
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { success: false, error: msg };
    }
}


// ── 成員管理：列出全部成員 ────────────────────────────────
export async function listAllMembers() {
    if (!(await verifyAdminSession())) return { success: false, error: '無權限執行此操作', members: [] };

    const supabase = createClient(_supabaseUrl, _supabaseKey);
    const { data, error } = await supabase
        .from('CharacterStats')
        .select('UserID, Name, Email, SquadName, TeamName, IsCaptain, IsCommandant, IsAdmin, LineUserId, Score, Streak')
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

        // 名冊（phone 為主鍵 = UserID）
        await client.query(`DELETE FROM "Rosters" WHERE phone = $1`, [targetUserId]);

        await client.query('COMMIT');

        await logAdminAction('member_delete', actorName, targetUserId, before.Name, {
            squad: before.SquadName,
            team: before.TeamName,
            isCaptain: before.IsCaptain,
            isCommandant: before.IsCommandant,
            email: before.Email,
        });
        return { success: true };
    } catch (error) {
        await client.query('ROLLBACK');
        const msg = error instanceof Error ? error.message : String(error);
        await logAdminAction('member_delete', actorName, targetUserId, before.Name, { error: msg }, 'error');
        return { success: false, error: msg };
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

// ── 管理員身份授予/撤銷 ────────────────────────────────────────
export async function setMemberAdminStatus(
    targetUserId: string,
    isAdmin: boolean
): Promise<{ success: boolean; error?: string }> {
    if (!(await verifyAdminSession())) return { success: false, error: '無權限執行此操作' };

    const supabase = createClient(_supabaseUrl, _supabaseKey);
    const { data: member } = await supabase
        .from('CharacterStats')
        .select('Name, LineUserId')
        .eq('UserID', targetUserId)
        .maybeSingle();
    if (!member) return { success: false, error: '找不到此成員' };

    if (isAdmin && !member.LineUserId) {
        return { success: false, error: '此成員尚未綁定 LINE 帳號，無法設為管理員' };
    }

    const { error } = await supabase
        .from('CharacterStats')
        .update({ IsAdmin: isAdmin })
        .eq('UserID', targetUserId);
    if (error) return { success: false, error: error.message };

    await logAdminAction('set_member_admin', 'admin', targetUserId, member.Name as string, { isAdmin });
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

    revalidateTag(BOOTSTRAP_CACHE_TAG, 'default');
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

    revalidateTag(BOOTSTRAP_CACHE_TAG, 'default');
    await logAdminAction('temp_quest_add', actorName, id, trimmedTitle, { reward });
    return { success: true, id };
}

export async function toggleTempQuest(id: string, active: boolean, actorName: string = 'admin') {
    if (!(await verifyAdminSession())) return { success: false, error: '無權限執行此操作' };
    if (!id) return { success: false, error: '任務 ID 無效' };

    const supabase = createClient(_supabaseUrl, _supabaseKey);
    const { error } = await supabase.from('temporaryquests').update({ active }).eq('id', id);
    if (error) return { success: false, error: error.message };

    revalidateTag(BOOTSTRAP_CACHE_TAG, 'default');
    await logAdminAction('temp_quest_toggle', actorName, id, undefined, { active });
    return { success: true };
}

export async function deleteTempQuest(id: string, actorName: string = 'admin') {
    if (!(await verifyAdminSession())) return { success: false, error: '無權限執行此操作' };
    if (!id) return { success: false, error: '任務 ID 無效' };

    const supabase = createClient(_supabaseUrl, _supabaseKey);
    const { error } = await supabase.from('temporaryquests').delete().eq('id', id);
    if (error) return { success: false, error: error.message };

    revalidateTag(BOOTSTRAP_CACHE_TAG, 'default');
    await logAdminAction('temp_quest_delete', actorName, id);
    return { success: true };
}

// ── F1 手動積分調整 ──────────────────────────────────────────────────────────
export async function adjustMemberScore(
    targetUserId: string,
    targetName: string,
    delta: number,
    reason: string,
    actorName: string = 'admin'
): Promise<{ success: boolean; newScore?: number; error?: string }> {
    if (!(await verifyAdminSession())) return { success: false, error: '無權限執行此操作' };
    if (delta === 0 || !Number.isFinite(delta)) return { success: false, error: '調整分數不可為 0' };
    if (Math.abs(delta) > 2000) return { success: false, error: '單次調整上限 2000 分' };
    if (!reason.trim()) return { success: false, error: '請填寫調整原因' };

    const supabase = createClient(_supabaseUrl, _supabaseKey);

    const { data: cur, error: fetchErr } = await supabase
        .from('CharacterStats')
        .select('Score')
        .eq('UserID', targetUserId)
        .single();
    if (fetchErr || !cur) return { success: false, error: fetchErr?.message ?? '找不到成員' };

    const newScore = Math.max(0, ((cur as { Score: number }).Score ?? 0) + delta);
    const { error: upErr } = await supabase
        .from('CharacterStats')
        .update({ Score: newScore })
        .eq('UserID', targetUserId);
    if (upErr) return { success: false, error: upErr.message };

    await supabase.from('DailyLogs').insert({
        Timestamp: new Date().toISOString(),
        UserID: targetUserId,
        QuestID: 'admin_adjust',
        QuestTitle: reason.trim(),
        RewardPoints: delta,
    });

    await logAdminAction('score_adjust', actorName, targetUserId, targetName, { delta, reason: reason.trim() });
    return { success: true, newScore };
}

// ── F2 打卡紀錄查詢 ──────────────────────────────────────────────────────────
export async function getMemberCheckInHistory(
    targetUserId: string,
    limit: number = 30
): Promise<{ success: boolean; logs?: { id: string; Timestamp: string; QuestID: string; QuestTitle: string; RewardPoints: number }[]; error?: string }> {
    if (!(await verifyAdminSession())) return { success: false, error: '無權限執行此操作' };

    const supabase = createClient(_supabaseUrl, _supabaseKey);
    const { data, error } = await supabase
        .from('DailyLogs')
        .select('id, Timestamp, QuestID, QuestTitle, RewardPoints')
        .eq('UserID', targetUserId)
        .order('Timestamp', { ascending: false })
        .limit(limit);

    if (error) return { success: false, error: error.message };
    return { success: true, logs: (data ?? []) as { id: string; Timestamp: string; QuestID: string; QuestTitle: string; RewardPoints: number }[] };
}

// ── F2 打卡紀錄刪除 ──────────────────────────────────────────────────────────
export async function deleteCheckInRecord(
    logId: string,
    targetUserId: string,
    actorName: string = 'admin'
): Promise<{ success: boolean; reversedPoints?: number; error?: string }> {
    if (!(await verifyAdminSession())) return { success: false, error: '無權限執行此操作' };

    const supabase = createClient(_supabaseUrl, _supabaseKey);

    const { data: log, error: fetchErr } = await supabase
        .from('DailyLogs')
        .select('id, QuestID, QuestTitle, RewardPoints, UserID')
        .eq('id', logId)
        .eq('UserID', targetUserId)
        .single();

    if (fetchErr || !log) return { success: false, error: '找不到指定紀錄' };

    type LogRow = { id: string; QuestID: string; QuestTitle: string; RewardPoints: number; UserID: string };
    const row = log as LogRow;

    if (row.QuestID.startsWith('nine_grid_cell|')) {
        return { success: false, error: '九宮格格子請透過「隊長回溯」功能處理' };
    }

    const { error: delErr } = await supabase.from('DailyLogs').delete().eq('id', logId);
    if (delErr) return { success: false, error: delErr.message };

    if (row.RewardPoints !== 0) {
        const { data: cur } = await supabase
            .from('CharacterStats')
            .select('Score')
            .eq('UserID', targetUserId)
            .single();
        const newScore = Math.max(0, ((cur as { Score: number } | null)?.Score ?? 0) - row.RewardPoints);
        await supabase.from('CharacterStats').update({ Score: newScore }).eq('UserID', targetUserId);
    }

    await logAdminAction('delete_checkin', actorName, targetUserId, row.QuestTitle, { questId: row.QuestID, points: row.RewardPoints });
    return { success: true, reversedPoints: row.RewardPoints };
}

// ── F3 成員活躍度統計 ────────────────────────────────────────────────────────
export async function getMemberActivityStats(): Promise<{
    success: boolean;
    noCheckinThisWeek: { userId: string; userName: string; teamName: string | null; squadName: string | null; lastCheckIn: string | null }[];
    totalActive: number;
    totalMembers: number;
    error?: string;
}> {
    if (!(await verifyAdminSession())) return { success: false, noCheckinThisWeek: [], totalActive: 0, totalMembers: 0, error: '無權限執行此操作' };

    const supabase = createClient(_supabaseUrl, _supabaseKey);

    // 本週週一 12:00 TW
    const now = new Date();
    const twDateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now);
    const [y, m, d] = twDateStr.split('-').map(n => parseInt(n, 10));
    const today = new Date(Date.UTC(y, m - 1, d));
    const weekday = today.getUTCDay() || 7;
    const monday = new Date(today);
    monday.setUTCDate(today.getUTCDate() - (weekday - 1));
    const weekStart = `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, '0')}-${String(monday.getUTCDate()).padStart(2, '0')}T12:00:00+08:00`;

    const { data: members, error: mErr } = await supabase
        .from('CharacterStats')
        .select('UserID, Name, TeamName, SquadName, LastCheckIn')
        .or('IsGM.is.null,IsGM.eq.false');
    if (mErr) return { success: false, noCheckinThisWeek: [], totalActive: 0, totalMembers: 0, error: mErr.message };

    const { data: activeLogs, error: lErr } = await supabase
        .from('DailyLogs')
        .select('UserID')
        .gte('Timestamp', weekStart);
    if (lErr) return { success: false, noCheckinThisWeek: [], totalActive: 0, totalMembers: 0, error: lErr.message };

    type MemberRow = { UserID: string; Name: string; TeamName: string | null; SquadName: string | null; LastCheckIn: string | null };
    const allMembers = (members ?? []) as MemberRow[];
    const activeSet = new Set(((activeLogs ?? []) as { UserID: string }[]).map(l => l.UserID));

    const noCheckinThisWeek = allMembers
        .filter(m => !activeSet.has(m.UserID))
        .map(m => ({ userId: m.UserID, userName: m.Name, teamName: m.TeamName, squadName: m.SquadName, lastCheckIn: m.LastCheckIn }));

    return {
        success: true,
        noCheckinThisWeek,
        totalActive: activeSet.size,
        totalMembers: allMembers.length,
    };
}

// ── F4 聚會管理 GM 總覽 ──────────────────────────────────────────────────────
export async function listAllGatheringsForAdmin(): Promise<{
    success: boolean;
    offline: Record<string, unknown>[];
    online: Record<string, unknown>[];
    error?: string;
}> {
    if (!(await verifyAdminSession())) return { success: false, offline: [], online: [], error: '無權限執行此操作' };

    const supabase = createClient(_supabaseUrl, _supabaseKey);

    // 本週週一
    const now = new Date();
    const twDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    const [y, m, d] = twDateStr.split('-').map(n => parseInt(n, 10));
    const today = new Date(Date.UTC(y, m - 1, d));
    const weekday = today.getUTCDay() || 7;
    const monday = new Date(today);
    monday.setUTCDate(today.getUTCDate() - (weekday - 1));
    const weekMondayStr = `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, '0')}-${String(monday.getUTCDate()).padStart(2, '0')}`;

    const [offlineRes, onlineRes] = await Promise.all([
        supabase
            .from('SquadGatheringSessions')
            .select('id, team_name, gathering_date, status, scheduled_by, captain_submitted_at, approved_reward_per_person, approved_member_count, approved_attendee_count, approved_has_commandant, notes, created_at')
            .order('gathering_date', { ascending: false })
            .limit(60),
        supabase
            .from('OnlineGatheringApplications')
            .select('id, user_id, user_name, team_name, week_monday, status, notes, squad_review_by, squad_review_at, squad_review_notes, created_at')
            .gte('week_monday', weekMondayStr)
            .order('created_at', { ascending: false }),
    ]);

    if (offlineRes.error) return { success: false, offline: [], online: [], error: offlineRes.error.message };
    if (onlineRes.error) return { success: false, offline: [], online: [], error: onlineRes.error.message };

    return {
        success: true,
        offline: (offlineRes.data ?? []) as Record<string, unknown>[],
        online: (onlineRes.data ?? []) as Record<string, unknown>[],
    };
}

// ── F5 一次性任務申請統計 ────────────────────────────────────────────────────
export async function getBonusApplicationStats(): Promise<{
    success: boolean;
    stats?: { quest_id: string; pending: number; squad_approved: number; approved: number; rejected: number; total: number }[];
    error?: string;
}> {
    if (!(await verifyAdminSession())) return { success: false, error: '無權限執行此操作' };

    const supabase = createClient(_supabaseUrl, _supabaseKey);
    const { data, error } = await supabase
        .from('BonusApplications')
        .select('quest_id, status');
    if (error) return { success: false, error: error.message };

    const map = new Map<string, { pending: number; squad_approved: number; approved: number; rejected: number }>();
    for (const row of (data ?? []) as { quest_id: string; status: string }[]) {
        if (!map.has(row.quest_id)) map.set(row.quest_id, { pending: 0, squad_approved: 0, approved: 0, rejected: 0 });
        const entry = map.get(row.quest_id)!;
        if (row.status === 'pending') entry.pending++;
        else if (row.status === 'squad_approved') entry.squad_approved++;
        else if (row.status === 'approved') entry.approved++;
        else if (row.status === 'rejected') entry.rejected++;
    }

    const QUEST_ORDER = ['o1', 'o2_1', 'o2_2', 'o2_3', 'o2_4', 'o3', 'o4', 'o5', 'o6', 'o7'];
    const stats = QUEST_ORDER
        .filter(q => map.has(q))
        .map(q => {
            const e = map.get(q)!;
            return { quest_id: q, ...e, total: e.pending + e.squad_approved + e.approved + e.rejected };
        });

    return { success: true, stats };
}

// ── 清除測試帳號 ──────────────────────────────────────────────────────────────

export async function listTestAccounts(): Promise<{ success: boolean; accounts?: { userId: string; name: string }[]; error?: string }> {
    if (!(await verifyAdminSession())) return { success: false, error: '無權限執行此操作' };

    const supabase = createClient(_supabaseUrl, _supabaseKey);
    const { data, error } = await supabase
        .from('CharacterStats')
        .select('UserID, Name');

    if (error) return { success: false, error: error.message };

    // Filter: UserID not matching ^[0-9]{9}$
    const testAccounts = ((data ?? []) as { UserID: string; Name: string }[])
        .filter(r => !/^[0-9]{9}$/.test(r.UserID))
        .map(r => ({ userId: r.UserID, name: r.Name }));

    return { success: true, accounts: testAccounts };
}

export async function purgeTestAccounts(): Promise<{ success: boolean; count?: number; error?: string }> {
    try {
    if (!(await verifyAdminSession())) return { success: false, error: '無權限執行此操作' };

    const listRes = await listTestAccounts();
    if (!listRes.success || !listRes.accounts) return { success: false, error: listRes.error };
    if (listRes.accounts.length === 0) return { success: true, count: 0 };

    const deletedIds: string[] = [];
    const client = await connectDb();
    try {
        await client.query('BEGIN');
        for (const { userId } of listRes.accounts) {
            await client.query(`DELETE FROM "BonusApplications"           WHERE user_id   = $1`, [userId]);
            await client.query(`DELETE FROM "CourseRegistrations"         WHERE user_id   = $1`, [userId]);
            await client.query(`DELETE FROM "CourseAttendance"            WHERE user_id   = $1`, [userId]);
            await client.query(`DELETE FROM "SquadGatheringCheckins"      WHERE user_id   = $1`, [userId]);
            await client.query(`DELETE FROM "SquadGatheringAttendances"   WHERE user_id   = $1`, [userId]);
            await client.query(`DELETE FROM "OnlineGatheringApplications" WHERE user_id   = $1`, [userId]);
            await client.query(`DELETE FROM "UserNineGrid"                WHERE member_id = $1`, [userId]);
            await client.query(`DELETE FROM "FinePayments"                WHERE user_id   = $1`, [userId]);
            await client.query(`DELETE FROM "CharacterStats" WHERE "UserID" = $1`, [userId]);
            await client.query(`DELETE FROM "Rosters" WHERE phone = $1`, [userId]);
            deletedIds.push(userId);
        }
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        const msg = error instanceof Error ? error.message : String(error);
        await logAdminAction('purge_test_accounts', 'admin', undefined, undefined, { error: msg, deletedSoFar: deletedIds }, 'error');
        return { success: false, error: msg };
    } finally {
        await client.end();
    }

    await logAdminAction('purge_test_accounts', 'admin', undefined, undefined, { deletedIds, count: deletedIds.length });
    return { success: true, count: deletedIds.length };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return { success: false, error: msg };
    }
}

// ── F6 匯出成員積分 CSV ──────────────────────────────────────────────────────
export async function exportMemberScoresCsv(): Promise<{ success: boolean; csv?: string; error?: string }> {
    if (!(await verifyAdminSession())) return { success: false, error: '無權限執行此操作' };

    const supabase = createClient(_supabaseUrl, _supabaseKey);
    const { data, error } = await supabase
        .from('CharacterStats')
        .select('Name, SquadName, TeamName, Score, Streak, LastCheckIn')
        .order('Score', { ascending: false });
    if (error) return { success: false, error: error.message };

    const rows = (data ?? []) as { Name: string; SquadName: string | null; TeamName: string | null; Score: number; Streak: number; LastCheckIn: string | null }[];
    const header = '姓名,大隊,小隊,累積積分,連勤天數,最後打卡日';
    const lines = rows.map(r =>
        [r.Name, r.SquadName ?? '', r.TeamName ?? '', r.Score, r.Streak, r.LastCheckIn ? r.LastCheckIn.slice(0, 10) : ''].join(',')
    );
    const csv = '﻿' + [header, ...lines].join('\n'); // UTF-8 BOM for Excel

    return { success: true, csv };
}

// ── 匯出成員清單（含小隊摘要）────────────────────────────────────────────────
export async function exportMembersWithSummary(): Promise<{ success: boolean; csv?: string; error?: string }> {
    try {
        const supabase = createClient(_supabaseUrl, _supabaseKey);

        // D2: scope 判定
        let squadNameFilter: string | null = null; // null = 全營（admin）
        const isAdmin = await verifyAdminSession();
        if (!isAdmin) {
            let userId: string;
            try { userId = await requireUser(); } catch { return { success: false, error: '無權限' }; }
            const { data: me } = await supabase
                .from('CharacterStats')
                .select('SquadName, IsCommandant')
                .eq('UserID', userId)
                .single();
            if (!me?.IsCommandant || !me?.SquadName) return { success: false, error: '無權限' };
            squadNameFilter = me.SquadName as string;
        }

        // D3: 並行抓兩個資料源
        const membersQuery = supabase
            .from('CharacterStats')
            .select('UserID, Name, SquadName, TeamName, Score, Streak, IsCaptain, IsCommandant, LastCheckIn')
            .order('Score', { ascending: false });
        if (squadNameFilter) membersQuery.eq('SquadName', squadNameFilter);

        const [{ data: membersRaw, error: membersErr }, { data: gatheringsRaw, error: gatheringsErr }] = await Promise.all([
            membersQuery,
            supabase
                .from('SquadGatheringSessions')
                .select('team_name')
                .eq('status', 'approved'),
        ]);

        if (membersErr) return { success: false, error: '成員查詢失敗：' + membersErr.message };
        if (gatheringsErr) return { success: false, error: '凝聚查詢失敗：' + gatheringsErr.message };

        type MemberRow = { UserID: string; Name: string; SquadName: string | null; TeamName: string | null; Score: number; Streak: number; IsCaptain: boolean; IsCommandant: boolean; LastCheckIn: string | null };
        const members = (membersRaw ?? []) as MemberRow[];

        // 3.1: role label
        const roleLabel = (m: MemberRow) => m.IsCommandant ? '大隊長' : m.IsCaptain ? '小隊長' : '一般';
        // 3.2: 大隊長「小隊」欄填「（大隊長）」
        const squadLabel = (m: MemberRow) => m.IsCommandant ? '（大隊長）' : (m.TeamName ?? '');

        // 成員區
        const memberHeader = ['UserID', '姓名', '大隊', '小隊', '角色', '累積積分', '連勤天數', '最後打卡日'];
        const memberRows = members.map(m => [
            m.UserID,
            m.Name,
            m.SquadName ?? '',
            squadLabel(m),
            roleLabel(m),
            m.Score,
            m.Streak,
            m.LastCheckIn ? m.LastCheckIn.slice(0, 10) : '',
        ]);

        // D4: 小隊摘要 — group by TeamName
        const teamMap = new Map<string, { count: number; totalScore: number; captains: string[] }>();
        for (const m of members) {
            if (!m.TeamName || m.IsCommandant) continue;
            const key = m.TeamName;
            if (!teamMap.has(key)) teamMap.set(key, { count: 0, totalScore: 0, captains: [] });
            const entry = teamMap.get(key)!;
            entry.count++;
            entry.totalScore += m.Score;
            if (m.IsCaptain) entry.captains.push(m.Name);
        }

        // 凝聚次數 per team
        const gatheringCount = new Map<string, number>();
        for (const g of (gatheringsRaw ?? []) as { team_name: string }[]) {
            if (!g.team_name) continue;
            gatheringCount.set(g.team_name, (gatheringCount.get(g.team_name) ?? 0) + 1);
        }

        const summaryHeader = ['小隊', '隊員數', '總積分', '平均積分', '隊長', '已核准凝聚次數'];
        const summaryRows = Array.from(teamMap.entries()).map(([teamName, s]) => [
            teamName,
            s.count,
            s.totalScore,
            s.count > 0 ? Math.floor(s.totalScore / s.count) : 0,
            s.captains.join('、') || '（未設定）',
            gatheringCount.get(teamName) ?? 0,
        ]);

        // D5: 組合 CSV — 成員區 + 空行 + 摘要區，前綴 BOM
        const csv = '﻿' + [
            formatCsvRows([memberHeader, ...memberRows]),
            '',
            formatCsvRows([summaryHeader, ...summaryRows]),
        ].join('\n');

        return { success: true, csv };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, error: '匯出失敗：' + msg };
    }
}

// ── 季前全員進度重置 ──────────────────────────────────────────────────────────
export async function resetSeasonData(): Promise<{ success: boolean; error?: string; counts?: Record<string, number> }> {
    try {
        if (!(await verifyAdminSession())) return { success: false, error: '無權限執行此操作' };
        const today = new Date().toISOString().slice(0, 10);
        if (today >= '2026-05-10') return { success: false, error: '活動已開始（2026-05-10），無法執行重置' };

        const client = await connectDb();
        try {
            await client.query('BEGIN');
            await client.query(`UPDATE "CharacterStats" SET "Score"=0, "Streak"=0, "LastCheckIn"=NULL`);
            const { rowCount: dlCount } = await client.query(`DELETE FROM "DailyLogs"`);
            const { rowCount: baCount } = await client.query(`DELETE FROM "BonusApplications"`);
            const { rowCount: crCount } = await client.query(`DELETE FROM "CourseRegistrations"`);
            await client.query(`DELETE FROM "CourseAttendance"`);
            await client.query(`DELETE FROM "FinePayments"`);
            await client.query(`DELETE FROM "SquadFineSubmissions"`);
            await client.query(`DELETE FROM "SquadGatheringCheckins"`);
            await client.query(`DELETE FROM "SquadGatheringAttendances"`);
            await client.query(`DELETE FROM "OnlineGatheringApplications"`);
            const { rowCount: sgCount } = await client.query(`DELETE FROM "SquadGatheringSessions"`);
            const { rowCount: ngCount } = await client.query(`DELETE FROM "UserNineGrid"`);
            await client.query(`DELETE FROM "WeeklyRankSnapshot"`);
            await client.query(`DELETE FROM "MonthlyRankSnapshot"`);
            await client.query(
                `INSERT INTO "AdminActivityLog"(action,actor,details,result) VALUES($1,$2,$3,$4)`,
                [
                    'reset_season_data',
                    'admin',
                    JSON.stringify({ dailyLogs: dlCount, bonusApps: baCount, courseRegs: crCount, gatherings: sgCount, nineGrid: ngCount }),
                    'success',
                ]
            );
            await client.query('COMMIT');
            return { success: true, counts: { dailyLogs: dlCount ?? 0, bonusApps: baCount ?? 0, courseRegs: crCount ?? 0, gatherings: sgCount ?? 0, nineGrid: ngCount ?? 0 } };
        } catch (e) {
            await client.query('ROLLBACK').catch(() => {});
            throw e;
        } finally {
            client.end().catch(() => {});
        }
    } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
}
