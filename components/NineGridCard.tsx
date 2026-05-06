'use client';

import React from 'react';
import { CheckCircle2, Circle, Grid3X3, Award, RotateCcw } from 'lucide-react';
import { UserNineGrid } from '@/types';
import { completeCell, undoNineGridCellSelf } from '@/app/actions/nine-grid';
import { FORTUNE_COMPANIONS } from '@/components/Login/RegisterForm';

// 8條連線定義（橫3 + 直3 + 斜2）
const NINE_GRID_LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
];

function getCompletedLines(cells: { completed: boolean }[]): number[][] {
    return NINE_GRID_LINES.filter(([a, b, c]) =>
        cells[a]?.completed && cells[b]?.completed && cells[c]?.completed
    );
}

// 取旅伴代表色，家庭運用稍亮版避免與白底對比不足
const COMPANION_COLORS: Record<string, string> = {
    '事業運': '#27AE60',
    '財富運': '#F39C12',
    '情感運': '#7F8C8D',
    '家庭運': '#2E8B5A',
    '體能運': '#2E86C1',
};

function getCompanionColor(companionType: string): string {
    return COMPANION_COLORS[companionType]
        ?? FORTUNE_COMPANIONS.find(f => f.companion === companionType)?.color
        ?? '#1A6B4A';
}

interface NineGridCardProps {
    grid: UserNineGrid;
    userId: string;
    userName: string;
    onRefresh: () => void;
    currentWeeklyMonday: Date;
}

export function NineGridCard({ grid, userId, userName, onRefresh, currentWeeklyMonday }: NineGridCardProps) {
    const [completing, setCompleting] = React.useState<number | null>(null);
    const [undoing, setUndoing] = React.useState<number | null>(null);
    const [msg, setMsg] = React.useState('');
    const completingRef = React.useRef<number | null>(null);

    const color = getCompanionColor(grid.companion_type);
    const completedLines = getCompletedLines(grid.cells);
    const completedCells = grid.cells.filter(c => c.completed).length;
    const lineBonus = completedLines.length * 3000;
    const highlightedIndices = new Set(completedLines.flat());

    const thisWeekCells = new Set(
        grid.cells
            .map((c, i) => (c.completed && c.completed_at && new Date(c.completed_at) >= currentWeeklyMonday ? i : -1))
            .filter(i => i >= 0)
    );
    const hasCompletedThisWeek = thisWeekCells.size > 0;

    const handleComplete = async (idx: number) => {
        if (grid.cells[idx].completed) return;
        if (completingRef.current !== null) return;
        completingRef.current = idx;
        setCompleting(idx);
        setMsg('');
        try {
            const res = await completeCell(userId, userName, idx);
            if (res.success) {
                if (res.lineBonus && res.lineBonus > 0) setMsg(`連線獎勵 +${res.lineBonus}！`);
                onRefresh();
            } else {
                setMsg('失敗：' + (res as { error?: string }).error);
            }
        } finally {
            completingRef.current = null;
            setCompleting(null);
        }
    };

    const handleUndo = async (idx: number) => {
        if (undoing !== null) return;
        setUndoing(idx);
        setMsg('');
        try {
            const res = await undoNineGridCellSelf(userId, idx);
            if (res.success) {
                setMsg(res.scoreReversed > 0 ? `回溯成功，已扣回 ${res.scoreReversed} 分連線獎勵` : '回溯成功');
                onRefresh();
            } else {
                setMsg('失敗：' + (res as { error?: string }).error);
            }
        } finally {
            setUndoing(null);
        }
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Grid3X3 size={16} style={{ color }} />
                    <span className="text-sm font-black" style={{ color }}>人生大戲九宮格</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full border"
                        style={{ color, background: `${color}18`, borderColor: `${color}40` }}>
                        {FORTUNE_COMPANIONS.find(f => f.companion === grid.companion_type)?.name ?? grid.companion_type}
                    </span>
                </div>
                <div className="text-right">
                    <p className="text-xs text-[#5A7A5A]">{completedCells}/9 格完成</p>
                    <p className={`text-xs font-bold ${hasCompletedThisWeek ? 'text-amber-600' : 'text-gray-400'}`}>
                        本週 {thisWeekCells.size}/1 格
                    </p>
                    {lineBonus > 0 && <p className="text-xs font-black" style={{ color }}>連線 +{lineBonus} 分</p>}
                </div>
            </div>

            {/* Progress bar */}
            <div className="h-2 bg-[#E8F0EB] rounded-full overflow-hidden">
                <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${(completedCells / 9) * 100}%`, background: color }}
                />
            </div>

            {/* 3×3 grid */}
            <div className="grid grid-cols-3 gap-2">
                {grid.cells.map((cell, idx) => {
                    const isCompleted = cell.completed;
                    const isHighlighted = highlightedIndices.has(idx);
                    const isLoading = completing === idx;
                    const isUndoing = undoing === idx;
                    const isThisWeek = thisWeekCells.has(idx);
                    const isWeeklyBlocked = !isCompleted && hasCompletedThisWeek;

                    const cellStyle = isCompleted
                        ? isHighlighted
                            ? { background: `${color}20`, borderColor: `${color}60` }
                            : { background: '#F5F8F6', borderColor: '#D0E4D8' }
                        : isWeeklyBlocked
                            ? { background: '#F5F5F5', borderColor: '#E0E0E0' }
                            : { background: '#FFFFFF', borderColor: '#D0E4D8' };

                    const cellContent = (
                        <div className="flex flex-col gap-1 h-full">
                            <div className="flex items-start justify-between gap-1">
                                <span className={`text-xs font-black leading-tight flex-1 ${
                                    isCompleted && !isHighlighted ? 'text-[#5A7A5A] line-through'
                                    : isWeeklyBlocked ? 'text-gray-400'
                                    : 'text-[#1A2A1A]'
                                }`} style={isHighlighted ? { color } : {}}>
                                    {cell.label || `任務 ${idx + 1}`}
                                </span>
                                {isCompleted && isThisWeek ? (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleUndo(idx); }}
                                        disabled={isUndoing}
                                        className="shrink-0 text-[#A8C4B0] hover:text-[#C0392B] transition-colors disabled:opacity-50"
                                        title="回溯本格"
                                    >
                                        <RotateCcw size={13} className={isUndoing ? 'animate-spin' : ''} />
                                    </button>
                                ) : isCompleted ? (
                                    <CheckCircle2 size={14} className="shrink-0" style={{ color: isHighlighted ? color : '#A8C4B0' }} />
                                ) : (
                                    <Circle size={14} className={`shrink-0 ${isWeeklyBlocked ? 'text-gray-300' : 'text-[#C8DDD0]'}`} />
                                )}
                            </div>
                            {cell.description && (
                                <p className={`text-[10px] leading-tight line-clamp-2 ${isWeeklyBlocked ? 'text-gray-400' : 'text-[#7A9A7A]'}`}>{cell.description}</p>
                            )}
                            {isCompleted && cell.completed_at && (
                                <p className="text-[9px] text-[#A8C4B0] mt-auto">
                                    {new Date(cell.completed_at).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' })}
                                </p>
                            )}
                            {isLoading && <p className="text-[10px] mt-auto font-bold" style={{ color }}>記錄中...</p>}
                            {isUndoing && <p className="text-[10px] mt-auto font-bold text-[#C0392B]">回溯中...</p>}
                            {isWeeklyBlocked && <p className="text-[9px] text-gray-400 mt-auto">本週已選</p>}
                        </div>
                    );

                    return isCompleted ? (
                        <div
                            key={idx}
                            className="relative p-3 rounded-2xl border-2 text-left min-h-[80px]"
                            style={cellStyle}
                        >
                            {cellContent}
                        </div>
                    ) : (
                        <button
                            key={idx}
                            onClick={() => handleComplete(idx)}
                            disabled={isWeeklyBlocked || isLoading}
                            className={`relative p-3 rounded-2xl border-2 text-left transition-all min-h-[80px] ${
                                isWeeklyBlocked ? 'cursor-not-allowed opacity-60' : 'hover:shadow-md active:scale-95'
                            }`}
                            style={cellStyle}
                        >
                            {cellContent}
                        </button>
                    );
                })}
            </div>

            {/* Completed lines */}
            {completedLines.length > 0 && (
                <div className="flex items-center gap-2 rounded-2xl p-3 border"
                    style={{ background: `${color}10`, borderColor: `${color}30` }}>
                    <Award size={14} className="shrink-0" style={{ color }} />
                    <p className="text-xs font-bold" style={{ color }}>
                        已完成 {completedLines.length} 條連線！連線獎勵 +{lineBonus} 分
                        <span className="opacity-50">（上限 8 條）</span>
                    </p>
                </div>
            )}

            {/* Score breakdown */}
            {lineBonus > 0 && (
                <div className="flex gap-3 text-[10px] text-[#7A9A7A]">
                    <span>連線獎勵：{lineBonus}</span>
                    <span className="font-black" style={{ color }}>合計：{lineBonus}</span>
                </div>
            )}

            {/* Feedback message */}
            {msg && (
                <p className={`text-xs font-bold text-center py-2 px-4 rounded-xl border ${
                    msg.startsWith('失敗') ? 'text-[#C0392B] bg-red-50 border-red-200' : 'border'
                }`}
                style={!msg.startsWith('失敗') ? { color, background: `${color}10`, borderColor: `${color}30` } : {}}>
                    {msg}
                </p>
            )}
        </div>
    );
}
