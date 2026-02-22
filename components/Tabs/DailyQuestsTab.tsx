import React from 'react';
import { Flame, Coins } from 'lucide-react';
import { Quest, DailyLog, SystemSettings } from '@/types';
import { DAILY_QUEST_CONFIG, PENALTY_PER_DAY } from '@/lib/constants';
import { getLogicalDateStr } from '@/lib/utils/time';

interface DailyQuestsTabProps {
    systemSettings: SystemSettings;
    logs: DailyLog[];
    logicalTodayStr: string;
    onCheckIn: (q: Quest) => void;
    onUndo: (q: Quest) => void;
    formatCheckInTime: (timestamp: string) => string;
}

export function DailyQuestsTab({ systemSettings, logs, logicalTodayStr, onCheckIn, onUndo, formatCheckInTime }: DailyQuestsTabProps) {
    return (
        <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500 text-center mx-auto">
            <div className="bg-red-900/20 border-2 border-red-500/40 rounded-4xl p-6 shadow-2xl text-center mx-auto">
                <div className="flex items-center gap-2 justify-center text-red-400 font-black text-xs uppercase mb-2 tracking-widest"><Flame size={16} /> 本週指定必修</div>
                <h2 className="text-2xl font-black text-white italic mx-auto">「{DAILY_QUEST_CONFIG.find(q => q.id === systemSettings.MandatoryQuestId)?.title}」</h2>
                <div className="mt-4 py-3 bg-red-600 text-white rounded-xl text-xs font-black mx-auto shadow-lg flex items-center justify-center gap-2 tracking-widest uppercase"><Coins size={14} /> 逾期罰金：NT$ {PENALTY_PER_DAY}</div>
            </div>
            {DAILY_QUEST_CONFIG.map(q => {
                const isDone = logs.some(l => l.QuestID === q.id && getLogicalDateStr(l.Timestamp) === logicalTodayStr);
                const questLog = logs.find(l => l.QuestID === q.id && getLogicalDateStr(l.Timestamp) === logicalTodayStr);
                return (
                    <button key={q.id} onClick={() => !isDone ? onCheckIn(q) : onUndo(q)} className={`relative w-full p-6 rounded-3xl border-2 flex items-center gap-4 transition-all ${isDone ? 'bg-emerald-500/10 border-emerald-500/40 opacity-70' : q.id === systemSettings.MandatoryQuestId ? 'bg-slate-900 border-red-600 shadow-[0_0_15px_rgba(220,38,38,0.2)]' : 'bg-slate-900 border-white/5'}`}>
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl ${isDone ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-orange-500'}`}>{isDone ? '✓' : '✧'}</div>
                        <div className="flex-1 text-left"><h3 className={`font-black text-lg ${isDone ? 'text-emerald-400' : 'text-white'}`}>{q.title}</h3><p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{q.sub}</p></div>
                        <div className="font-black text-orange-500 text-right">+{q.reward}</div>
                        {isDone && questLog && <div className="absolute bottom-1 right-2 text-[8px] font-mono text-emerald-500 opacity-60">{formatCheckInTime(questLog.Timestamp)}</div>}
                    </button>
                );
            })}
        </div>
    );
}
