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

export async function checkWeeklyW3Compliance(startMondayISO?: string, endMondayISO?: string) {

    const client = await connectDb();
    try {
        // 計算雙週範圍：預設為「前兩週週一」至「本週週一」（共 14 天）
        let weekStart: Date;
        let weekEnd: Date;

        if (startMondayISO && endMondayISO) {
            weekStart = new Date(startMondayISO);
            // endMondayISO 是第二週的週一，加 7 天得週日結束
            weekEnd = new Date(endMondayISO);
            weekEnd.setDate(weekEnd.getDate() + 7);
        } else {
            // 預設：往回推 14 天（兩週前週一 → 本週週一）
            const today = new Date();
            const day = today.getDay() || 7;
            const thisMonday = new Date(today);
            thisMonday.setDate(today.getDate() - (day - 1));
            thisMonday.setHours(0, 0, 0, 0);
            weekStart = new Date(thisMonday);
            weekStart.setDate(thisMonday.getDate() - 14);
            weekEnd = new Date(thisMonday);
        }

        // period_label 類似 "2026-03-03~2026-03-10"（兩週起訖週一）
        const isoW1 = weekStart.toISOString().slice(0, 10);
        const w2Start = new Date(weekStart);
        w2Start.setDate(w2Start.getDate() + 7);
        const isoW2 = w2Start.toISOString().slice(0, 10);
        const periodLabel = `${isoW1}~${isoW2}`;

        // Get all users
        const usersRes = await client.query<{ UserID: string; Name: string; TotalFines: number }>(
            `SELECT "UserID", "Name", "TotalFines" FROM "CharacterStats"`
        );

        // Get all w3 logs in that bi-weekly range
        const logsRes = await client.query<{ UserID: string }>(
            `SELECT "UserID" FROM "DailyLogs"
             WHERE "QuestID" LIKE 'w3%'
               AND "Timestamp" >= $1 AND "Timestamp" < $2`,
            [weekStart.toISOString(), weekEnd.toISOString()]
        );

        const completedUserIds = new Set(logsRes.rows.map(r => r.UserID));

        const violators: { userId: string; name: string }[] = [];

        await client.query('BEGIN');
        for (const user of usersRes.rows) {
            if (!completedUserIds.has(user.UserID)) {
                violators.push({ userId: user.UserID, name: user.Name });
                await client.query(
                    `UPDATE "CharacterStats" SET "TotalFines" = "TotalFines" + 200 WHERE "UserID" = $1`,
                    [user.UserID]
                );
            }
        }
        await client.query('COMMIT');

        await logAdminAction('w3_compliance', 'admin', undefined, periodLabel, {
            totalUsers: usersRes.rowCount || 0,
            violatorCount: violators.length,
            violators: violators.map(v => v.name),
            periodLabel,
        });
        return {
            success: true,
            periodLabel,
            totalUsers: usersRes.rowCount || 0,
            violatorCount: violators.length,
            violators,
        };
    } catch (error: any) {
        await client.query('ROLLBACK');
        await logAdminAction('w3_compliance', 'admin', undefined, undefined, { error: error.message }, 'error');
        return { success: false, error: error.message };
    } finally {
        await client.end();
    }
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

        // 3. 更新 CharacterStats + upsert TeamSettings
        for (const squad of squads) {
            for (let mi = 0; mi < squad.members.length; mi++) {
                const user = squad.members[mi];
                const isCaptain = mi === 0;
                await client.query(
                    `UPDATE "CharacterStats"
                     SET "SquadName" = $1, "TeamName" = $2, "IsCaptain" = $3
                     WHERE "UserID" = $4`,
                    [squad.battalionName, squad.squadName, isCaptain, user.UserID]
                );
            }
            await client.query(
                `INSERT INTO "TeamSettings" (team_name, team_coins)
                 VALUES ($1, 0)
                 ON CONFLICT (team_name) DO NOTHING`,
                [squad.squadName]
            );
        }

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

// ── 全服天使通話配對抽籤 ──────────────────────────────────
export async function runAngelCallPairing() {
    const supabase = createClient(_supabaseUrl, _supabaseKey);

    // 取得所有有隸屬小隊的成員
    const { data: users, error } = await supabase
        .from('CharacterStats')
        .select('UserID, Name, TeamName')
        .not('TeamName', 'is', null);

    if (error || !users) {
        return { success: false, error: error?.message || '無法取得成員資料' };
    }

    // 依小隊分組
    const teamMap = new Map<string, Array<{ id: string; name: string }>>();
    for (const u of users) {
        if (!u.TeamName) continue;
        if (!teamMap.has(u.TeamName)) teamMap.set(u.TeamName, []);
        teamMap.get(u.TeamName)!.push({ id: u.UserID, name: u.Name });
    }

    const allPairings: Array<{ teamName: string; group: Array<{ id: string; name: string }> }> = [];

    for (const [teamName, members] of teamMap) {
        if (members.length < 2) continue;

        // 隨機洗牌
        const shuffled = [...members].sort(() => Math.random() - 0.5);

        let i = 0;
        while (i < shuffled.length) {
            const remaining = shuffled.length - i;
            if (remaining <= 1) break;
            // 剩3人或2人：整組配對
            if (remaining <= 3) {
                allPairings.push({ teamName, group: shuffled.slice(i) });
                break;
            }
            // 一般情況：兩兩配對
            allPairings.push({ teamName, group: shuffled.slice(i, i + 2) });
            i += 2;
        }
    }

    // 取本週週一日期作為 key
    const now = new Date();
    const day = now.getDay() || 7;
    now.setDate(now.getDate() - (day - 1));
    const weekOf = now.toISOString().slice(0, 10);

    const pairingsJson = JSON.stringify({ weekOf, pairings: allPairings });
    const { error: saveErr } = await supabase.from('SystemSettings').upsert(
        { SettingName: 'AngelCallPairings', Value: pairingsJson },
        { onConflict: 'SettingName' }
    );
    if (saveErr) return { success: false, error: '儲存失敗：' + saveErr.message };

    await logAdminAction('angel_call_pairing', 'admin', undefined, undefined, { weekOf, pairCount: allPairings.length });

    return { success: true, weekOf, pairings: allPairings };
}

// ── 玩家設定生日 ────────────────────────────────────────
export async function saveBirthday(userId: string, birthday: string) {
    // Validate format YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return { success: false, error: '日期格式錯誤，請使用 YYYY-MM-DD' };
    const supabase = createClient(_supabaseUrl, _supabaseKey);
    const { error } = await supabase
        .from('CharacterStats')
        .update({ Birthday: birthday })
        .eq('UserID', userId);
    if (error) return { success: false, error: error.message };
    return { success: true };
}

// ── 成員管理：列出全部成員 ────────────────────────────────
export async function listAllMembers() {
    const supabase = createClient(_supabaseUrl, _supabaseKey);
    const { data, error } = await supabase
        .from('CharacterStats')
        .select('UserID, Name, Email, SquadName, TeamName, IsCaptain, IsCommandant, Level, Exp')
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

// ── 成員管理：設定隊長/大隊長角色 ────────────────────────────
export async function setMemberRole(
    targetUserId: string,
    role: 'captain' | 'commandant' | 'none',
    actorName: string = 'admin'
) {
    const supabase = createClient(_supabaseUrl, _supabaseKey);
    const update: Record<string, boolean> = {};
    if (role === 'captain') { update.IsCaptain = true; update.IsCommandant = false; }
    else if (role === 'commandant') { update.IsCaptain = false; update.IsCommandant = true; }
    else { update.IsCaptain = false; update.IsCommandant = false; }

    const { error } = await supabase.from('CharacterStats').update(update).eq('UserID', targetUserId);
    if (error) return { success: false, error: error.message };

    await logAdminAction('member_role_change', actorName, targetUserId, undefined, { role });
    return { success: true };
}
