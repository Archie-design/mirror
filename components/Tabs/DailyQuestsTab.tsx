'use client';

import { useState } from 'react';
import { CheckCircle2, Check, Pencil, ChevronDown, ChevronUp, Sunrise, Salad, Fish } from 'lucide-react';
import { Quest, DailyLog } from '@/types';
import {
    DAILY_BASIC_CONFIG, DAILY_WEIGHTED_CONFIG,
    DAWN_QUEST, DIET_QUEST_CONFIG,
    BASIC_QUEST_IDS, WEIGHTED_QUEST_IDS, DIET_QUEST_IDS,
    DAILY_BASIC_LIMIT, DAILY_WEIGHTED_LIMIT,
} from '@/lib/constants';
import { getLogicalDateStr } from '@/lib/utils/time';

// ── 通用定課 Chip ─────────────────────────────────────────────────────────

interface QuestChipProps {
    quest: Quest;
    isDone: boolean;
    isDisabled: boolean;
    doneTime?: string;
    onCheckIn: () => void;
    editMode?: boolean;
    isFav?: boolean;
    onToggleFav?: () => void;
}

function QuestChip({ quest, isDone, isDisabled, doneTime, onCheckIn, editMode, isFav, onToggleFav }: QuestChipProps) {
    const handleClick = () => {
        if (editMode) { onToggleFav?.(); return; }
        onCheckIn();
    };

    return (
        <button
            onClick={handleClick}
            disabled={!editMode && isDisabled && !isDone}
            className={`relative w-full flex flex-col items-center gap-1 px-3 pt-3.5 pb-3 rounded-2xl border text-base font-bold transition-all active:scale-95
                ${editMode
                    ? isFav
                        ? 'bg-[#F5C842]/10 border-[#F5C842]/60 text-[#C0392B]'
                        : 'bg-white border-[#B2DFC0] text-gray-500 hover:border-[#7FC49A]'
                    : isDone
                        ? 'bg-[#C0392B]/10 border-[#C0392B]/40 text-[#C0392B]'
                        : isDisabled
                            ? 'bg-gray-100 border-[#B2DFC0] text-gray-400 opacity-40 cursor-not-allowed'
                            : 'bg-white border-[#B2DFC0] text-[#1A2A1A] hover:border-[#7FC49A] hover:bg-[#F5FAF7]'}`}
        >
            {editMode && (
                <span className="absolute top-1 right-1.5 text-sm">
                    {isFav ? '★' : '☆'}
                </span>
            )}
            <div className="flex items-center gap-1.5">
                {!editMode && isDone
                    ? <Check size={14} className="text-[#C0392B] shrink-0" />
                    : <span className="text-base leading-none">{quest.icon || '✦'}</span>}
                <span>{quest.title}</span>
            </div>
            <span className={`text-sm font-mono ${
                editMode
                    ? isFav ? 'text-[#C0392B]/70' : 'text-gray-400'
                    : isDone
                        ? 'text-[#C0392B]/70'
                        : 'text-[#1A6B4A]/70'
            }`}>
                {!editMode && isDone && doneTime ? doneTime : `+${quest.reward} 分`}
            </span>
        </button>
    );
}

// ── 主元件 ───────────────────────────────────────────────────────────────

interface DailyQuestsTabProps {
    userId: string;
    logs: DailyLog[];
    logicalTodayStr: string;
    onCheckIn: (q: Quest) => void;
    onUndo: (q: Quest) => void;
    onClearTodayLogs: () => void;
    formatCheckInTime: (timestamp: string) => string;
    questRewardOverrides?: Record<string, number>;
    disabledQuests?: string[];
}

export function DailyQuestsTab({
    userId,
    logs,
    logicalTodayStr,
    onCheckIn,
    onUndo,
    formatCheckInTime,
    questRewardOverrides,
    disabledQuests,
}: DailyQuestsTabProps) {
    const [isEditMode, setIsEditMode] = useState(false);
    const [showOtherBasic, setShowOtherBasic] = useState(false);
    const [showOtherWeighted, setShowOtherWeighted] = useState(false);
    const [favIds, setFavIds] = useState<string[]>(() => {
        if (typeof window === 'undefined' || !userId) return [];
        try {
            const stored = localStorage.getItem(`fav_quests_${userId}`);
            return stored ? JSON.parse(stored) : [];
        } catch { return []; }
    });

    const disabledSet = new Set(disabledQuests || []);
    const applyOverride = (q: Quest): Quest =>
        questRewardOverrides?.[q.id] != null ? { ...q, reward: questRewardOverrides[q.id] } : q;

    const todayLogs = logs.filter(l => getLogicalDateStr(l.Timestamp) === logicalTodayStr);

    // ── 基本定課 d1–d8 ──
    const basicQuests = DAILY_BASIC_CONFIG.filter(q => !disabledSet.has(q.id)).map(applyOverride);
    const basicDoneIds = new Set(todayLogs.filter(l => BASIC_QUEST_IDS.has(l.QuestID)).map(l => l.QuestID));
    const basicDoneCount = basicDoneIds.size;
    const basicSlotsLeft = Math.max(0, DAILY_BASIC_LIMIT - basicDoneCount);

    // ── 加權定課 p1–p5 ──
    const weightedQuests = DAILY_WEIGHTED_CONFIG.filter(q => !disabledSet.has(q.id)).map(applyOverride);
    const weightedDoneIds = new Set(todayLogs.filter(l => WEIGHTED_QUEST_IDS.has(l.QuestID)).map(l => l.QuestID));
    const weightedDoneCount = weightedDoneIds.size;
    const weightedSlotsLeft = Math.max(0, DAILY_WEIGHTED_LIMIT - weightedDoneCount);

    // ── 破曉打拳 p1_dawn ──
    const dawnQuest = applyOverride(DAWN_QUEST);
    const p1Done = todayLogs.some(l => l.QuestID === 'p1');
    const dawnDone = todayLogs.some(l => l.QuestID === 'p1_dawn');
    const dawnLog = todayLogs.find(l => l.QuestID === 'p1_dawn');
    const showDawnQuest = p1Done || dawnDone;

    // ── 飲控 diet ──
    const dietQuests = DIET_QUEST_CONFIG.filter(q => !disabledSet.has(q.id)).map(applyOverride);
    const dietDoneLog = todayLogs.find(l => DIET_QUEST_IDS.has(l.QuestID));
    const dietDoneId = dietDoneLog?.QuestID;

    // ── 收藏管理 ──
    const toggleFav = (questId: string) => {
        setFavIds(prev => {
            const next = prev.includes(questId) ? prev.filter(id => id !== questId) : [...prev, questId];
            try { localStorage.setItem(`fav_quests_${userId}`, JSON.stringify(next)); } catch {}
            return next;
        });
    };

    const renderChip = (q: Quest, isDone: boolean, isDisabled: boolean) => {
        const log = todayLogs.find(l => l.QuestID === q.id);
        return (
            <QuestChip
                key={q.id}
                quest={q}
                isDone={isDone}
                isDisabled={isDisabled}
                doneTime={log ? formatCheckInTime(log.Timestamp) : undefined}
                onCheckIn={() => isDone ? onUndo(q) : onCheckIn(q)}
                editMode={isEditMode}
                isFav={favIds.includes(q.id)}
                onToggleFav={() => toggleFav(q.id)}
            />
        );
    };

    const renderQuestSection = (
        quests: Quest[],
        doneIds: Set<string>,
        slotsLeft: number,
        limit: number,
        doneCount: number,
        label: string,
        showOther: boolean,
        setShowOther: (v: boolean) => void,
    ) => {
        const favQuests = quests.filter(q => favIds.includes(q.id));
        const otherQuests = quests.filter(q => !favIds.includes(q.id));
        const hasFavs = favQuests.length > 0;

        return (
            <section className="space-y-3">
                <div className="flex items-center justify-between px-1">
                    {isEditMode ? (
                        <>
                            <div>
                                <h2 className="text-sm font-black text-[#1A6B4A] uppercase tracking-widest">選擇常用定課</h2>
                                <p className="text-[9px] text-gray-500 mt-0.5">點擊 ★ 切換</p>
                            </div>
                        </>
                    ) : (
                        <>
                            <h2 className="text-sm font-black text-gray-500 uppercase tracking-widest">
                                {label}（{doneCount}/{limit}）
                            </h2>
                            <div className="flex items-center gap-2">
                                <span className={`text-sm font-bold ${slotsLeft <= 0 ? 'text-[#C0392B]' : 'text-gray-500'}`}>
                                    {slotsLeft <= 0 ? '已達上限' : `剩 ${slotsLeft} 次`}
                                </span>
                            </div>
                        </>
                    )}
                </div>

                {isEditMode ? (
                    <div className="grid grid-cols-2 gap-3">
                        {quests.map(q => renderChip(q, doneIds.has(q.id), false))}
                    </div>
                ) : hasFavs ? (
                    <>
                        <div className="grid grid-cols-2 gap-3">
                            {favQuests.map(q => renderChip(q, doneIds.has(q.id), slotsLeft <= 0 && !doneIds.has(q.id)))}
                        </div>
                        {otherQuests.length > 0 && (
                            <div className="space-y-2">
                                <button
                                    onClick={() => setShowOther(!showOther)}
                                    className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors px-1"
                                >
                                    {showOther ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                    其他（{otherQuests.length} 種）
                                </button>
                                {showOther && (
                                    <div className="grid grid-cols-2 gap-3 animate-in slide-in-from-top-1 duration-200">
                                        {otherQuests.map(q => renderChip(q, doneIds.has(q.id), slotsLeft <= 0 && !doneIds.has(q.id)))}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                ) : (
                    <div className="grid grid-cols-2 gap-3">
                        {quests.map(q => renderChip(q, doneIds.has(q.id), slotsLeft <= 0 && !doneIds.has(q.id)))}
                    </div>
                )}
            </section>
        );
    };

    return (
        <div className="space-y-5 pb-10 animate-in slide-in-from-bottom-4 duration-500">

            {/* 常用定課編輯按鈕 */}
            <div className="flex justify-end px-1">
                <button
                    onClick={() => setIsEditMode(v => !v)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#F5FAF7] border border-[#B2DFC0] text-gray-500 text-sm font-bold hover:text-[#1A6B4A] active:scale-95 transition-all"
                >
                    {isEditMode ? <CheckCircle2 size={11} className="text-[#1A6B4A]" /> : <Pencil size={9} />}
                    {isEditMode ? '完成' : '常用'}
                </button>
            </div>

            {/* ① 基本定課 d1–d8 */}
            {renderQuestSection(
                basicQuests, basicDoneIds, basicSlotsLeft,
                DAILY_BASIC_LIMIT, basicDoneCount,
                '基本定課', showOtherBasic, setShowOtherBasic,
            )}

            {/* ② 加權定課 p1–p5 */}
            {renderQuestSection(
                weightedQuests, weightedDoneIds, weightedSlotsLeft,
                DAILY_WEIGHTED_LIMIT, weightedDoneCount,
                '加權定課', showOtherWeighted, setShowOtherWeighted,
            )}

            {/* ③ 破曉打拳（p1 done 後出現） */}
            {showDawnQuest && !disabledSet.has('p1_dawn') && (
                <section className="space-y-2">
                    <h2 className="text-sm font-black text-gray-500 uppercase tracking-widest px-1">破曉加成</h2>
                    <button
                        onClick={() => dawnDone ? onUndo(dawnQuest) : onCheckIn(dawnQuest)}
                        disabled={!p1Done && !dawnDone}
                        className={`w-full rounded-3xl border p-4 flex items-center gap-4 transition-all active:scale-95 text-left
                            ${dawnDone
                                ? 'bg-[#C0392B]/10 border-[#C0392B]/40'
                                : 'bg-white border-[#F5C842]/60 shadow-sm hover:border-[#F5C842]'}`}
                    >
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center bg-[#F5FAF7] shrink-0 ${dawnDone ? 'text-[#C0392B]' : 'text-[#F5C842]'}`}>
                            {dawnDone ? <CheckCircle2 size={26} /> : <Sunrise size={26} />}
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className={`font-black text-base ${dawnDone ? 'text-[#C0392B]' : 'text-[#1A2A1A]'}`}>{dawnQuest.title}</h3>
                            <p className="text-sm text-gray-500">今日已打拳，記錄破曉加成</p>
                            {dawnDone && dawnLog && (
                                <p className="text-sm font-mono text-[#C0392B]/70 mt-0.5">{formatCheckInTime(dawnLog.Timestamp)}</p>
                            )}
                        </div>
                        <div className="text-right shrink-0">
                            <p className={`font-black text-lg ${dawnDone ? 'text-[#C0392B]' : 'text-[#1A6B4A]'}`}>+{dawnQuest.reward}</p>
                            <p className="text-sm text-gray-500">分</p>
                        </div>
                    </button>
                </section>
            )}

            {/* ④ 飲控 diet */}
            {dietQuests.length > 0 && (
                <section className="space-y-2">
                    <h2 className="text-sm font-black text-gray-500 uppercase tracking-widest px-1">飲控（每日擇一）</h2>
                    <div className="flex gap-3">
                        {dietQuests.map(q => {
                            const isDone = dietDoneId === q.id;
                            const isBlockedByOther = !!dietDoneId && !isDone;
                            const Icon = q.id === 'diet_veg' ? Salad : Fish;
                            return (
                                <button
                                    key={q.id}
                                    onClick={() => isDone ? onUndo(q) : onCheckIn(q)}
                                    disabled={isBlockedByOther}
                                    className={`flex-1 flex flex-col items-center gap-1.5 py-4 rounded-2xl border text-base font-bold transition-all active:scale-95
                                        ${isDone
                                            ? 'bg-[#C0392B]/10 border-[#C0392B]/40 text-[#C0392B]'
                                            : isBlockedByOther
                                                ? 'bg-gray-100 border-[#B2DFC0] text-gray-400 opacity-40 cursor-not-allowed'
                                                : 'bg-white border-[#B2DFC0] text-[#1A2A1A] hover:border-[#7FC49A]'}`}
                                >
                                    {isDone ? <CheckCircle2 size={20} className="text-[#C0392B]" /> : <Icon size={20} />}
                                    <span>{q.title}</span>
                                    <span className={`text-sm font-mono ${isDone ? 'text-[#C0392B]/70' : 'text-[#1A6B4A]/70'}`}>
                                        +{q.reward} 分
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </section>
            )}

        </div>
    );
}
