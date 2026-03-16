import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Quest, DailyLog } from '@/types';
import { DAILY_QUEST_CONFIG } from '@/lib/constants';
import { getLogicalDateStr } from '@/lib/utils/time';

// Sprite sheet: 3×3 grid, each icon at (col%, row%)
const QUEST_ICON_POS: Record<string, string> = {
    q1: '100% 100%',
    q2: '0% 100%',
    q3: '100% 50%',
    q4: '0% 0%',
    q5: '50% 100%',
    q6: '100% 0%',
    q7: '0% 50%',
    q8: '50% 0%',
    q9: '50% 50%',
};

function QuestIcon({ questId, isDone }: { questId: string; isDone: boolean }) {
    const pos = QUEST_ICON_POS[questId];
    if (isDone) {
        return (
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl shrink-0 bg-emerald-500 text-white">✓</div>
        );
    }
    if (pos) {
        return (
            <div className="w-12 h-12 rounded-2xl shrink-0 bg-slate-800" style={{
                backgroundImage: 'url(/quest-icons.png)',
                backgroundSize: '300% 300%',
                backgroundPosition: pos,
                backgroundRepeat: 'no-repeat',
            }} />
        );
    }
    return (
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl shrink-0 bg-slate-800 text-orange-500">✧</div>
    );
}


interface DailyQuestsTabProps {
    weeklyQuestId?: string;
    logs: DailyLog[];
    logicalTodayStr: string;
    userInventory: string[];
    onCheckIn: (q: Quest) => void;
    onUndo: (q: Quest) => void;
    formatCheckInTime: (timestamp: string) => string;
}

function Q1Card({ q, isDone, questLog, isDawn, setIsDawn, hasMirror, activeMandatoryId, onCheckIn, onUndo, formatCheckInTime }: {
    q: Quest; isDone: boolean; questLog?: DailyLog; isDawn: boolean;
    setIsDawn: (v: boolean) => void; hasMirror: boolean; activeMandatoryId: string;
    onCheckIn: (q: Quest) => void; onUndo: (q: Quest) => void;
    formatCheckInTime: (timestamp: string) => string;
}) {
    const handleCheckIn = () => {
        if (isDone) { onUndo(q); return; }
        if (isDawn) {
            onCheckIn({ ...q, id: 'q1_dawn', title: '打拳（破曉）', reward: 200 });
        } else {
            onCheckIn(q);
        }
    };
    return (
        <div className={`relative w-full p-6 rounded-3xl border-2 transition-all ${isDone ? 'bg-emerald-500/10 border-emerald-500/40 opacity-70' : q.id === activeMandatoryId ? 'bg-slate-900 border-red-600 shadow-[0_0_15px_rgba(220,38,38,0.2)]' : 'bg-slate-900 border-white/5'}`}>
            <button onClick={handleCheckIn} className="flex items-center gap-4 w-full text-left">
                <QuestIcon questId="q1" isDone={isDone} />
                <div className="flex-1">
                    <h3 className={`font-black text-lg ${isDone ? 'text-emerald-400' : 'text-white'}`}>{q.title}</h3>
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{q.sub}</p>
                </div>
                <div className="text-right">
                    <div className="font-black text-orange-500">{isDawn && hasMirror ? '+350' : `+${q.reward}`} 修為</div>
                    <div className="text-xs font-bold text-yellow-400 mt-0.5">+{isDawn && hasMirror ? 35 : Math.floor(q.reward * 0.1)} 🪙</div>
                </div>
            </button>
            {!isDone && (
                <label className="flex items-center gap-2 mt-3 ml-16 cursor-pointer select-none" onClick={e => e.stopPropagation()}>
                    <input
                        type="checkbox"
                        checked={isDawn}
                        onChange={e => setIsDawn(e.target.checked)}
                        className="w-4 h-4 rounded accent-orange-500"
                    />
                    <span className="text-xs text-slate-400 font-bold">
                        本次為破曉打拳（05:00–08:00 完成）
                        {hasMirror && <span className="text-orange-400 ml-1">+150 修為</span>}
                    </span>
                </label>
            )}
            {isDone && questLog && <div className="absolute bottom-1 right-2 text-[8px] font-mono text-emerald-500 opacity-60">{formatCheckInTime(questLog.Timestamp)}</div>}
        </div>
    );
}

export function DailyQuestsTab({ weeklyQuestId, logs, logicalTodayStr, userInventory, onCheckIn, onUndo, formatCheckInTime }: DailyQuestsTabProps) {
    const [isDawnMode, setIsDawnMode] = useState(false);
    const hasMirror = userInventory.includes('a2');
    const weeklyQuestName = DAILY_QUEST_CONFIG.find(q => q.id === weeklyQuestId)?.title;

    return (
        <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500 text-center mx-auto">
            <div className="bg-indigo-900/20 border-2 border-indigo-500/30 rounded-4xl p-6 shadow-2xl text-center mx-auto">
                <div className="flex items-center gap-2 justify-center text-indigo-400 font-black text-xs uppercase mb-2 tracking-widest"><Sparkles size={16} /> 本週推薦定課</div>
                {weeklyQuestName
                    ? <h2 className="text-2xl font-black text-white italic mx-auto">「{weeklyQuestName}」</h2>
                    : <p className="text-sm text-slate-500 font-bold">隊長尚未抽選，敬請期待</p>
                }
            </div>
            {DAILY_QUEST_CONFIG.map(q => {
                if (q.id === 'q1') {
                    const isDone = logs.some(l =>
                        (l.QuestID === 'q1' || l.QuestID === 'q1_dawn') &&
                        getLogicalDateStr(l.Timestamp) === logicalTodayStr
                    );
                    const questLog = logs.find(l =>
                        (l.QuestID === 'q1' || l.QuestID === 'q1_dawn') &&
                        getLogicalDateStr(l.Timestamp) === logicalTodayStr
                    );
                    return (
                        <Q1Card
                            key="q1"
                            q={q}
                            isDone={isDone}
                            questLog={questLog}
                            isDawn={isDawnMode}
                            setIsDawn={setIsDawnMode}
                            hasMirror={hasMirror}
                            activeMandatoryId={weeklyQuestId || ''}
                            onCheckIn={onCheckIn}
                            onUndo={onUndo}
                            formatCheckInTime={formatCheckInTime}
                        />
                    );
                }

                const isDone = logs.some(l => l.QuestID === q.id && getLogicalDateStr(l.Timestamp) === logicalTodayStr);
                const questLog = logs.find(l => l.QuestID === q.id && getLogicalDateStr(l.Timestamp) === logicalTodayStr);
                const isRecommended = q.id === weeklyQuestId;
                return (
                    <button key={q.id} onClick={() => !isDone ? onCheckIn(q) : onUndo(q)} className={`relative w-full p-6 rounded-3xl border-2 flex items-center gap-4 transition-all ${isDone ? 'bg-emerald-500/10 border-emerald-500/40 opacity-70' : isRecommended ? 'bg-slate-900 border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.2)]' : 'bg-slate-900 border-white/5'}`}>
                        <QuestIcon questId={q.id} isDone={isDone} />
                        <div className="flex-1 text-left"><h3 className={`font-black text-lg ${isDone ? 'text-emerald-400' : 'text-white'}`}>{q.title}</h3><p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{q.sub}</p></div>
                        <div className="text-right">
                            <div className="font-black text-orange-500">+{q.reward} 修為</div>
                            <div className="text-xs font-bold text-yellow-400 mt-0.5">+{Math.floor(q.reward * 0.1)} 🪙</div>
                        </div>
                        {isDone && questLog && <div className="absolute bottom-1 right-2 text-[8px] font-mono text-emerald-500 opacity-60">{formatCheckInTime(questLog.Timestamp)}</div>}
                    </button>
                );
            })}
        </div>
    );
}
