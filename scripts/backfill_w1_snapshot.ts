/**
 * 一次性：補寫賽季 W1 (2026-05-10 ~ 2026-05-16) WeeklyRankSnapshot。
 *
 * 背景：原規則 W1 = 5/10-5/17 (8天)，cron 在 5/18 把 5/10-5/17 寫成一筆 week_monday='2026-05-10'。
 *       現規則改為「週日 → 週六」7 天，W1 = 5/10-5/16，5/17 起為 W2。
 *       cron schedule 改為週日 12:30，第一次寫入 = 5/24（寫入 W2 5/17-5/23）。
 *       本腳本補寫 W1 5/10-5/16 snapshot：
 *         1. 若 DB 已有 week_monday='2026-05-10' 紀錄（5/18 舊 cron 寫入的 8 天版本）→ 先刪除
 *         2. 重新聚合 5/10 12:00 ~ 5/17 12:00 區間（7 天）並寫入
 *
 * 用法：
 *   Dry-run：npx ts-node scripts/backfill_w1_snapshot.ts
 *   Apply  ：npx ts-node scripts/backfill_w1_snapshot.ts --apply
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const DRY_RUN = !process.argv.includes('--apply');

const WEEK_MONDAY = '2026-05-10';  // 欄位沿用，內容為週日日期
const START = '2026-05-10T12:00:00+08:00';
const END   = '2026-05-17T12:00:00+08:00';

interface AggregateRow {
    user_id: string;
    user_name: string | null;
    team_name: string | null;
    squad_name: string | null;
    period_score: number;
    cumulative_score: number;
}

async function main() {
    console.log(`=== W1 snapshot backfill ===`);
    console.log(`Mode: ${DRY_RUN ? 'DRY-RUN（不寫入）' : 'APPLY'}`);
    console.log(`Range: ${START} ~ ${END}（7 天）\n`);

    // 1. 查既有 week_monday='2026-05-10' 紀錄
    const { data: existing, error: existErr } = await supabase
        .from('WeeklyRankSnapshot')
        .select('user_id', { count: 'exact' })
        .eq('week_monday', WEEK_MONDAY);
    if (existErr) { console.error('查既有紀錄失敗:', existErr.message); process.exit(1); }
    console.log(`既有 week_monday=${WEEK_MONDAY} 紀錄：${existing?.length ?? 0} 筆`);

    // 2. 聚合新區間
    const { data: agg, error: aggErr } = await supabase.rpc('aggregate_dailylogs_by_user', {
        p_start: START, p_end: END,
    });
    if (aggErr) { console.error('aggregate RPC 失敗:', aggErr.message); process.exit(1); }
    const rows = (agg as AggregateRow[] | null) ?? [];
    console.log(`新聚合結果：${rows.length} 筆`);

    if (rows.length === 0) {
        console.log('  ! 無資料可寫入');
        return;
    }

    const payload = rows.map(r => ({
        week_monday: WEEK_MONDAY,
        user_id: r.user_id,
        user_name: r.user_name,
        team_name: r.team_name,
        squad_name: r.squad_name,
        week_score: Number(r.period_score) || 0,
        cumulative_score: r.cumulative_score || 0,
    }));

    // sample 印出前 5 筆
    console.log(`\nSample (前 5 筆):`);
    for (const p of payload.slice(0, 5)) {
        console.log(`  ${p.user_name ?? '?'} (${p.user_id}) [${p.squad_name ?? ''}/${p.team_name ?? ''}] week_score=${p.week_score}, cum=${p.cumulative_score}`);
    }

    if (DRY_RUN) {
        console.log(`\n[dry-run] 略過寫入。實際 apply 將：`);
        console.log(`  1. DELETE WeeklyRankSnapshot WHERE week_monday='${WEEK_MONDAY}'  (清掉 ${existing?.length ?? 0} 筆)`);
        console.log(`  2. INSERT ${payload.length} 筆新紀錄`);
        return;
    }

    // 3. 刪舊
    if ((existing?.length ?? 0) > 0) {
        const { error: delErr } = await supabase
            .from('WeeklyRankSnapshot')
            .delete()
            .eq('week_monday', WEEK_MONDAY);
        if (delErr) { console.error('  ! DELETE 失敗:', delErr.message); process.exit(1); }
        console.log(`\n  ✓ 已刪除 ${existing?.length ?? 0} 筆舊紀錄`);
    }

    // 4. 寫新
    const { error: insErr } = await supabase
        .from('WeeklyRankSnapshot')
        .upsert(payload, { onConflict: 'week_monday,user_id' });
    if (insErr) { console.error('  ! UPSERT 失敗:', insErr.message); process.exit(1); }
    console.log(`  ✅ 已寫入 ${payload.length} 筆 W1 snapshot`);

    console.log(`\n=== 完成 ===`);
}

main().catch(e => { console.error(e); process.exit(1); });
