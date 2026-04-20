'use server';

import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { NineGridTemplate, UserNineGrid, UserNineGridCell } from '@/types';
import { logAdminAction } from '@/app/actions/admin';
import { requireSelf, authErrorResponse } from '@/lib/auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

import { type CompanionType } from '@/lib/constants';

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
        .update({ cells, cell_score: cellScore })
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
    try { await requireSelf(userId); } catch (e) { return authErrorResponse(e)!; }

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
// 走 DB RPC process_nine_grid_cell：RPC 以 SELECT FOR UPDATE 鎖定 UserNineGrid row，
// 在同一 transaction 完成 cells 更新、DailyLogs 記錄、連線加分，避免 race condition。
export async function completeCell(userId: string, _userName: string, cellIndex: number) {
    try { await requireSelf(userId); } catch (e) { return authErrorResponse(e)!; }
    if (cellIndex < 0 || cellIndex > 8) return { success: false, error: '格子索引無效' };

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase.rpc('process_nine_grid_cell', {
        p_user_id: userId,
        p_cell_index: cellIndex,
    });

    if (error) return { success: false, error: 'RPC 錯誤：' + error.message };
    if (!data || data.success === false) {
        return { success: false, error: (data && data.error) || '打卡失敗' };
    }

    return {
        success: true,
        lineBonus: data.lineBonus ?? 0,
        newLinesCompleted: data.newLinesCompleted ?? 0,
        totalLinesCompleted: data.totalLinesCompleted ?? 0,
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
    try { await requireSelf(captainId); } catch (e) { return authErrorResponse(e)!; }
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
        .update({ cells })
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
    try { await requireSelf(captainId); } catch (e) {
        const r = authErrorResponse(e)!;
        return { success: false, grids: [], error: r.error };
    }

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

    const { data: grids, error } = await supabase
        .from('UserNineGrid')
        .select('*')
        .in('member_id', memberIds);

    if (error) return { success: false, grids: [], error: error.message };

    const gridMap = Object.fromEntries((grids || []).map(g => [g.member_id, g]));

    // 包含所有小隊成員，未初始化者以 null 填充（UI 顯示「尚未初始化」）
    const result = members.map(m => {
        const grid = gridMap[m.UserID];
        if (grid) return { ...grid, user_name: m.Name };
        return {
            member_id: m.UserID,
            user_name: m.Name,
            companion_type: null,
            cells: [],
        };
    });
    return { success: true, grids: result as (UserNineGrid & { user_name: string })[] };
}
