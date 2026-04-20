'use client';
import React from 'react';
import { DailyLog } from '@/types';
import { getLogicalDateStr } from '@/lib/utils/time';

// 週曆打卡列：以父層傳入的 currentWeeklyMonday 為準，
// 避免在渲染時重呼 new Date() 導致跨午夜顯示錯亂。
export function WeekCalendarRow({
    questId,
    logs,
    disabled,
    currentWeeklyMonday,
    onCheckIn,
    onUndo,
}: {
    questId: string;
    logs: DailyLog[];
    disabled: boolean;
    currentWeeklyMonday: Date;
    onCheckIn: (qId: string, day: Date) => void;
    onUndo: (qId: string, day: Date) => void;
}) {
    return (
        <div className="flex justify-between items-center px-1">
            {['一', '二', '三', '四', '五', '六', '日'].map((dayLabel, idx) => {
                const d = new Date(currentWeeklyMonday);
                d.setDate(d.getDate() + idx);
                const qId = `${questId}|${getLogicalDateStr(d)}`;
                const isDone = logs.some(l => l.QuestID === qId);
                const isDisabled = disabled && !isDone;
                return (
                    <div key={idx} className="flex flex-col items-center gap-1.5">
                        <span className="text-sm text-gray-500 font-mono">{d.getMonth() + 1}/{d.getDate()}</span>
                        <button
                            disabled={isDisabled}
                            onClick={() => isDone ? onUndo(questId, d) : onCheckIn(questId, d)}
                            className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all
                                ${isDone
                                    ? 'bg-[#C0392B] text-white shadow-lg'
                                    : isDisabled
                                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                        : 'bg-[#F5FAF7] text-gray-500 border border-[#B2DFC0] hover:bg-[#B2DFC0] hover:text-[#1A6B4A] active:scale-90'}`}
                        >
                            {dayLabel}
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
