'use client';
import React from 'react';
import { DailyLog } from '@/types';
import { getTaipeiDateStr, getLogicalDateStr } from '@/lib/utils/time';

// 週曆打卡列：以父層傳入的 currentWeeklyMonday（純週一錨）為準，顯示週一-週日 7 格。
// 不受賽季 W1 8 天特例影響（5/10 那天不出現在按鈕列，但 wk1|2026-05-10 仍可透過其他流程記錄）。
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
                // 主要用曆法日（getTaipeiDateStr）比對，避免相鄰按鈕因格式差一天互相認領（鬼打勾 bug）
                const qIdCalendar = `${questId}|${getTaipeiDateStr(d)}`;
                let matched = logs.find(l => l.QuestID === qIdCalendar);
                // 僅週一格（idx===0）額外比對「前一個週日」的偏移格式紀錄：
                // 舊快取 handler 把週一點擊存成前一日（週日），這些紀錄落在上週按鈕、本週看不到。
                // 週日 fallback 不會鬼打勾，因為前一日(上週日)不在本週其餘 6 格的曆法日範圍內。
                if (!matched && idx === 0) {
                    const qIdShifted = `${questId}|${getLogicalDateStr(d)}`;
                    matched = logs.find(l => l.QuestID === qIdShifted);
                }
                const isDone = !!matched;
                const doneQId = matched?.QuestID ?? qIdCalendar; // 回朔時用實際比對到的 QuestID
                const isDisabled = disabled && !isDone;
                return (
                    <div key={idx} className="flex flex-col items-center gap-1.5">
                        <span className="text-sm text-gray-500 font-mono">{d.getMonth() + 1}/{d.getDate()}</span>
                        <button
                            disabled={isDisabled}
                            onClick={() => isDone ? onUndo(doneQId, d) : onCheckIn(questId, d)}
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
