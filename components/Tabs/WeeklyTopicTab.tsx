import React from 'react';
import { Quest, DailyLog, SystemSettings } from '@/types';
import { WEEKLY_QUEST_CONFIG } from '@/lib/constants';
import { getLogicalDateStr } from '@/lib/utils/time';

interface WeeklyTopicTabProps {
    systemSettings: SystemSettings;
    logs: DailyLog[];
    currentWeeklyMonday: Date;
    isTopicDone: boolean;
    onCheckIn: (q: Quest) => void;
    onUndo: (q: Quest) => void;
}

export function WeeklyTopicTab({ systemSettings, logs, currentWeeklyMonday, isTopicDone, onCheckIn, onUndo }: WeeklyTopicTabProps) {
    return (
        <div className="space-y-8 animate-in slide-in-from-right-8 duration-500 text-center mx-auto text-center">
            <div className="p-8 rounded-4xl border-2 border-yellow-500/50 bg-yellow-500/5 shadow-2xl relative overflow-hidden text-center mx-auto">
                <div className="flex items-center gap-6 mb-6 text-left text-center justify-center">
                    <div className="text-6xl mx-auto">🎯</div>
                    <div className="flex-1">
                        <span className="bg-yellow-500 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full uppercase mb-1 inline-block">雙週挑戰</span>
                        <h3 className="text-2xl font-black text-white italic uppercase">主題親證</h3>
                        <p className="text-sm text-yellow-400 font-bold mt-1 italic">「{systemSettings.TopicQuestTitle}」</p>
                    </div>
                    <div className="text-sm font-black text-yellow-500 bg-yellow-500/10 px-3 py-1 rounded-xl">+1000</div>
                </div>
                <button
                    onClick={() => !isTopicDone ? onCheckIn({ id: 't1', title: '主題親證', reward: 1000 }) : onUndo({ id: 't1', title: '主題親證', reward: 1000 })}
                    className={`w-full py-4 rounded-2xl font-black text-lg transition-all ${isTopicDone ? 'bg-emerald-600/20 text-emerald-400 shadow-inner' : 'bg-yellow-500 text-slate-950 shadow-lg active:scale-95'}`}>
                    {isTopicDone ? "本期已圓滿 (點擊回溯) ✓" : "回報主題修行"}
                </button>
            </div>

            {WEEKLY_QUEST_CONFIG.map(q => {
                const comps = logs.filter(l => l.QuestID.startsWith(q.id) && new Date(l.Timestamp) >= currentWeeklyMonday).length;
                const isMax = q.limit !== 99 && comps >= (q.limit || 0);
                return (
                    <div key={q.id} className={`p-8 rounded-4xl bg-slate-900 border border-white/5 shadow-2xl ${isMax ? 'opacity-50 grayscale' : ''}`}>
                        <div className="flex items-center gap-6 mb-8 text-left text-center justify-center mx-auto">
                            <div className="text-6xl mx-auto">{q.icon}</div>
                            <div className="flex-1 text-left">
                                <h3 className="text-2xl font-black text-white">{q.title}</h3>
                                <p className="text-sm text-slate-400 font-bold italic">{q.sub}</p>
                            </div>
                            <div className="text-sm font-black text-blue-400 bg-blue-400/10 px-3 py-1 rounded-xl">+$ {q.reward}</div>
                        </div>
                        <div className="flex justify-between items-center px-2 mx-auto">
                            {['一', '二', '三', '四', '五', '六', '日'].map((day, idx) => {
                                const d = new Date();
                                const currentDay = d.getDay() || 7;
                                const diff = (idx + 1) - currentDay;
                                d.setDate(d.getDate() + diff);
                                const qId = `${q.id}|${getLogicalDateStr(d)}`;
                                const isDone = logs.some(l => l.QuestID === qId);
                                return (
                                    <button key={idx} title={`${day}`} onClick={() => !isDone ? (!isMax && onCheckIn({ ...q, id: qId })) : onUndo({ ...q, id: qId })} className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all ${isDone ? 'bg-orange-500 text-white shadow-lg' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'}`}>{day}</button>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
