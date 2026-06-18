// 一次性補帳：陳品吟九宮格「傾聽 / 不帶結果溝通」完成標記（0 分）
//
// 背景（經稽核確認，2026-06-18）：
//   陳品吟（937128452，第3小隊）回報「5/24 傾聽、5/31 不帶結果溝通」紀錄不見。
//   稽核結果：她的人生大戲分數（wk4）都在；「傾聽/不帶結果溝通」是九宮格兩格，
//   目前 completed=false。九宮格格子本身 0 分、補後仍湊不成連線（加分 0）。
//   于萱裁示：只補九宮格完成標記（0 分）。
//
// 對應（已從 UserNineGrid.cells 確認索引）：
//   idx 7 = 傾聽           → completed_at 2026-05-24T12:00:00+08:00
//   idx 3 = 不帶結果溝通    → completed_at 2026-05-31T12:00:00+08:00
//
// 寫法：直接更新 UserNineGrid.cells（completed=true + 歷史 completed_at）
//   並補對應 nine_grid_cell|<idx> DailyLogs（0 分、歷史時間戳）。
//   不走 process_nine_grid_cell RPC，因為 RPC 會用 NOW() 且擋「每週限一格」，
//   不適合補歷史紀錄。連線檢查：補後若意外成線會印出警告（本案試算為 0 連線）。
//
// 安全：
//   - idempotent：cells 已 completed 或 DailyLogs 已有該格 → 跳過。
//   - 預設 dry-run，--commit 才寫入。
import { config } from 'dotenv';
config({ path: '.env.local' });
import { Client } from 'pg';

const UID = '937128452';
const MARKS = [
  { idx: 7, label: '傾聽',         ts: '2026-05-24T12:00:00+08:00', iso: '2026-05-24T04:00:00Z' },
  { idx: 3, label: '不帶結果溝通', ts: '2026-05-31T12:00:00+08:00', iso: '2026-05-31T04:00:00Z' },
];
const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
const COMMIT = process.argv.includes('--commit');

function countLines(done: Set<number>) {
  return LINES.filter(l => l.every(i => done.has(i))).length;
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  console.log(`\n模式：${COMMIT ? '🔴 COMMIT' : '🟡 DRY-RUN'}\n`);

  const g = await c.query(`SELECT cells FROM "UserNineGrid" WHERE member_id=$1`, [UID]);
  if (!g.rows[0]) { console.log('找不到九宮格'); await c.end(); return; }
  let cells = g.rows[0].cells as { label: string; completed: boolean; completed_at: string|null; description?: string }[];

  const before = new Set<number>();
  cells.forEach((cell, i) => { if (cell.completed) before.add(i); });
  console.log('補前已完成：', [...before].map(i=>`${i}:${cells[i].label}`).join(', '), '｜連線', countLines(before));

  const plan: any[] = [];
  const after = new Set(before);
  for (const m of MARKS) {
    const cur = cells[m.idx];
    const labelMatch = cur.label === m.label;
    let action: string;
    if (!labelMatch) action = `⚠️ 索引不符（DB idx${m.idx}=「${cur.label}」≠「${m.label}」）— 跳過`;
    else if (cur.completed) action = '跳過（已完成）';
    else { action = `標記完成 @ ${m.ts}`; after.add(m.idx); }
    plan.push({ idx: m.idx, 格子: m.label, DB標籤: cur.label, 目前: cur.completed?'已完成':'未完成', 動作: action });
  }
  console.table(plan);

  const newLines = countLines(after) - countLines(before);
  console.log(`補後連線：${countLines(after)}（新增 ${newLines}）→ 連線加分 ${newLines*3000}`);
  if (newLines > 0) console.log('⚠️ 注意：補後會新增連線，需另議是否補 +3000 連線分！');

  if (!COMMIT) { console.log('\n🟡 DRY-RUN 結束。加 --commit 寫入。'); await c.end(); return; }

  console.log('\n🔴 寫入中…');
  for (const m of MARKS) {
    if (cells[m.idx].label !== m.label || cells[m.idx].completed) {
      console.log(`  - idx${m.idx} ${m.label}：跳過`); continue;
    }
    // 1) 更新 cells
    cells[m.idx] = { ...cells[m.idx], completed: true, completed_at: m.iso };
    // 2) 補 DailyLogs（0 分），先去重
    const dup = await c.query(
      `SELECT COUNT(*)::int n FROM "DailyLogs" WHERE "UserID"=$1 AND "QuestID"=$2`,
      [UID, `nine_grid_cell|${m.idx}`]);
    if (dup.rows[0].n === 0) {
      await c.query(
        `INSERT INTO "DailyLogs" ("Timestamp","UserID","QuestID","QuestTitle","RewardPoints")
         VALUES ($1,$2,$3,'九宮格格子完成',0)`,
        [m.ts, UID, `nine_grid_cell|${m.idx}`]);
    }
    console.log(`  ✓ idx${m.idx} ${m.label} 標記完成 + DailyLog（0 分）`);
  }
  await c.query(
    `UPDATE "UserNineGrid" SET cells=$1::jsonb, updated_at=now() WHERE member_id=$2`,
    [JSON.stringify(cells), UID]);

  console.log('\n=== 寫入後複查 cells ===');
  const v = await c.query(`SELECT cells FROM "UserNineGrid" WHERE member_id=$1`, [UID]);
  (v.rows[0].cells as any[]).forEach((cell,i)=>console.log(`  ${i}: ${cell.label} → ${cell.completed?'✓':'✗'} ${cell.completed_at??''}`));

  await c.end();
}
main().catch(e=>{console.error(e);process.exit(1);});
