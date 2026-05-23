/**
 * ⚠️ DEPRECATED（2026-05-24）：本腳本是針對「週日對齊」短暫遷移寫的 audit，
 * 後續決策回到「W1 8 天 + W2+ 週一-週日」，5/17 又歸 W1，這份 audit 已無意義。
 * 保留檔案僅供歷史紀錄，請勿執行。
 *
 * 原描述：賽季週改為「週日 → 週六」後，5/17（週日）這天的紀錄會從舊 W1 (5/10-5/17 8天)
 * 變為新 W2 (5/17-5/23)。可能造成同週上限被破壞（同一個人同週多次紀錄）。
 *
 * 本腳本掃描以下任務在 2026-05-17 (週日) ~ 2026-05-23 (週六) 區間內，是否有
 * 人同週超量。只印名單，**不自動處理**（採寬恕模式）。
 */
console.error('[deprecated] 本腳本已棄用，請勿執行。理由見檔頭註解。');
process.exit(1);
/* eslint-disable @typescript-eslint/no-unused-vars */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const WEEK_START = '2026-05-17T00:00:00+08:00';  // 新 W2 起算
const WEEK_END   = '2026-05-24T00:00:00+08:00';  // 新 W3 起算

type AuditRule = {
    label: string;
    questIdPattern: string;       // SQL LIKE pattern
    perWeekLimit: number;          // 每週上限次數（>= 此值算超量）
    extraFilter?: string;          // 額外 OR 條件（給 wk4 互斥用）
};

const RULES: AuditRule[] = [
    { label: '九宮格 (nine_grid_cell)',         questIdPattern: 'nine_grid_cell|%', perWeekLimit: 2 },
    { label: 'wk1 破框練習',                     questIdPattern: 'wk1|%',            perWeekLimit: 4 },
    { label: 'wk2 天使通話',                     questIdPattern: 'wk2|%',            perWeekLimit: 3 },
    { label: 'wk3_online 線上凝聚',              questIdPattern: 'wk3_online|%',     perWeekLimit: 2 },
    { label: 'wk4 人生大戲（small|large 互斥）', questIdPattern: 'wk4_small|%',      perWeekLimit: 2, extraFilter: `"QuestID" LIKE 'wk4_large|%'` },
];

async function auditOne(rule: AuditRule) {
    // 用直接 SQL（透過 rpc 或 raw query 非常麻煩，改用兩段查詢：撈出所有匹配 rows，本地聚合）
    const orFilters = rule.extraFilter
        ? `QuestID.like.${rule.questIdPattern.replace('%', '*')},QuestID.like.${rule.extraFilter.match(/'([^']+)'/)![1].replace('%', '*')}`
        : `QuestID.like.${rule.questIdPattern.replace('%', '*')}`;
    const { data, error } = await supabase
        .from('DailyLogs')
        .select('UserID, QuestID, Timestamp')
        .or(orFilters)
        .gte('Timestamp', WEEK_START)
        .lt('Timestamp', WEEK_END);
    if (error) { console.error(`  ! ${rule.label} 查詢失敗:`, error.message); return; }

    const byUser = new Map<string, string[]>();
    for (const row of (data ?? []) as { UserID: string; QuestID: string; Timestamp: string }[]) {
        if (!byUser.has(row.UserID)) byUser.set(row.UserID, []);
        byUser.get(row.UserID)!.push(`${row.QuestID}@${row.Timestamp.slice(0, 10)}`);
    }

    const overflows = Array.from(byUser.entries()).filter(([, qs]) => qs.length >= rule.perWeekLimit);
    console.log(`── ${rule.label}（上限 ${rule.perWeekLimit - 1}/週）──`);
    if (overflows.length === 0) {
        console.log(`  ✓ 無超量\n`);
        return;
    }

    // 取用者姓名
    const userIds = overflows.map(([id]) => id);
    const { data: users } = await supabase
        .from('CharacterStats')
        .select('UserID, Name, TeamName, SquadName')
        .in('UserID', userIds);
    const nameMap = new Map((users ?? []).map(u => [u.UserID, u]));

    for (const [uid, quests] of overflows) {
        const u = nameMap.get(uid);
        console.log(`  ! ${u?.Name ?? '?'} (${uid}) [${u?.SquadName ?? ''}/${u?.TeamName ?? ''}] ${quests.length} 次：${quests.join(', ')}`);
    }
    console.log();
}

async function main() {
    console.log(`=== 賽季週改為「週日 → 週六」遷移 audit ===`);
    console.log(`掃描區間：${WEEK_START} ~ ${WEEK_END}（新 W2）\n`);
    for (const rule of RULES) {
        await auditOne(rule);
    }
    console.log(`=== 完成 ===`);
    console.log(`註：採寬恕模式，名單僅供確認。既有紀錄不撤銷，新一週起的打卡走新規則。`);
}

main().catch(e => { console.error(e); process.exit(1); });
