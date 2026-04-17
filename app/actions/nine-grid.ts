'use server';

import { createClient } from '@supabase/supabase-js';
import { NineGridTemplate, UserNineGrid, UserNineGridCell } from '@/types';
import { processCheckInTransaction } from '@/app/actions/quest';
import { logAdminAction } from '@/app/actions/admin';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

import { COMPANION_TYPES, type CompanionType } from '@/lib/constants';

// ── 九宮格連線檢查（3格連線：橫3 + 直3 + 斜2 = 8條）───────────────────────
const NINE_GRID_LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // 橫
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // 直
    [0, 4, 8], [2, 4, 6],             // 斜
];

function countCompletedLines(cells: UserNineGridCell[]): number {
    return NINE_GRID_LINES.filter(([a, b, c]) =>
        cells[a]?.completed && cells[b]?.completed && cells[c]?.completed
    ).length;
}

// ── 管理員：取得所有公版模板 ──────────────────────────────────────────────────
export async function getTemplates(): Promise<{ success: boolean; templates: NineGridTemplate[]; error?: string }> {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
        .from('NineGridTemplates')
        .select('*')
        .order('id');

    if (error) return { success: false, templates: [], error: error.message };
    return { success: true, templates: (data || []) as NineGridTemplate[] };
}

// ── 管理員：更新公版模板內容與每格分數 ─────────────────────────────────────────
export async function updateTemplate(
    companionType: CompanionType,
    cells: { label: string; description: string }[],
    cellScore: number,
    adminName: string
) {
    if (cells.length !== 9) return { success: false, error: '九宮格必須恰好9個格子' };
    if (cellScore < 0) return { success: false, error: '每格分數不可為負數' };

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { error } = await supabase
        .from('NineGridTemplates')
        .update({ cells, cell_score: cellScore, updated_at: new Date().toISOString() })
        .eq('companion_type', companionType);

    if (error) return { success: false, error: '模板更新失敗：' + error.message };

    await logAdminAction('update_nine_grid_template', adminName, companionType, companionType, {
        cellScore,
        cellCount: cells.length,
    });

    return { success: true };
}

// ── 學員：初始化個人九宮格（從公版模板複製）────────────────────────────────────
export async function initMemberGrid(userId: string, companionType: CompanionType) {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 取得公版模板
    const { data: template } = await supabase
        .from('NineGridTemplates')
        .select('cells, cell_score')
        .eq('companion_type', companionType)
        .single();

    if (!template) return { success: false, error: `找不到「${companionType}」的公版模板` };

    // 轉為含完成狀態的格子
    const cells: UserNineGridCell[] = (template.cells as { label: string; description: string }[]).map(c => ({
        ...c,
        completed: false,
        completed_at: null,
    }));

    // upsert（允許重新選擇旅伴，但會重置進度）
    const { error } = await supabase
        .from('UserNineGrid')
        .upsert({
            member_id: userId,
            companion_type: companionType,
            cells,
            cell_score: template.cell_score,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'member_id' });

    if (error) return { success: false, error: '初始化失敗：' + error.message };
    return { success: true };
}

// ── 學員：取得個人九宮格 ──────────────────────────────────────────────────────
export async function getMemberGrid(userId: string): Promise<{ success: boolean; grid: UserNineGrid | null; error?: string }> {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
        .from('UserNineGrid')
        .select('*')
        .eq('member_id', userId)
        .maybeSingle();

    if (error) return { success: false, grid: null, error: error.message };
    return { success: true, grid: data as UserNineGrid | null };
}

// ── 學員：完成一格打卡 ────────────────────────────────────────────────────────
export async function completeCell(userId: string, userName: string, cellIndex: number) {
    if (cellIndex < 0 || cellIndex > 8) return { success: false, error: '格子索引無效' };

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: gridRow } = await supabase
        .from('UserNineGrid')
        .select('*')
        .eq('member_id', userId)
        .single();

    if (!gridRow) return { success: false, error: '尚未初始化九宮格，請先選擇旅伴' };

    const cells: UserNineGridCell[] = gridRow.cells;
    if (cells[cellIndex].completed) return { success: false, error: '此格已完成，不可重複打卡' };

    // 標記格子完成
    const prevLines = countCompletedLines(cells);
    cells[cellIndex] = { ...cells[cellIndex], completed: true, completed_at: new Date().toISOString() };
    const newLines = countCompletedLines(cells);

    // 更新 DB
    const { error: updateErr } = await supabase
        .from('UserNineGrid')
        .update({ cells, updated_at: new Date().toISOString() })
        .eq('member_id', userId);

    if (updateErr) return { success: false, error: '更新失敗：' + updateErr.message };

    // 發放格子分數
    const cellScore = gridRow.cell_score as number;
    const cellQuestId = `nine_grid_cell|${cellIndex}`;
    const cellResult = await processCheckInTransaction(userId, cellQuestId, `九宮格第${cellIndex + 1}格`, cellScore);
    if (!cellResult.success) {
        return { success: true, warning: `格子已標記完成，但分數入帳失敗：${cellResult.error}` };
    }

    // 發放連線獎勵（每條+300，最多8條）
    const newLineCount = newLines - prevLines;
    let lineBonus = 0;
    if (newLineCount > 0) {
        lineBonus = newLineCount * 300;
        const lineQuestId = `nine_grid_line|cell${cellIndex}`;
        await processCheckInTransaction(userId, lineQuestId, `九宮格連線加分（${newLineCount}條）`, lineBonus);
    }

    return {
        success: true,
        cellScore,
        lineBonus,
        newLinesCompleted: newLineCount,
        totalLinesCompleted: newLines,
    };
}

// ── 小隊長：替學員修改格子文字 ───────────────────────────────────────────────
export async function updateMemberCellText(
    captainId: string,
    captainName: string,
    memberId: string,
    memberName: string,
    cellIndex: number,
    label: string,
    description: string
) {
    if (cellIndex < 0 || cellIndex > 8) return { success: false, error: '格子索引無效' };

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 驗證操作者為小隊長
    const { data: captain } = await supabase
        .from('CharacterStats')
        .select('IsCaptain, TeamName')
        .eq('UserID', captainId)
        .single();

    if (!captain?.IsCaptain) return { success: false, error: '僅限小隊長修改組員格子文字' };

    // 驗證被修改者為同小隊
    const { data: member } = await supabase
        .from('CharacterStats')
        .select('TeamName')
        .eq('UserID', memberId)
        .single();

    if (!member || member.TeamName !== captain.TeamName) {
        return { success: false, error: '只能修改本小隊組員的九宮格' };
    }

    const { data: gridRow } = await supabase
        .from('UserNineGrid')
        .select('cells')
        .eq('member_id', memberId)
        .single();

    if (!gridRow) return { success: false, error: '該組員尚未初始化九宮格' };

    const cells: UserNineGridCell[] = gridRow.cells;
    cells[cellIndex] = { ...cells[cellIndex], label: label.trim(), description: description.trim() };

    const { error } = await supabase
        .from('UserNineGrid')
        .update({ cells, updated_at: new Date().toISOString() })
        .eq('member_id', memberId);

    if (error) return { success: false, error: '更新失敗：' + error.message };

    await logAdminAction('captain_edit_nine_grid_cell', captainName, memberId, memberName, {
        cellIndex,
        label: label.trim(),
    });

    return { success: true };
}

// ── 小隊長：查看小隊所有成員的九宮格 ─────────────────────────────────────────
export async function getSquadGrids(captainId: string): Promise<{ success: boolean; grids: (UserNineGrid & { user_name: string })[]; error?: string }> {
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: captain } = await supabase
        .from('CharacterStats')
        .select('IsCaptain, TeamName')
        .eq('UserID', captainId)
        .single();

    if (!captain?.IsCaptain) return { success: false, grids: [], error: '僅限小隊長查看' };

    // 取得小隊所有成員 ID 與姓名
    const { data: members } = await supabase
        .from('CharacterStats')
        .select('UserID, Name')
        .eq('TeamName', captain.TeamName);

    if (!members?.length) return { success: true, grids: [] };

    const memberIds = members.map(m => m.UserID);
    const nameMap = Object.fromEntries(members.map(m => [m.UserID, m.Name]));

    const { data: grids, error } = await supabase
        .from('UserNineGrid')
        .select('*')
        .in('member_id', memberIds);

    if (error) return { success: false, grids: [], error: error.message };

    const result = (grids || []).map(g => ({ ...g, user_name: nameMap[g.member_id] || g.member_id }));
    return { success: true, grids: result as (UserNineGrid & { user_name: string })[] };
}
