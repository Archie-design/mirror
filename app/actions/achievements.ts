'use server';

import { connectDb } from '@/lib/db';
import { getLogicalDateStr } from '@/lib/utils/time';
import type { AchievementRecord } from '@/types';

// ─── Role → cureTaskId mapping (server-only, mirrors ROLE_CURE_MAP in constants) ───
const ROLE_CURE_TASK: Record<string, string> = {
    '孫悟空': 'q2',
    '豬八戒': 'q6',
    '沙悟淨': 'q4',
    '白龍馬': 'q5',
    '唐三藏': 'q3',
};

// ─── Private utility functions ────────────────────────────────────────────────

/** Convert an array of ISO timestamp strings to sorted, deduplicated logical date strings */
function toLogicalDates(timestamps: string[]): string[] {
    const set = new Set(timestamps.map(ts => getLogicalDateStr(ts)));
    return Array.from(set).sort();
}

/** How many consecutive days ending on targetDate exist in sortedDates? */
function getStreakEndingOn(sortedDates: string[], targetDate: string): number {
    if (!sortedDates.includes(targetDate)) return 0;
    let streak = 1;
    const cursor = new Date(targetDate);
    while (true) {
        cursor.setDate(cursor.getDate() - 1);
        const prev = cursor.toISOString().slice(0, 10);
        if (sortedDates.includes(prev)) {
            streak++;
        } else {
            break;
        }
    }
    return streak;
}

/**
 * Days between the last occurrence in sortedHistoryDates and todayStr.
 * Returns 0 if there's no prior history.
 * "History" should NOT include today's date.
 */
function getDaysSinceLast(sortedHistoryDates: string[], todayStr: string): number {
    if (sortedHistoryDates.length === 0) return 0;
    const last = sortedHistoryDates[sortedHistoryDates.length - 1];
    const msPerDay = 86400000;
    return Math.round((new Date(todayStr).getTime() - new Date(last).getTime()) / msPerDay);
}

// ─── Main exported functions ──────────────────────────────────────────────────

/**
 * After a successful quest check-in, evaluate all 43 achievement conditions
 * and insert newly-unlocked achievements. Returns the IDs of newly unlocked achievements.
 */
export async function checkAndUnlockAchievements(
    userId: string,
    _newQuestId: string,
): Promise<string[]> {
    const client = await connectDb();
    try {
        // 1. Fetch user stats
        const userRes = await client.query(
            `SELECT "Role", "Spirit", "Physique", "Charisma", "Savvy", "Luck", "Potential", "TeamName"
             FROM "CharacterStats" WHERE "UserID" = $1`,
            [userId]
        );
        if (userRes.rowCount === 0) return [];
        const user = userRes.rows[0];

        // 2. Fetch all DailyLogs for this user
        const logsRes = await client.query(
            `SELECT "QuestID", "Timestamp" FROM "DailyLogs" WHERE "UserID" = $1 ORDER BY "Timestamp" ASC`,
            [userId]
        );
        const logs = logsRes.rows as { QuestID: string; Timestamp: string }[];

        // 3. Fetch already-unlocked achievements
        const existingRes = await client.query(
            `SELECT achievement_id FROM "Achievements" WHERE user_id = $1`,
            [userId]
        );
        const alreadyUnlocked = new Set<string>(existingRes.rows.map((r: { achievement_id: string }) => r.achievement_id));

        // ── Derive counts and date arrays ──────────────────────────────────
        const todayStr = getLogicalDateStr();

        const totalCount = logs.length;
        const q1Logs = logs.filter(l => l.QuestID === 'q1' || l.QuestID === 'q1_dawn');
        const dawnLogs = logs.filter(l => l.QuestID === 'q1_dawn');
        const q2Logs = logs.filter(l => l.QuestID === 'q2');
        const q3Logs = logs.filter(l => l.QuestID === 'q3');
        const q4Logs = logs.filter(l => l.QuestID === 'q4');
        const q5Logs = logs.filter(l => l.QuestID === 'q5');
        const q6Logs = logs.filter(l => l.QuestID === 'q6');
        const q7Logs = logs.filter(l => l.QuestID === 'q7');
        const w1Logs = logs.filter(l => l.QuestID.startsWith('w1'));
        const w4Logs = logs.filter(l => l.QuestID.startsWith('w4'));
        const tLogs  = logs.filter(l => l.QuestID.startsWith('t'));
        const bdLogs = logs.filter(l => l.QuestID.startsWith('bd_yuanmeng'));
        const tempLogs = logs.filter(l => l.QuestID.startsWith('temp_'));

        const cureTaskId = ROLE_CURE_TASK[user.Role] ?? '';
        const cureLogs = cureTaskId ? logs.filter(l => l.QuestID === cureTaskId) : [];

        const q1Count   = q1Logs.length;
        const dawnCount = dawnLogs.length;
        const q2Count   = q2Logs.length;
        const q3Count   = q3Logs.length;
        const q4Count   = q4Logs.length;
        const q5Count   = q5Logs.length;
        const q6Count   = q6Logs.length;
        const q7Count   = q7Logs.length;
        const w1Count   = w1Logs.length;
        const w4Count   = w4Logs.length;
        const tCount    = tLogs.length;
        const bdCount   = bdLogs.length;
        const tempCount = tempLogs.length;
        const cureCount = cureLogs.length;

        // Logical date arrays (sorted, deduped)
        const punchDates   = toLogicalDates(q1Logs.map(l => l.Timestamp));
        const dawnDates    = toLogicalDates(dawnLogs.map(l => l.Timestamp));
        const anyQDates    = toLogicalDates(logs.filter(l => l.QuestID.startsWith('q')).map(l => l.Timestamp));

        // Streaks ending on today
        const punchStreakToday = getStreakEndingOn(punchDates, todayStr);
        const anyStreakToday   = getStreakEndingOn(anyQDates, todayStr);
        const dawnStreakToday  = getStreakEndingOn(dawnDates, todayStr);

        // Today's q-prefix quest count (for full_day)
        const todayQCount = logs.filter(l => l.QuestID.startsWith('q') && getLogicalDateStr(l.Timestamp) === todayStr).length;

        // Gap calculations for comeback/phoenix/prodigal:
        // Group logs by a canonical questType prefix, exclude today, find max gap to today
        function maxGapForType(typeLogs: { QuestID: string; Timestamp: string }[]): number {
            const histDates = toLogicalDates(typeLogs.map(l => l.Timestamp)).filter(d => d < todayStr);
            return getDaysSinceLast(histDates, todayStr);
        }

        // Build per-questType groups for gap checking
        const questTypeGroups: { QuestID: string; Timestamp: string }[][] = [
            q1Logs, q2Logs, q3Logs, q4Logs, q5Logs, q6Logs, q7Logs
        ].filter(g => g.length > 0);

        // Only check gap for quest types completed today
        const todayQuestIds = new Set(logs
            .filter(l => getLogicalDateStr(l.Timestamp) === todayStr)
            .map(l => l.QuestID));

        let maxGap7 = 0, maxGap14 = 0, maxGap30 = 0;
        for (const group of questTypeGroups) {
            const qid = group[0].QuestID;
            if (!todayQuestIds.has(qid)) continue; // only check types done today
            const gap = maxGapForType(group);
            if (gap > maxGap7) maxGap7 = gap;
            if (gap > maxGap14) maxGap14 = gap;
            if (gap > maxGap30) maxGap30 = gap;
        }

        // all_daily: q1/q1_dawn + q2..q7 each at least once
        const allDaily = q1Count >= 1 && q2Count >= 1 && q3Count >= 1 &&
                         q4Count >= 1 && q5Count >= 1 && q6Count >= 1 && q7Count >= 1;

        // omnipractice: q1-q7, w1-w4, t, bd_yuanmeng each >= 1
        const hasW2 = logs.some(l => l.QuestID.startsWith('w2'));
        const hasW3 = logs.some(l => l.QuestID.startsWith('w3'));
        const omnipractice = allDaily && w1Count >= 1 && hasW2 && hasW3 && w4Count >= 1 && tCount >= 1 && bdCount >= 1;

        // ── Team achievement data (only if user has a team) ──────────────
        let teamMemberIds: string[] = [];
        const teammateLogsToday: Record<string, boolean> = {}; // userId → has q1/q1_dawn today
        const teammateAnyToday: Record<string, boolean> = {};  // userId → has any quest today
        const teammateRecentPunch: Record<string, string[]> = {}; // userId → sorted punch dates

        if (user.TeamName) {
            const membersRes = await client.query(
                `SELECT "UserID" FROM "CharacterStats" WHERE "TeamName" = $1 AND "UserID" != $2`,
                [user.TeamName, userId]
            );
            teamMemberIds = membersRes.rows.map((r: { UserID: string }) => r.UserID);

            if (teamMemberIds.length > 0) {
                // Fetch last 10 days of logs for all teammates (enough for streak_3)
                const since = new Date();
                since.setDate(since.getDate() - 10);
                const teammateLogsRes = await client.query(
                    `SELECT "UserID", "QuestID", "Timestamp" FROM "DailyLogs"
                     WHERE "UserID" = ANY($1::text[]) AND "Timestamp" >= $2
                     ORDER BY "UserID", "Timestamp" ASC`,
                    [teamMemberIds, since.toISOString()]
                );
                const tLogs2 = teammateLogsRes.rows as { UserID: string; QuestID: string; Timestamp: string }[];

                for (const tm of teamMemberIds) {
                    const tmLogs = tLogs2.filter(l => l.UserID === tm);
                    const tmPunchToday = tmLogs.some(l =>
                        (l.QuestID === 'q1' || l.QuestID === 'q1_dawn') &&
                        getLogicalDateStr(l.Timestamp) === todayStr
                    );
                    const tmAnyToday = tmLogs.some(l => getLogicalDateStr(l.Timestamp) === todayStr);
                    teammateLogsToday[tm] = tmPunchToday;
                    teammateAnyToday[tm] = tmAnyToday;

                    const tmPunchDates = toLogicalDates(
                        tmLogs.filter(l => l.QuestID === 'q1' || l.QuestID === 'q1_dawn').map(l => l.Timestamp)
                    );
                    teammateRecentPunch[tm] = tmPunchDates;
                }
            }
        }

        // team_punch: ≥ 2 people (self + at least 1 teammate) have q1/q1_dawn today
        const selfPunchToday = punchDates.includes(todayStr);
        const teamPunchCount = (selfPunchToday ? 1 : 0) +
            Object.values(teammateLogsToday).filter(Boolean).length;
        const teamPunch = user.TeamName && teamPunchCount >= 2;

        // team_perfect: all team members have at least 1 quest today
        const selfAnyToday = anyQDates.includes(todayStr);
        const allTeamAnyToday = selfAnyToday &&
            Object.values(teammateAnyToday).every(Boolean) &&
            teamMemberIds.length > 0;
        const teamPerfect = user.TeamName && allTeamAnyToday;

        // team_streak: any teammate has 3-day consecutive punch overlap with self
        let teamStreak = false;
        if (user.TeamName && selfPunchToday) {
            for (const tm of teamMemberIds) {
                const tmPunch = teammateRecentPunch[tm] ?? [];
                // Check last 3 consecutive days ending today
                const d2 = new Date(todayStr); d2.setDate(d2.getDate() - 1);
                const d3 = new Date(todayStr); d3.setDate(d3.getDate() - 2);
                const day2 = d2.toISOString().slice(0, 10);
                const day3 = d3.toISOString().slice(0, 10);
                const selfHas = punchDates.includes(day2) && punchDates.includes(day3);
                const tmHas = tmPunch.includes(todayStr) && tmPunch.includes(day2) && tmPunch.includes(day3);
                if (selfHas && tmHas) { teamStreak = true; break; }
            }
        }

        // ── Build candidate set ────────────────────────────────────────────
        const candidates: string[] = [];
        const check = (id: string, cond: boolean) => {
            if (!alreadyUnlocked.has(id) && cond) candidates.push(id);
        };

        check('first_step',        totalCount >= 1);
        check('full_day',          todayQCount >= 3);
        check('streak_3',          punchStreakToday >= 3);
        check('dawn_boxer',        dawnCount >= 5);
        check('veg_pioneer',       q6Count >= 20);
        check('early_sleeper',     q7Count >= 20);
        check('weekly_caller',     w1Count >= 5);
        check('comeback',          maxGap7 >= 7);
        check('streak_7',          punchStreakToday >= 7);
        check('full_week',         anyStreakToday >= 5);
        check('dawn_devotee',      dawnCount >= 20);
        check('meditation_master', q2Count >= 30);
        check('dance_devotee',     q3Count >= 30);
        check('role_cure_10',      cureCount >= 10);
        check('w4_giver',          w4Count >= 10);
        check('topic_devotee',     tCount >= 5);
        check('yuanmeng',          bdCount >= 3);
        check('all_daily',         allDaily);
        check('temp_master',       tempCount >= 5);
        check('marathon',          totalCount >= 100);
        check('mastery_q1',        q1Count >= 50);
        check('phoenix',           maxGap14 >= 14);
        check('streak_30',         punchStreakToday >= 30);
        check('role_cure_50',      cureCount >= 50);
        check('five_hundred',      totalCount >= 500);
        check('dawn_legend',       dawnCount >= 50);
        check('full_month',        anyStreakToday >= 20);
        check('prodigal',          maxGap30 >= 30);
        check('omnipractice',      omnipractice);
        check('eternal_dawn',      dawnStreakToday >= 7);
        check('team_punch',        !!teamPunch);
        check('team_perfect',      !!teamPerfect);
        check('team_streak',       teamStreak);
        // Role-exclusive
        check('wukong_dawn',       user.Role === '孫悟空' && dawnCount >= 30);
        check('wukong_spirit',     user.Role === '孫悟空' && user.Spirit >= 20);
        check('bajie_veg',         user.Role === '豬八戒' && q6Count >= 30);
        check('bajie_physique',    user.Role === '豬八戒' && user.Physique >= 20);
        check('wujing_chant',      user.Role === '沙悟淨' && q4Count >= 30);
        check('wujing_savvy',      user.Role === '沙悟淨' && user.Savvy >= 20);
        check('horse_gratitude',   user.Role === '白龍馬' && q5Count >= 30);
        check('horse_charisma',    user.Role === '白龍馬' && user.Charisma >= 20);
        check('monk_dance',        user.Role === '唐三藏' && q3Count >= 30);
        check('monk_streak',       user.Role === '唐三藏' && anyStreakToday >= 14);

        if (candidates.length === 0) return [];

        // ── Batch insert new achievements ──────────────────────────────────
        const valuePlaceholders = candidates.map((_, i) => `($1, $${i + 2})`).join(', ');
        const insertRes = await client.query(
            `INSERT INTO "Achievements" (user_id, achievement_id)
             VALUES ${valuePlaceholders}
             ON CONFLICT (user_id, achievement_id) DO NOTHING
             RETURNING achievement_id`,
            [userId, ...candidates]
        );

        return insertRes.rows.map((r: { achievement_id: string }) => r.achievement_id);
    } catch (err) {
        console.error('[achievements] checkAndUnlockAchievements error:', err);
        return [];
    } finally {
        await client.end();
    }
}

/** Fetch all achievements unlocked by the given user */
export async function getUserAchievements(userId: string): Promise<AchievementRecord[]> {
    const client = await connectDb();
    try {
        const res = await client.query(
            `SELECT achievement_id, unlocked_at FROM "Achievements" WHERE user_id = $1 ORDER BY unlocked_at ASC`,
            [userId]
        );
        return res.rows.map((r: { achievement_id: string; unlocked_at: Date }) => ({
            achievement_id: r.achievement_id,
            unlocked_at: r.unlocked_at.toISOString(),
        }));
    } catch (err) {
        console.error('[achievements] getUserAchievements error:', err);
        return [];
    } finally {
        await client.end();
    }
}
