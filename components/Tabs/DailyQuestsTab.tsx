import { useState, useEffect } from 'react';
import { Sparkles, UserPlus, ChevronDown, ChevronUp, Star, Pencil, Check, CheckCircle2, Sunrise, Sword, Heart, AlertTriangle } from 'lucide-react';
import { QUEST_ICON_MAP } from '@/lib/constants';
import { Quest, DailyLog, FineSettings } from '@/types';
import { DAILY_QUEST_CONFIG, FLEX_QUEST_IDS } from '@/lib/constants';
import { getLogicalDateStr } from '@/lib/utils/time';

// ── 一、體運定課（q1 / q1_dawn）──────────────────────────────────────────

interface BodyQuestCardProps {
    isDawn: boolean;
    isDone: boolean;
    doneTime?: string;
    reward: number;
    onCheckIn: () => void;
    hasFineReminder?: boolean;
}

function BodyQuestCard({ isDawn, isDone, doneTime, reward, onCheckIn, hasFineReminder }: BodyQuestCardProps) {
    return (
        <button
            onClick={onCheckIn}
            disabled={isDone}
            className={`w-full rounded-3xl border p-5 flex items-center gap-5 transition-all active:scale-95 text-left relative overflow-hidden
                ${isDone
                    ? 'bg-[#E50914]/10 border-[#E50914]/40 opacity-70 cursor-default'
                    : isDawn
                        ? 'bg-black border-[#D4AF37] shadow-[0_0_20px_rgba(212,175,55,0.25)] hover:border-yellow-300'
                        : 'bg-[#111] border-[#333] hover:border-gray-500'}`}
        >
            {hasFineReminder && !isDone && (
                <div className="absolute top-0 right-0 px-3 py-1 bg-red-600/20 border-l border-b border-red-500/30 rounded-bl-xl flex items-center gap-1">
                    <AlertTriangle size={10} className="text-red-500" />
                    <span className="text-[10px] font-black text-red-500 uppercase tracking-tighter">未達標罰款</span>
                </div>
            )}
            <div className={`w-16 h-16 rounded-2xl shrink-0 flex items-center justify-center bg-black/50
                ${isDone ? 'text-[#E50914]' : isDawn ? 'text-[#D4AF37]' : 'text-white/70'}`}>
                {isDone
                    ? <CheckCircle2 size={32} />
                    : isDawn
                        ? <Sunrise size={32} />
                        : <Sword size={32} />}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                    <h3 className={`font-black text-lg ${isDone ? 'text-[#E50914]' : 'text-white'}`}>
                        體運定課
                    </h3>
                    {isDawn && !isDone && (
                        <span className="text-[9px] font-black bg-[#D4AF37] text-black px-2 py-0.5 rounded-full uppercase tracking-widest">早場加成</span>
                    )}
                </div>
                <p className="text-xs text-gray-500">打拳或運動 30 分鐘{isDawn ? '（05:00–08:00）' : ''}</p>
                {isDone && doneTime && (
                    <p className="text-[10px] font-mono text-[#E50914]/70 mt-1">{doneTime}</p>
                )}
            </div>
            <div className="text-right shrink-0">
                <p className={`font-black text-lg ${isDone ? 'text-[#E50914]' : isDawn ? 'text-[#D4AF37]' : 'text-white'}`}>
                    +{reward.toLocaleString()}
                </p>
                <p className="text-[10px] text-gray-500">積分</p>
            </div>
        </button>
    );
}

// ── 二、任意定課（q2–q22）────────────────────────────────────────────────

interface FlexQuestChipProps {
    quest: Quest;
    isDone: boolean;
    doneTime?: string;
    isDisabled: boolean;
    onCheckIn: () => void;
    editMode?: boolean;
    isFav?: boolean;
    onToggleFav?: () => void;
    hasFineReminder?: boolean;
}

function FlexQuestChip({ quest, isDone, doneTime, isDisabled, onCheckIn, editMode, isFav, onToggleFav, hasFineReminder }: FlexQuestChipProps) {
    const handleClick = () => {
        if (editMode) {
            onToggleFav?.();
        } else {
            onCheckIn();
        }
    };

    return (
        <button
            onClick={handleClick}
            disabled={!editMode && isDisabled && !isDone}
            className={`relative flex flex-col items-center gap-0.5 px-3 pt-2.5 pb-2 rounded-2xl border text-xs font-bold transition-all active:scale-95
                ${editMode
                    ? isFav
                        ? 'bg-[#D4AF37]/10 border-[#D4AF37]/60 text-[#D4AF37]'
                        : 'bg-[#111] border-[#2a2a2a] text-gray-400 hover:border-gray-500'
                    : isDone
                        ? 'bg-[#E50914]/15 border-[#E50914]/50 text-[#E50914]'
                        : isDisabled
                            ? 'bg-[#0a0a0a] border-[#1a1a1a] text-gray-700 opacity-40 cursor-not-allowed'
                            : (hasFineReminder
                                ? 'bg-red-950/20 border-red-500/30 text-white hover:border-red-400'
                                : 'bg-[#111] border-[#2a2a2a] text-white hover:border-gray-500 hover:bg-[#1a1a1a]')}`}
        >
            {hasFineReminder && !isDone && !editMode && (
                <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-600 flex items-center justify-center shadow-lg animate-pulse">
                    <AlertTriangle size={8} className="text-white" />
                </div>
            )}
            {editMode && (
                <span className="absolute top-1 right-1.5">
                    <Star
                        size={10}
                        className={isFav ? 'text-[#D4AF37] fill-[#D4AF37]' : 'text-gray-600'}
                    />
                </span>
            )}
            <div className="flex items-center gap-1.5">
                {(!editMode && isDone)
                    ? <Check size={14} className="text-[#E50914] shrink-0" />
                    : (() => {
                        const QIcon = QUEST_ICON_MAP[quest.id];
                        return QIcon
                            ? <QIcon size={14} className="shrink-0" />
                            : <span className="text-sm leading-none">{quest.icon}</span>;
                      })()}
                <span>{quest.title}</span>
            </div>
            <span className={`text-[9px] font-mono ${
                editMode
                    ? isFav ? 'text-[#D4AF37]/70' : 'text-gray-600'
                    : isDone
                        ? 'text-[#E50914]/70'
                        : 'text-[#D4AF37]/70'
            }`}>
                {!editMode && isDone && doneTime ? doneTime : `+${quest.reward.toLocaleString()} 積分`}
            </span>
        </button>
    );
}

// ── 三、關係定課（r1）────────────────────────────────────────────────────

interface RelationshipQuestSectionProps {
    todayR1Count: number;
    logs: DailyLog[];
    logicalTodayStr: string;
    onCheckIn: (personName: string) => void;
    hasFineReminder?: boolean;
}

const RELATIONSHIP_OPTIONS = [
    '爸爸',
    '媽媽',
    '師長',
    '上級',
    '伴侶',
    '替代功課（親近的長輩）'
];

function RelationshipQuestSection({ todayR1Count, logs, logicalTodayStr, onCheckIn, hasFineReminder }: RelationshipQuestSectionProps) {
    const [selectedPerson, setSelectedPerson] = useState('');
    const [isOpen, setIsOpen] = useState(false);

    const todayR1Logs = logs.filter(
        l => l.QuestID === 'r1' && getLogicalDateStr(l.Timestamp) === logicalTodayStr
    );
    const isFull = todayR1Count >= 3;

    const handleSubmit = () => {
        if (!selectedPerson) return;
        onCheckIn(selectedPerson);
        setSelectedPerson('');
        setIsOpen(false);
    };

    return (
        <div className={`rounded-3xl border p-5 space-y-4 relative overflow-hidden ${
            isFull 
                ? 'opacity-60 border-slate-800' 
                : (hasFineReminder 
                    ? 'bg-red-950/10 border-red-500/20' 
                    : 'bg-[#111] border-[#333]')
        }`}>
            {hasFineReminder && !isFull && (
                <div className="absolute top-0 right-0 px-3 py-1 bg-red-600/20 border-l border-b border-red-500/30 rounded-bl-xl flex items-center gap-1">
                    <AlertTriangle size={10} className="text-red-500" />
                    <span className="text-[10px] font-black text-red-500 uppercase tracking-tighter">本期必修罰款</span>
                </div>
            )}
            {/* Header */}
            <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-black/50 shrink-0 text-emerald-400">
                    <Heart size={28} />
                </div>
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <h3 className="font-black text-white text-base">人脈電影推廣</h3>
                        <span className="text-[10px] font-black bg-[#333] text-gray-300 px-2 py-0.5 rounded-full">
                            {todayR1Count} / 3 名觀眾
                        </span>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-0.5">與三貴人或伴侶深度交流，推播生命劇本（≥15 分鐘）</p>
                </div>
                <div className="text-right shrink-0">
                    <p className="font-black text-lg text-emerald-400">+2000</p>
                    <p className="text-[10px] text-gray-500">票房／人</p>
                </div>
            </div>

            {/* Today's logged persons */}
            {todayR1Logs.length > 0 && (
                <div className="space-y-1.5 pl-2">
                    {todayR1Logs.map((l, i) => {
                        const name = l.QuestTitle.replace('關係定課 — ', '');
                        return (
                            <div key={l.id ?? i} className="flex items-center gap-2 text-xs text-emerald-400">
                                <span className="text-emerald-600">✓</span>
                                <span className="font-bold">{name}</span>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Dropdown form */}
            {!isFull && (
                <>
                    <button
                        onClick={() => setIsOpen(!isOpen)}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-emerald-600/20 border border-emerald-600/30 text-emerald-400 font-bold text-sm hover:bg-emerald-600/30 transition-colors"
                    >
                        <UserPlus size={16} />
                        {isOpen ? '取消' : '記錄互動對象'}
                        {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    {isOpen && (
                        <div className="flex gap-3 animate-in slide-in-from-top-2 duration-200">
                            <select
                                autoFocus
                                value={selectedPerson}
                                onChange={e => setSelectedPerson(e.target.value)}
                                className="flex-1 bg-[#222] border border-[#444] rounded-xl px-4 py-2.5 text-white text-sm font-bold outline-none focus:border-emerald-500 appearance-none cursor-pointer"
                            >
                                <option value="">選擇互動對象…</option>
                                {RELATIONSHIP_OPTIONS.map(option => (
                                    <option key={option} value={option}>{option}</option>
                                ))}
                            </select>
                            <button
                                onClick={handleSubmit}
                                disabled={!selectedPerson}
                                className="px-5 py-2.5 bg-emerald-600 text-white font-black rounded-xl active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                ＋
                            </button>
                        </div>
                    )}
                </>
            )}
            {isFull && (
                <div className="text-center text-xs font-bold text-gray-500 py-1">今日關係定課已達 3 人上限</div>
            )}
        </div>
    );
}

// ── 主元件 ───────────────────────────────────────────────────────────────

interface DailyQuestsTabProps {
    userId: string;
    weeklyQuestId?: string;
    fineSettings?: FineSettings;
    logs: DailyLog[];
    logicalTodayStr: string;
    onCheckIn: (q: Quest) => void;
    onUndo: (q: Quest) => void;
    onClearTodayLogs: () => void;
    formatCheckInTime: (timestamp: string) => string;
}

export function DailyQuestsTab({
    userId,
    weeklyQuestId,
    fineSettings,
    logs,
    logicalTodayStr,
    onCheckIn,
    onUndo,
    formatCheckInTime,
}: DailyQuestsTabProps) {
    const [isDawn, setIsDawn] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [showOthers, setShowOthers] = useState(false);
    const [favIds, setFavIds] = useState<string[]>(() => {
        if (typeof window === 'undefined' || !userId) return [];
        try {
            const stored = localStorage.getItem(`fav_flex_quests_${userId}`);
            return stored ? JSON.parse(stored) : [];
        } catch {
            return [];
        }
    });

    useEffect(() => {
        const check = () => {
            const h = new Date().getHours();
            setIsDawn(h >= 5 && h < 8);
        };
        check();
        const t = setInterval(check, 60_000);
        return () => clearInterval(t);
    }, []);

    const toggleFav = (questId: string) => {
        setFavIds(prev => {
            const next = prev.includes(questId)
                ? prev.filter(id => id !== questId)
                : [...prev, questId];
            try {
                localStorage.setItem(`fav_flex_quests_${userId}`, JSON.stringify(next));
            } catch {}
            return next;
        });
    };

    // ── 今日記錄 ──
    const todayLogs = logs.filter(l => getLogicalDateStr(l.Timestamp) === logicalTodayStr);
    const bodyDone = todayLogs.some(l => l.QuestID === 'q1' || l.QuestID === 'q1_dawn');
    const bodyLog = todayLogs.find(l => l.QuestID === 'q1' || l.QuestID === 'q1_dawn');
    const dawnWasDone = todayLogs.some(l => l.QuestID === 'q1_dawn');

    const flexQuests = DAILY_QUEST_CONFIG.filter(q => FLEX_QUEST_IDS.has(q.id));
    const flexDoneCount = todayLogs.filter(l => FLEX_QUEST_IDS.has(l.QuestID)).length;
    const todayR1Count = todayLogs.filter(l => l.QuestID === 'r1').length;

    // ── 罰款邏輯判斷 ──
    const isFineActive = () => {
        if (!fineSettings?.enabled) return false;
        if (!fineSettings.periodStart || !fineSettings.periodEnd) return true; // 未設日期視為全開
        return logicalTodayStr >= fineSettings.periodStart && logicalTodayStr <= fineSettings.periodEnd;
    };
    const showFine = isFineActive();
    const isFineItem = (id: string) => showFine && fineSettings?.items?.includes(id);

    const weeklyQuestName = DAILY_QUEST_CONFIG.find(q => q.id === weeklyQuestId)?.title;

    const hasFavs = favIds.length > 0;
    const favQuests = flexQuests.filter(q => favIds.includes(q.id));
    const otherQuests = flexQuests.filter(q => !favIds.includes(q.id));

    // ── 體運定課 reward 計算 ──
    const bodyDisplayReward = dawnWasDone ? 2000 : (isDawn ? 2000 : 1000);

    const handleBodyCheckIn = () => {
        if (bodyDone) return;
        const questId = isDawn ? 'q1_dawn' : 'q1';
        const title = isDawn ? '早場體運定課' : '體運定課';
        onCheckIn({ id: questId, title, reward: isDawn ? 2000 : 1000 });
    };

    const handleR1CheckIn = (personName: string) => {
        onCheckIn({
            id: 'r1',
            title: `關係定課 — ${personName}`,
            reward: 2000,
        });
    };

    const renderFlexChip = (q: Quest) => {
        const done = todayLogs.some(l => l.QuestID === q.id);
        const log = todayLogs.find(l => l.QuestID === q.id);
        return (
            <FlexQuestChip
                key={q.id}
                quest={q}
                isDone={done}
                doneTime={log ? formatCheckInTime(log.Timestamp) : undefined}
                isDisabled={flexDoneCount >= 3}
                onCheckIn={() => done ? onUndo(q) : onCheckIn(q)}
                editMode={isEditMode}
                isFav={favIds.includes(q.id)}
                onToggleFav={() => toggleFav(q.id)}
                hasFineReminder={isFineItem(q.id)}
            />
        );
    };

    return (
        <div className="space-y-5 pb-10 animate-in slide-in-from-bottom-4 duration-500">

            {/* 本週推薦 */}
            {weeklyQuestName && (
                <div className="bg-gradient-to-br from-[#111] to-black border border-[#333] rounded-2xl px-5 py-4 flex items-center gap-3">
                    <Sparkles size={14} className="text-[#D4AF37] shrink-0" />
                    <div>
                        <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">本週熱門片單</p>
                        <p className="text-sm font-black text-[#D4AF37]">「{weeklyQuestName}」</p>
                    </div>
                </div>
            )}

            {/* ① 體運定課 */}
            <section className="space-y-2">
                <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1">體運定課</h2>
                <BodyQuestCard
                    isDawn={isDawn && !bodyDone}
                    isDone={bodyDone}
                    doneTime={bodyLog ? formatCheckInTime(bodyLog.Timestamp) : undefined}
                    reward={bodyDisplayReward}
                    onCheckIn={handleBodyCheckIn}
                    hasFineReminder={isFineItem('q1') || isFineItem('q1_dawn')}
                />
            </section>

            {/* ② 任意定課（最多 3 種） */}
            <section className="space-y-3">
                <div className="flex items-center justify-between px-1">
                    {isEditMode ? (
                        <>
                            <div>
                                <h2 className="text-[10px] font-black text-[#D4AF37] uppercase tracking-widest">選擇常用定課</h2>
                                <p className="text-[9px] text-gray-600 mt-0.5">已選 {favIds.length} 種，點擊 ★ 切換</p>
                            </div>
                            <button
                                onClick={() => setIsEditMode(false)}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[#D4AF37] text-[10px] font-black active:scale-95 transition-all"
                            >
                                <Check size={11} />
                                完成
                            </button>
                        </>
                    ) : (
                        <>
                            <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">任意定課（每日最多 3 種）</h2>
                            <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-bold ${flexDoneCount >= 3 ? 'text-[#E50914]' : 'text-gray-600'}`}>
                                    已完成 {flexDoneCount} / 3
                                </span>
                                <button
                                    onClick={() => setIsEditMode(true)}
                                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] text-gray-500 text-[10px] font-bold hover:border-gray-500 hover:text-gray-300 active:scale-95 transition-all"
                                >
                                    <Pencil size={9} />
                                    常用
                                </button>
                            </div>
                        </>
                    )}
                </div>

                {isEditMode ? (
                    // 編輯模式：顯示全部 21 種
                    <div className="flex flex-wrap gap-2">
                        {flexQuests.map(renderFlexChip)}
                    </div>
                ) : hasFavs ? (
                    <>
                        {/* 常用定課 */}
                        <div className="flex flex-wrap gap-2">
                            {favQuests.map(renderFlexChip)}
                        </div>
                        {/* 其他定課 收合 */}
                        {otherQuests.length > 0 && (
                            <div className="space-y-2">
                                <button
                                    onClick={() => setShowOthers(v => !v)}
                                    className="flex items-center gap-1.5 text-[10px] font-bold text-gray-600 hover:text-gray-400 transition-colors px-1"
                                >
                                    {showOthers ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                    其他定課（{otherQuests.length} 種）
                                </button>
                                {showOthers && (
                                    <div className="flex flex-wrap gap-2 animate-in slide-in-from-top-1 duration-200">
                                        {otherQuests.map(renderFlexChip)}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                ) : (
                    // 未設定常用：顯示全部
                    <div className="flex flex-wrap gap-2">
                        {flexQuests.map(renderFlexChip)}
                    </div>
                )}
            </section>

            {/* ③ 關係定課（最多 3 人） */}
            <section className="space-y-2">
                <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1">關係定課</h2>
                <RelationshipQuestSection
                    todayR1Count={todayR1Count}
                    logs={logs}
                    logicalTodayStr={logicalTodayStr}
                    onCheckIn={handleR1CheckIn}
                    hasFineReminder={isFineItem('r1')}
                />
            </section>

        </div>
    );
}
