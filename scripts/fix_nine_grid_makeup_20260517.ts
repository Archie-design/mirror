/**
 * 5/17 九宮格特殊情況補救（一次性）
 *
 * - 陳亭吟：5/17 沒按、5/18 上午才按 → 把那一格的 completed_at 從 5/18 回溯到 5/17，
 *           並同步改 DailyLogs.Timestamp。讓 W2 額度恢復。
 * - 陳俊諺、鄭家家：5/17 有做但沒按 → 補一格九宮格（cells 標記 + DailyLogs INSERT + 連線判定）。
 *
 * 用法：
 *   Dry-run：npx ts-node scripts/fix_nine_grid_makeup_20260517.ts
 *   Apply :  npx ts-node scripts/fix_nine_grid_makeup_20260517.ts --apply
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const TAIPEI_5_17_NOON = '2026-05-17T12:00:00+08:00';
const TAIPEI_5_17_TS   = '2026-05-17T22:00:00+08:00';

const DRY_RUN = !process.argv.includes('--apply');

const LINES: number[][] = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
];

type Action =
    | { kind: 'reassign'; name: string; cellIndex: number | 'auto' }
    | { kind: 'makeup';   name: string; cellIndex: number };

// 執行前先 dry-run 一次，依輸出對應的 cells 狀態填入正確 cellIndex
// 陳亭吟現狀已是 cell[7] @ 5/17，不需動作 → 已移除
const TARGETS: Action[] = [
    { kind: 'makeup', name: '陳俊諺', cellIndex: 0 },
    { kind: 'makeup', name: '鄭郁家', cellIndex: 0 },
];

type Cell = { label: string; description: string; completed: boolean; completed_at: string | null };

function countLines(cells: Cell[]): number {
    let c = 0;
    for (const line of LINES) {
        if (cells[line[0]]?.completed && cells[line[1]]?.completed && cells[line[2]]?.completed) c++;
    }
    return c;
}

async function findUserByName(name: string): Promise<{ UserID: string; Name: string; Score: number } | null> {
    const { data, error } = await supabase
        .from('CharacterStats')
        .select('UserID, Name, Score')
        .eq('Name', name);
    if (error) { console.error(`  ! 查詢 ${name} 失敗:`, error.message); return null; }
    if (!data || data.length === 0) {
        console.error(`  ! 找不到姓名為「${name}」的使用者，嘗試 fuzzy lookup...`);
        const firstChar = name.charAt(0);
        const lastChar = name.charAt(name.length - 1);
        const { data: fuzzy } = await supabase
            .from('CharacterStats')
            .select('UserID, Name')
            .or(`Name.ilike.${firstChar}%,Name.ilike.%${lastChar}`);
        if (fuzzy && fuzzy.length > 0) {
            const candidates = fuzzy.filter(d => d.Name.includes(firstChar) || d.Name.includes(lastChar));
            console.error(`     候選名單（共 ${candidates.length} 筆）:`, candidates.slice(0, 20).map(d => `${d.Name}(${d.UserID})`).join(', '));
        }
        return null;
    }
    if (data.length > 1) {
        console.error(`  ! 姓名為「${name}」的使用者有 ${data.length} 筆：`, data.map(d => d.UserID).join(', '));
        return null;
    }
    return data[0];
}

async function getGrid(userId: string): Promise<{ companion_type: string; cells: Cell[]; cell_score: number } | null> {
    const { data, error } = await supabase
        .from('UserNineGrid')
        .select('companion_type, cells, cell_score')
        .eq('member_id', userId)
        .maybeSingle();
    if (error) { console.error(`  ! 查詢 UserNineGrid 失敗:`, error.message); return null; }
    return data;
}

function summarizeCells(cells: Cell[]): string {
    return cells
        .map((c, i) => `${i}:${c.completed ? '✓' : '·'}${c.completed_at ? `(${c.completed_at.slice(0, 10)})` : ''}`)
        .join('  ');
}

async function handleReassign(userId: string, name: string, requested: number | 'auto') {
    const grid = await getGrid(userId);
    if (!grid) { console.error(`  ! ${name} 沒有 UserNineGrid`); return; }
    console.log(`  cells: ${summarizeCells(grid.cells)}`);

    let cellIndex: number;
    if (requested === 'auto') {
        // 找 completed_at 落在 5/18 (Asia/Taipei) 的格子
        const candidates = grid.cells
            .map((c, i) => ({ i, c }))
            .filter(({ c }) => c.completed && c.completed_at && c.completed_at >= '2026-05-18' && c.completed_at < '2026-05-19');
        if (candidates.length === 0) {
            console.error(`  ! 找不到 5/18 完成的格子（請確認，可能她已被回溯過或按的不是 5/18）`);
            return;
        }
        if (candidates.length > 1) {
            console.error(`  ! 5/18 完成的格子有 ${candidates.length} 個：`, candidates.map(c => c.i).join(', '));
            return;
        }
        cellIndex = candidates[0].i;
        console.log(`  自動偵測到 5/18 完成的格子：cellIndex=${cellIndex}`);
    } else {
        cellIndex = requested;
        const c = grid.cells[cellIndex];
        if (!c?.completed) { console.error(`  ! cell[${cellIndex}] 並未完成，無法 reassign`); return; }
        if (!c.completed_at || !c.completed_at.startsWith('2026-05-18')) {
            console.warn(`  ! 注意：cell[${cellIndex}] 的 completed_at = ${c.completed_at}（不是 5/18）`);
        }
    }

    const newCells = grid.cells.map((c, i) =>
        i === cellIndex ? { ...c, completed_at: TAIPEI_5_17_NOON } : c
    );

    console.log(`  將執行：cell[${cellIndex}] completed_at → ${TAIPEI_5_17_NOON}`);
    console.log(`         DailyLogs (nine_grid_cell|${cellIndex}, nine_grid_line|cell${cellIndex}) Timestamp → ${TAIPEI_5_17_TS}`);

    if (DRY_RUN) { console.log(`  [dry-run] 略過寫入`); return; }

    const { error: gridErr } = await supabase
        .from('UserNineGrid')
        .update({ cells: newCells, updated_at: new Date().toISOString() })
        .eq('member_id', userId);
    if (gridErr) { console.error(`  ! UserNineGrid 更新失敗:`, gridErr.message); return; }

    const { error: cellLogErr } = await supabase
        .from('DailyLogs')
        .update({ Timestamp: TAIPEI_5_17_TS })
        .eq('UserID', userId)
        .eq('QuestID', `nine_grid_cell|${cellIndex}`);
    if (cellLogErr) console.error(`  ! DailyLogs (cell) 更新失敗:`, cellLogErr.message);

    const { error: lineLogErr } = await supabase
        .from('DailyLogs')
        .update({ Timestamp: TAIPEI_5_17_TS })
        .eq('UserID', userId)
        .eq('QuestID', `nine_grid_line|cell${cellIndex}`);
    if (lineLogErr) console.error(`  ! DailyLogs (line) 更新失敗:`, lineLogErr.message);

    console.log(`  ✅ ${name} reassign 完成`);
}

async function handleMakeup(userId: string, name: string, cellIndex: number, currentScore: number) {
    const grid = await getGrid(userId);
    if (!grid) { console.error(`  ! ${name} 沒有 UserNineGrid`); return; }
    console.log(`  companion=${grid.companion_type}, cell_score=${grid.cell_score}`);
    console.log(`  cells: ${summarizeCells(grid.cells)}`);
    console.log(`  current Score: ${currentScore}`);
    if (cellIndex < 0 || cellIndex > 8) {
        console.error(`  ! cellIndex=${cellIndex} 無效，請先以 dry-run 確認後填入正確的 0–8 整數`);
        return;
    }

    const target = grid.cells[cellIndex];
    if (target?.completed) { console.error(`  ! cell[${cellIndex}] 已完成，無需補`); return; }

    const { data: dupLogs } = await supabase
        .from('DailyLogs')
        .select('id')
        .eq('UserID', userId)
        .eq('QuestID', `nine_grid_cell|${cellIndex}`);
    if (dupLogs && dupLogs.length > 0) {
        console.error(`  ! DailyLogs 已有 nine_grid_cell|${cellIndex} 紀錄，跳過`);
        return;
    }

    const oldLines = countLines(grid.cells);
    const newCells = grid.cells.map((c, i) =>
        i === cellIndex ? { ...c, completed: true, completed_at: TAIPEI_5_17_NOON } : c
    );
    const newLines = countLines(newCells);
    const delta = newLines - oldLines;
    const bonus = delta * 3000;

    console.log(`  將執行：cell[${cellIndex}] completed=true, completed_at=${TAIPEI_5_17_NOON}`);
    console.log(`         INSERT DailyLogs nine_grid_cell|${cellIndex} (0 分)`);
    console.log(`         舊連線=${oldLines}, 新連線=${newLines}, 新增=${delta} → bonus=${bonus}`);
    if (delta > 0) {
        console.log(`         INSERT DailyLogs nine_grid_line|cell${cellIndex} (${bonus} 分)`);
        console.log(`         CharacterStats.Score: ${currentScore} → ${currentScore + bonus}`);
    }

    if (DRY_RUN) { console.log(`  [dry-run] 略過寫入`); return; }

    const { error: gridErr } = await supabase
        .from('UserNineGrid')
        .update({ cells: newCells, updated_at: new Date().toISOString() })
        .eq('member_id', userId);
    if (gridErr) { console.error(`  ! UserNineGrid 更新失敗:`, gridErr.message); return; }

    const { error: cellInsErr } = await supabase
        .from('DailyLogs')
        .insert({
            Timestamp: TAIPEI_5_17_TS,
            UserID: userId,
            QuestID: `nine_grid_cell|${cellIndex}`,
            QuestTitle: '九宮格格子完成（admin 補登 5/17）',
            RewardPoints: 0,
        });
    if (cellInsErr) { console.error(`  ! DailyLogs (cell) 寫入失敗:`, cellInsErr.message); return; }

    if (delta > 0) {
        const { error: lineInsErr } = await supabase
            .from('DailyLogs')
            .insert({
                Timestamp: TAIPEI_5_17_TS,
                UserID: userId,
                QuestID: `nine_grid_line|cell${cellIndex}`,
                QuestTitle: `九宮格連線加分（${delta} 條）（admin 補登 5/17）`,
                RewardPoints: bonus,
            });
        if (lineInsErr) console.error(`  ! DailyLogs (line) 寫入失敗:`, lineInsErr.message);

        const { error: scoreErr } = await supabase
            .from('CharacterStats')
            .update({ Score: currentScore + bonus })
            .eq('UserID', userId);
        if (scoreErr) console.error(`  ! CharacterStats Score 更新失敗:`, scoreErr.message);
    }

    console.log(`  ✅ ${name} makeup 完成（cell ${cellIndex}, +${bonus} 分）`);
}

async function main() {
    console.log(`=== 5/17 九宮格特殊情況補救 ===`);
    console.log(`Mode: ${DRY_RUN ? 'DRY-RUN（不寫入）' : 'APPLY（寫入 DB）'}`);
    console.log();

    for (const t of TARGETS) {
        console.log(`── ${t.name} (${t.kind}) ──`);
        const u = await findUserByName(t.name);
        if (!u) { console.log(); continue; }
        console.log(`  UserID=${u.UserID}`);

        if (t.kind === 'reassign') {
            await handleReassign(u.UserID, t.name, t.cellIndex);
        } else {
            await handleMakeup(u.UserID, t.name, t.cellIndex, u.Score ?? 0);
        }
        console.log();
    }

    console.log(`=== 完成（${DRY_RUN ? 'dry-run' : 'applied'}）===`);
}

main().catch(e => { console.error(e); process.exit(1); });
