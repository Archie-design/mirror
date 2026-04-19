'use client';

import {
    Phone, Mic, Award, Users, Zap,
    Map, Star,
} from 'lucide-react';
import { Quest, DailyLog, SystemSettings, TemporaryQuest } from '@/types';
import { WEEKLY_QUEST_CONFIG } from '@/lib/constants';
import { getLogicalDateStr, getCurrentThemePeriod } from '@/lib/utils/time';

interface WeeklyTopicTabProps {
    userId: string;
    systemSettings: SystemSettings;
    logicalTodayStr: string;
    logs: DailyLog[];
    currentWeeklyMonday: Date;
    isTopicDone: boolean;
    temporaryQuests: TemporaryQuest[];
    onCheckIn: (q: Quest) => void;
    onUndo: (q: Quest) => void;
    questRewardOverrides?: Record<string, number>;
    disabledQuests?: string[];
    isCaptain?: boolean;
    teamName?: string;
    squadMemberCount?: number;
}

// ── 週曆打卡列 ───────────────────────────────────────────────────────────
function WeekCalendarRow({
    questId,
    logs,
    disabled,
    onCheckIn,
    onUndo,
}: {
    questId: string;
    logs: DailyLog[];
    limit?: number;
    disabled: boolean;
    currentWeeklyMonday?: Date;
    onCheckIn: (qId: string, day: Date) => void;
    onUndo: (qId: string, day: Date) => void;
}) {
    return (
        <div className="flex justify-between items-center px-1">
            {['一', '二', '三', '四', '五', '六', '日'].map((dayLabel, idx) => {
                const d = new Date();
                const currentDay = d.getDay() || 7;
                d.setDate(d.getDate() + (idx + 1 - currentDay));
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

export function WeeklyTopicTab({
    userId,
    systemSettings,
    logicalTodayStr,
    logs,
    currentWeeklyMonday,
    isTopicDone,
    temporaryQuests,
    onCheckIn,
    onUndo,
    questRewardOverrides,
    disabledQuests,
    isCaptain = false,
    teamName = '',
    squadMemberCount = 0,
}: WeeklyTopicTabProps) {
    // ── 當前電影主題週期 ──
    const themePeriod = getCurrentThemePeriod();

    // ── 動態分值覆寫與停用過濾 ──
    const disabledSet = new Set(disabledQuests || []);
    const weeklyQuests = WEEKLY_QUEST_CONFIG
        .filter(q => !disabledSet.has(q.id))
        .map(q => questRewardOverrides?.[q.id] != null ? { ...q, reward: questRewardOverrides[q.id] } : q);

    // ── 各任務本週完成次數 ──
    const countThisWeek = (qId: string) =>
        logs.filter(l => l.QuestID.startsWith(qId + '|') && new Date(l.Timestamp) >= currentWeeklyMonday).length;

    const wk1Quest = weeklyQuests.find(q => q.id === 'wk1');
    const wk2Quest = weeklyQuests.find(q => q.id === 'wk2');
    const wk3OnlineQuest = weeklyQuests.find(q => q.id === 'wk3_online');
    const wk3OfflineQuest = weeklyQuests.find(q => q.id === 'wk3_offline');
    const wk4SmallQuest = weeklyQuests.find(q => q.id === 'wk4_small');
    const wk4LargeQuest = weeklyQuests.find(q => q.id === 'wk4_large');

    const wk1Count = countThisWeek('wk1');
    const wk2Count = countThisWeek('wk2');
    const wk3OnlineCount = countThisWeek('wk3_online');
    const wk3OfflineCount = countThisWeek('wk3_offline');
    const wk4SmallCount = countThisWeek('wk4_small');
    const wk4LargeCount = countThisWeek('wk4_large');

    const makeWeekHandler = (questId: string, quest: Quest) => ({
        onCheckIn: (_qid: string, day: Date) => {
            const qId = `${questId}|${getLogicalDateStr(day)}`;
            onCheckIn({ ...quest, id: qId });
        },
        onUndo: (_qid: string, day: Date) => {
            const qId = `${questId}|${getLogicalDateStr(day)}`;
            onUndo({ ...quest, id: qId });
        },
    });

    const renderWeeklySection = (
        quest: Quest | undefined,
        countThisWeek: number,
        label: string,
        subText: string,
        icon: React.ReactNode,
    ) => {
        if (!quest) return null;
        const limit = quest.limit ?? 1;
        const isCapped = countThisWeek >= limit;
        return (
            <section className="space-y-3">
                <div className="flex justify-between items-center px-1">
                    <h2 className="text-sm font-black text-gray-500 uppercase tracking-widest">{label}</h2>
                    <span className={`text-sm font-bold ${isCapped ? 'text-[#C0392B]' : 'text-gray-500'}`}>{countThisWeek} / {limit}</span>
                </div>
                <div className={`p-5 rounded-3xl border space-y-4 shadow-sm ${isCapped ? 'opacity-60 bg-white border-[#B2DFC0]' : 'bg-white border-[#B2DFC0]'}`}>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#F5FAF7] border border-[#B2DFC0] flex items-center justify-center text-[#1A6B4A] shrink-0">{icon}</div>
                        <div className="flex-1">
                            <p className="font-bold text-[#1A2A1A] text-base">{quest.title}</p>
                            <p className="text-sm text-gray-500">{subText} · +{quest.reward.toLocaleString()}</p>
                        </div>
                    </div>
                    <WeekCalendarRow
                        questId={quest.id}
                        logs={logs}
                        limit={limit}
                        disabled={isCapped}
                        currentWeeklyMonday={currentWeeklyMonday}
                        {...makeWeekHandler(quest.id, quest)}
                    />
                </div>
            </section>
        );
    };

    return (
        <div className="space-y-8 pb-10 animate-in slide-in-from-right-8 duration-500">

            {/* ── 電影主題週次狀態 ── */}
            <section className="space-y-3">
                <h2 className="text-sm font-black text-gray-500 uppercase tracking-widest px-1">本週旅程主題</h2>
                <div className={`p-4 rounded-3xl border flex items-center gap-4 shadow-sm ${
                    themePeriod.type === 'graduation' ? 'bg-[#F5C842]/5 border-[#F5C842]/50'
                    : themePeriod.type === 'regular' ? 'bg-white border-[#F5C842]/40'
                    : 'bg-white border-[#B2DFC0]'
                }`}>
                    <div className="w-12 h-12 rounded-2xl bg-[#F5FAF7] border border-[#B2DFC0] flex items-center justify-center text-[#1A6B4A] shrink-0"><Map size={28} /></div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-black text-[#1A2A1A] text-base">{themePeriod.title}</p>
                            <span className={`text-sm font-black px-2 py-0.5 rounded-full ${
                                themePeriod.type === 'graduation' ? 'bg-[#F5C842] text-black' : 'bg-[#C0392B] text-white'
                            }`}>{themePeriod.weeks}</span>
                        </div>
                        <p className="text-sm text-gray-500 mt-0.5 leading-relaxed">{themePeriod.desc}</p>
                    </div>
                </div>
            </section>

            {/* ── wk1：破框練習（每週最多 3 次）── */}
            {renderWeeklySection(wk1Quest, wk1Count, '破框練習', '每週最多 3 次', <Zap size={22} />)}

            {/* ── wk2：天使通話（每週最多 2 次）── */}
            {renderWeeklySection(wk2Quest, wk2Count, '天使通話', '每週最多 2 次', <Phone size={22} />)}

            {/* ── wk3：小組凝聚 ── */}
            {(wk3OnlineQuest || wk3OfflineQuest) && (
                <section className="space-y-3">
                    <h2 className="text-sm font-black text-gray-500 uppercase tracking-widest px-1">小組凝聚</h2>
                    <div className="space-y-3">
                        {wk3OnlineQuest && (
                            <div className={`p-5 rounded-3xl border space-y-4 shadow-sm ${wk3OnlineCount >= 1 ? 'opacity-60 bg-white border-[#B2DFC0]' : 'bg-white border-[#B2DFC0]'}`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-[#F5FAF7] border border-[#B2DFC0] flex items-center justify-center text-[#1A6B4A] shrink-0"><Star size={22} /></div>
                                        <div>
                                            <p className="font-bold text-[#1A2A1A] text-base">{wk3OnlineQuest.title}</p>
                                            <p className="text-sm text-gray-500">+{wk3OnlineQuest.reward}</p>
                                        </div>
                                    </div>
                                    <span className={`text-sm font-bold ${wk3OnlineCount >= 1 ? 'text-[#C0392B]' : 'text-gray-500'}`}>{wk3OnlineCount} / 1</span>
                                </div>
                                <WeekCalendarRow
                                    questId="wk3_online"
                                    logs={logs}
                                    limit={1}
                                    disabled={wk3OnlineCount >= 1}
                                    currentWeeklyMonday={currentWeeklyMonday}
                                    {...makeWeekHandler('wk3_online', wk3OnlineQuest)}
                                />
                            </div>
                        )}
                        {wk3OfflineQuest && (
                            <div className={`p-5 rounded-3xl border space-y-4 shadow-sm ${wk3OfflineCount >= 1 ? 'opacity-60 bg-white border-[#B2DFC0]' : 'bg-white border-[#B2DFC0]'}`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-[#F5FAF7] border border-[#B2DFC0] flex items-center justify-center text-[#1A6B4A] shrink-0"><Users size={22} /></div>
                                        <div>
                                            <p className="font-bold text-[#1A2A1A] text-base">{wk3OfflineQuest.title}</p>
                                            <p className="text-sm text-gray-500">+{wk3OfflineQuest.reward}</p>
                                        </div>
                                    </div>
                                    <span className={`text-sm font-bold ${wk3OfflineCount >= 1 ? 'text-[#C0392B]' : 'text-gray-500'}`}>{wk3OfflineCount} / 1</span>
                                </div>
                                <WeekCalendarRow
                                    questId="wk3_offline"
                                    logs={logs}
                                    limit={1}
                                    disabled={wk3OfflineCount >= 1}
                                    currentWeeklyMonday={currentWeeklyMonday}
                                    {...makeWeekHandler('wk3_offline', wk3OfflineQuest)}
                                />
                            </div>
                        )}
                    </div>
                </section>
            )}

            {/* ── wk4：人生大戲分享 ── */}
            {(wk4SmallQuest || wk4LargeQuest) && (
                <section className="space-y-3">
                    <h2 className="text-sm font-black text-gray-500 uppercase tracking-widest px-1">人生大戲分享</h2>
                    <div className="space-y-3">
                        {wk4SmallQuest && (
                            <div className={`p-5 rounded-3xl border space-y-4 shadow-sm ${wk4SmallCount >= 1 ? 'opacity-60 bg-white border-[#B2DFC0]' : 'bg-white border-[#B2DFC0]'}`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-[#F5FAF7] border border-[#B2DFC0] flex items-center justify-center text-[#1A6B4A] shrink-0"><Mic size={22} /></div>
                                        <div>
                                            <p className="font-bold text-[#1A2A1A] text-base">{wk4SmallQuest.title}</p>
                                            <p className="text-sm text-gray-500">+{wk4SmallQuest.reward}</p>
                                        </div>
                                    </div>
                                    <span className={`text-sm font-bold ${wk4SmallCount >= 1 ? 'text-[#C0392B]' : 'text-gray-500'}`}>{wk4SmallCount} / 1</span>
                                </div>
                                <WeekCalendarRow
                                    questId="wk4_small"
                                    logs={logs}
                                    limit={1}
                                    disabled={wk4SmallCount >= 1}
                                    currentWeeklyMonday={currentWeeklyMonday}
                                    {...makeWeekHandler('wk4_small', wk4SmallQuest)}
                                />
                            </div>
                        )}
                        {wk4LargeQuest && (
                            <div className={`p-5 rounded-3xl border space-y-4 shadow-sm ${wk4LargeCount >= 1 ? 'opacity-60 bg-white border-[#B2DFC0]' : 'bg-white border-[#B2DFC0]'}`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-[#F5FAF7] border border-[#B2DFC0] flex items-center justify-center text-[#1A6B4A] shrink-0"><Award size={22} /></div>
                                        <div>
                                            <p className="font-bold text-[#1A2A1A] text-base">{wk4LargeQuest.title}</p>
                                            <p className="text-sm text-gray-500">+{wk4LargeQuest.reward}</p>
                                        </div>
                                    </div>
                                    <span className={`text-sm font-bold ${wk4LargeCount >= 1 ? 'text-[#C0392B]' : 'text-gray-500'}`}>{wk4LargeCount} / 1</span>
                                </div>
                                <WeekCalendarRow
                                    questId="wk4_large"
                                    logs={logs}
                                    limit={1}
                                    disabled={wk4LargeCount >= 1}
                                    currentWeeklyMonday={currentWeeklyMonday}
                                    {...makeWeekHandler('wk4_large', wk4LargeQuest)}
                                />
                            </div>
                        )}
                    </div>
                </section>
            )}

            {/* ── 臨時加碼任務 ── */}
            {temporaryQuests.length > 0 && (
                <section className="space-y-3">
                    <h2 className="text-sm font-black text-gray-500 uppercase tracking-widest px-1">⏳ 臨時加碼任務</h2>
                    {temporaryQuests.map(tq => {
                        const isMax = logs.filter(l => l.QuestID.startsWith(tq.id)).length >= 1;
                        return (
                            <div key={tq.id} className={`p-5 rounded-3xl bg-white border border-blue-200 relative overflow-hidden shadow-sm ${isMax ? 'opacity-50' : ''}`}>
                                <div className="absolute top-0 right-0 bg-blue-100 text-blue-600 px-3 py-1 rounded-bl-xl text-sm font-black uppercase tracking-widest">官方加碼</div>
                                <div className="flex items-center gap-3 mb-4 mt-2">
                                    <span className="text-3xl">🎬</span>
                                    <div className="flex-1">
                                        <p className="font-bold text-[#1A2A1A] text-base">{tq.title}</p>
                                        {tq.sub && <p className="text-sm text-blue-600">{tq.sub}</p>}
                                        {tq.desc && <p className="text-sm text-gray-500 mt-0.5">{tq.desc}</p>}
                                    </div>
                                    <p className="font-black text-blue-600">+{tq.reward.toLocaleString()}</p>
                                </div>
                                <div className="flex justify-between items-center">
                                    {['一', '二', '三', '四', '五', '六', '日'].map((day, idx) => {
                                        const d = new Date();
                                        const cd = d.getDay() || 7;
                                        d.setDate(d.getDate() + (idx + 1 - cd));
                                        const qId = `${tq.id}|${getLogicalDateStr(d)}`;
                                        const isDone = logs.some(l => l.QuestID === qId);
                                        return (
                                            <div key={idx} className="flex flex-col items-center gap-1.5">
                                                <span className="text-sm text-gray-500 font-mono">{d.getMonth() + 1}/{d.getDate()}</span>
                                                <button onClick={() => isDone ? onUndo({ ...tq, id: qId }) : (!isMax && onCheckIn({ ...tq, id: qId }))}
                                                    className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all ${isDone ? 'bg-[#C0392B] text-white' : 'bg-[#F5FAF7] text-gray-500 border border-[#B2DFC0] hover:bg-[#B2DFC0]'}`}
                                                >{day}</button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </section>
            )}
        </div>
    );
}
