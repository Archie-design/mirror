/**
 * 一次性：修正「第一個賽季月」MonthlyRankSnapshot 的 month_start。
 *
 * 背景：月排行榜已改採「賽季月」(第一個月 5/10–6/14、第二個月 6/15–7/19)，
 *       month_start = 賽季月 key = '2026-05-10'。但舊的 triggerMonthlySnapshot()
 *       用「日曆月」邏輯，把第一個月寫成 month_start='2026-05-01'、區間 5/1–6/1，
 *       導致後台月榜下拉出現「2026-05-01（上月）」且統計區間錯誤（應為 5/10 起）。
 *
 *       本腳本：
 *         1. 刪除 month_start='2026-05-01' 的舊（日曆月）快照
 *         2. 以賽季月正確區間 5/10 12:00 ~ 6/15 12:00 重新聚合，寫成 month_start='2026-05-10'
 *            （若 '2026-05-10' 已有 cron 寫入的快照，則保留既有、不覆蓋；僅清除 5/01 污染）
 *
 * 冪等：可重複執行。已無 5/01 紀錄 + 5/10 已存在時為 no-op。
 *
 * 用法：
 *   Dry-run：npx ts-node scripts/fix_first_season_month_snapshot.ts
 *   Apply  ：npx ts-node scripts/fix_first_season_month_snapshot.ts --apply
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const DRY_RUN = !process.argv.includes('--apply');

const STALE_MONTH_START = '2026-05-01';   // 舊日曆月污染
const CORRECT_MONTH_START = '2026-05-10'; // 賽季月「第一個月」key
const START = '2026-05-10T12:00:00+08:00';
const END   = '2026-06-15T12:00:00+08:00'; // 含 6/14 整個邏輯日（第一個賽季月 endExclusive）

interface AggregateRow {
    user_id: string;
    user_name: string | null;
    team_name: string | null;
    squad_name: string | null;
    period_score: number;
    cumulative_score: number;
}

async function main() {
    console.log(`=== 第一賽季月快照修正 ===`);
    console.log(`Mode: ${DRY_RUN ? 'DRY-RUN（不寫入）' : 'APPLY'}`);
    console.log(`Stale  month_start: ${STALE_MONTH_START}（將刪除）`);
    console.log(`Correct month_start: ${CORRECT_MONTH_START}（區間 ${START} ~ ${END}）\n`);

    // 1. 查舊（5/01）污染紀錄
    const { data: stale, error: staleErr } = await supabase
        .from('MonthlyRankSnapshot')
        .select('user_id')
        .eq('month_start', STALE_MONTH_START);
    if (staleErr) { console.error('查 5/01 紀錄失敗:', staleErr.message); process.exit(1); }
    console.log(`既有 month_start=${STALE_MONTH_START} 紀錄：${stale?.length ?? 0} 筆`);

    // 2. 查正確（5/10）是否已存在（cron 可能已寫）
    const { data: correctExisting, error: corrErr } = await supabase
        .from('MonthlyRankSnapshot')
        .select('user_id')
        .eq('month_start', CORRECT_MONTH_START);
    if (corrErr) { console.error('查 5/10 紀錄失敗:', corrErr.message); process.exit(1); }
    const correctCount = correctExisting?.length ?? 0;
    console.log(`既有 month_start=${CORRECT_MONTH_START} 紀錄：${correctCount} 筆`);

    // 3. 若 5/10 尚無快照，聚合正確區間以便寫入
    let payload: Array<Record<string, unknown>> = [];
    if (correctCount === 0) {
        const { data: agg, error: aggErr } = await supabase.rpc('aggregate_dailylogs_by_user', {
            p_start: START, p_end: END,
        });
        if (aggErr) { console.error('aggregate RPC 失敗:', aggErr.message); process.exit(1); }
        const rows = (agg as AggregateRow[] | null) ?? [];
        console.log(`新聚合結果（5/10 賽季月）：${rows.length} 筆`);
        payload = rows.map(r => ({
            month_start: CORRECT_MONTH_START,
            user_id: r.user_id,
            user_name: r.user_name,
            team_name: r.team_name,
            squad_name: r.squad_name,
            month_score: Number(r.period_score) || 0,
            cumulative_score: r.cumulative_score || 0,
        }));
        console.log(`\nSample (前 5 筆):`);
        for (const p of payload.slice(0, 5)) {
            console.log(`  ${p.user_name ?? '?'} (${p.user_id}) [${p.squad_name ?? ''}/${p.team_name ?? ''}] month_score=${p.month_score}, cum=${p.cumulative_score}`);
        }
    } else {
        console.log(`5/10 賽季月快照已存在，保留既有、不重算（僅清除 5/01 污染）。`);
    }

    if (DRY_RUN) {
        console.log(`\n[dry-run] 略過寫入。實際 apply 將：`);
        console.log(`  1. DELETE MonthlyRankSnapshot WHERE month_start='${STALE_MONTH_START}'  (清掉 ${stale?.length ?? 0} 筆)`);
        if (correctCount === 0) {
            console.log(`  2. INSERT ${payload.length} 筆 month_start='${CORRECT_MONTH_START}' 新紀錄`);
        } else {
            console.log(`  2. （5/10 已存在 ${correctCount} 筆，不寫入）`);
        }
        return;
    }

    // 4. 刪 5/01 污染
    if ((stale?.length ?? 0) > 0) {
        const { error: delErr } = await supabase
            .from('MonthlyRankSnapshot')
            .delete()
            .eq('month_start', STALE_MONTH_START);
        if (delErr) { console.error('  ! DELETE 失敗:', delErr.message); process.exit(1); }
        console.log(`\n  ✓ 已刪除 ${stale?.length ?? 0} 筆 month_start=${STALE_MONTH_START} 舊紀錄`);
    }

    // 5. 寫 5/10 正確快照（若尚未存在）
    if (correctCount === 0 && payload.length > 0) {
        const { error: insErr } = await supabase
            .from('MonthlyRankSnapshot')
            .upsert(payload, { onConflict: 'month_start,user_id', ignoreDuplicates: true });
        if (insErr) { console.error('  ! UPSERT 失敗:', insErr.message); process.exit(1); }
        console.log(`  ✅ 已寫入 ${payload.length} 筆 month_start=${CORRECT_MONTH_START} 賽季月快照`);
    }

    console.log(`\n=== 完成 ===`);
}

main().catch(e => { console.error(e); process.exit(1); });
