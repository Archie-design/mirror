'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import {
    Phone, Users, Zap,
    Map, Star, Crown, Loader2, QrCode, CheckCircle2,
} from 'lucide-react';
import { Quest, DailyLog, TemporaryQuest } from '@/types';
import { WEEKLY_QUEST_CONFIG } from '@/lib/constants';
import { getLogicalDateStr, getCurrentThemePeriod } from '@/lib/utils/time';
import { WeekCalendarRow } from '@/components/WeekCalendarRow';
import { getTeamGatheringContext, type TeamGatheringContext } from '@/app/actions/squad-gathering';
import {
    submitOnlineGathering,
    getMyOnlineGatheringThisWeek,
    type OnlineGatheringApp,
} from '@/app/actions/online-gathering';

interface WeeklyTopicTabProps {
    logs: DailyLog[];
    currentWeeklyMonday: Date;
    temporaryQuests: TemporaryQuest[];
    onCheckIn: (q: Quest) => void;
    onUndo: (q: Quest) => void;
    questRewardOverrides?: Record<string, number>;
    disabledQuests?: string[];
    userId: string;
}

// ── 小組凝聚（線上）一級審核制卡片 ──────────────────────────────────────────
function SquadOnlineGatheringCard({ quest, userId }: { quest: Quest; userId: string }) {
    const [app, setApp] = useState<OnlineGatheringApp | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [notes, setNotes] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const reload = useCallback(async () => {
        const res = await getMyOnlineGatheringThisWeek(userId);
        if (res.success) setApp(res.app ?? null);
        setLoading(false);
    }, [userId]);

    useEffect(() => { reload(); }, [reload]);

    const handleSubmit = async () => {
        setSubmitting(true);
        setErr(null);
        const res = await submitOnlineGathering(userId, notes);
        if (!res.success) setErr(res.error ?? '提交失敗');
        else { setShowForm(false); setNotes(''); }
        await reload();
        setSubmitting(false);
    };

    const renderStatus = () => {
        if (loading) return (
            <div className="flex justify-center py-3"><Loader2 size={16} className="animate-spin text-gray-400" /></div>
        );

        if (!app || app.status === 'rejected') {
            return (
                <div className="space-y-2">
                    {app?.status === 'rejected' && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                            <p className="text-sm font-bold text-red-600">上次申請已退回{app.squadReviewNotes ? `：${app.squadReviewNotes}` : ''}</p>
                            <p className="text-xs text-red-400 mt-1">可重新提交</p>
                        </div>
                    )}
                    {showForm ? (
                        <div className="space-y-2">
                            <textarea
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                placeholder="補充說明（選填，例如：本週凝聚心得、參與方式）"
                                rows={2}
                                className="w-full bg-white border border-gray-200 rounded-xl p-2 text-gray-900 text-sm outline-none focus:border-emerald-400 resize-none"
                            />
                            <div className="flex gap-2">
                                <button
                                    onClick={() => { setShowForm(false); setNotes(''); setErr(null); }}
                                    disabled={submitting}
                                    className="flex-1 py-2 text-sm font-black text-gray-500 bg-gray-100 rounded-xl active:scale-95 disabled:opacity-50"
                                >
                                    取消
                                </button>
                                <button
                                    onClick={handleSubmit}
                                    disabled={submitting}
                                    className="flex-[2] py-2 text-sm font-black text-white bg-emerald-600 rounded-xl active:scale-95 disabled:opacity-50"
                                >
                                    {submitting ? <Loader2 size={12} className="animate-spin inline" /> : '送出審核'}
                                </button>
                            </div>
                            {err && <p className="text-sm text-red-500 text-center">{err}</p>}
                        </div>
                    ) : (
                        <button
                            onClick={() => setShowForm(true)}
                            className="w-full py-2 text-sm font-black text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl active:scale-95 hover:bg-emerald-100 transition-colors"
                        >
                            提交本週凝聚申請（小隊長審核）
                        </button>
                    )}
                </div>
            );
        }

        if (app.status === 'pending') return (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-center">
                <p className="text-sm font-bold text-yellow-700">審核中…等待小隊長初審</p>
                {app.notes && <p className="text-xs text-yellow-500 mt-1 italic">「{app.notes}」</p>}
            </div>
        );

        if (app.status === 'approved') return (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                <p className="text-sm font-bold text-emerald-700 flex items-center justify-center gap-1">
                    <CheckCircle2 size={14} /> 已完成 — +{quest.reward} 分
                </p>
            </div>
        );

        return null;
    };

    return (
        <div className="p-5 rounded-3xl border bg-white border-[#B2DFC0] space-y-3 shadow-sm">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#F5FAF7] border border-[#B2DFC0] flex items-center justify-center text-[#1A6B4A] shrink-0"><Star size={22} /></div>
                <div className="flex-1">
                    <p className="font-bold text-[#1A2A1A] text-base">{quest.title}</p>
                    <p className="text-sm text-gray-500">+{quest.reward} · 每週 1 次，小隊長審核</p>
                </div>
            </div>
            {renderStatus()}
        </div>
    );
}

// ── 小組凝聚（實體）QR 審核制卡片 ───────────────────────────────────────────
function SquadOfflineGatheringCard({ quest, userId }: { quest: Quest; userId: string }) {
    const [ctx, setCtx] = useState<TeamGatheringContext | null>(null);
    const [loading, setLoading] = useState(true);

    const reload = useCallback(async () => {
        const res = await getTeamGatheringContext(userId);
        if (res.success) setCtx(res.context ?? null);
        setLoading(false);
    }, [userId]);

    useEffect(() => { reload(); }, [reload]);

    const session = ctx?.session ?? null;
    const attendees = ctx?.attendees ?? [];
    const teamCount = ctx?.teamMemberCount ?? 0;
    const hasCheckedIn = ctx?.hasCheckedIn ?? false;
    const isToday = session?.gatheringDate === getLogicalDateStr();

    const renderStatus = () => {
        if (loading) return (
            <div className="flex justify-center py-3"><Loader2 size={16} className="animate-spin text-gray-400" /></div>
        );
        if (!session) return (
            <p className="text-sm text-gray-400 text-center py-3">本週尚未排定實體凝聚</p>
        );
        if (session.status === 'scheduled' && !isToday) return (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                <p className="text-sm font-bold text-amber-700">預定 {session.gatheringDate} 凝聚</p>
            </div>
        );
        if (session.status === 'scheduled' && isToday) return (
            <div className={`rounded-xl p-3 text-center ${hasCheckedIn ? 'bg-emerald-50 border border-emerald-200' : 'bg-blue-50 border border-blue-200'}`}>
                {hasCheckedIn ? (
                    <p className="text-sm font-bold text-emerald-700 flex items-center justify-center gap-1">
                        <CheckCircle2 size={14} /> 已報到 · {attendees.length}/{teamCount}
                    </p>
                ) : (
                    <p className="text-sm font-bold text-blue-700 flex items-center justify-center gap-1">
                        <QrCode size={14} /> 今日凝聚中 — 請掃小隊長 QR 報到
                    </p>
                )}
            </div>
        );
        if (session.status === 'pending_review') return (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-center">
                <p className="text-sm font-bold text-yellow-700">審核中…等待大隊長終審</p>
            </div>
        );
        if (session.status === 'approved') return (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                <p className="text-sm font-bold text-emerald-700">
                    ✓ 已完成 — +{session.approvedRewardPerPerson ?? 300} 分
                </p>
            </div>
        );
        if (session.status === 'rejected') return (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                <p className="text-sm font-bold text-red-600">已退回{session.notes ? `：${session.notes}` : ''}</p>
            </div>
        );
        return null;
    };

    return (
        <div className="p-5 rounded-3xl border bg-white border-[#B2DFC0] space-y-3 shadow-sm">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#F5FAF7] border border-[#B2DFC0] flex items-center justify-center text-[#1A6B4A] shrink-0"><Users size={22} /></div>
                <div className="flex-1">
                    <p className="font-bold text-[#1A2A1A] text-base">{quest.title}</p>
                    <p className="text-sm text-gray-500">
                        基礎 +{quest.reward}
                        <span className="text-amber-600"> · 全到 +100</span>
                        <Crown size={11} className="inline ml-1 text-amber-500" />
                        <span className="text-amber-600"> 大隊長 +100</span>
                    </p>
                </div>
            </div>
            {renderStatus()}
        </div>
    );
}

export function WeeklyTopicTab({
    logs,
    currentWeeklyMonday,
    temporaryQuests,
    onCheckIn,
    onUndo,
    questRewardOverrides,
    disabledQuests,
    userId,
}: WeeklyTopicTabProps) {
    // ── 當前電影主題週期 ──
    const themePeriod = getCurrentThemePeriod();

    const {
        wk1Quest, wk2Quest, wk3OnlineQuest, wk3OfflineQuest,
        wk1Count, wk2Count,
    } = useMemo(() => {
        const disabledSet = new Set(disabledQuests || []);
        const weeklyQuests = WEEKLY_QUEST_CONFIG
            .filter(q => !disabledSet.has(q.id))
            .map(q => questRewardOverrides?.[q.id] != null ? { ...q, reward: questRewardOverrides[q.id] } : q);
        const countThisWeek = (qId: string) =>
            logs.filter(l => l.QuestID.startsWith(qId + '|') && new Date(l.Timestamp) >= currentWeeklyMonday).length;
        return {
            wk1Quest: weeklyQuests.find(q => q.id === 'wk1'),
            wk2Quest: weeklyQuests.find(q => q.id === 'wk2'),
            wk3OnlineQuest: weeklyQuests.find(q => q.id === 'wk3_online'),
            wk3OfflineQuest: weeklyQuests.find(q => q.id === 'wk3_offline'),
            wk1Count: countThisWeek('wk1'),
            wk2Count: countThisWeek('wk2'),
        };
    }, [logs, currentWeeklyMonday, questRewardOverrides, disabledQuests]);

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

            {/* ── wk3：小組凝聚（線上一級 / 實體二級 QR）── */}
            {(wk3OnlineQuest || wk3OfflineQuest) && (
                <section className="space-y-3">
                    <h2 className="text-sm font-black text-gray-500 uppercase tracking-widest px-1">小組凝聚</h2>
                    <div className="space-y-3">
                        {wk3OnlineQuest && (
                            <SquadOnlineGatheringCard quest={wk3OnlineQuest} userId={userId} />
                        )}
                        {wk3OfflineQuest && (
                            <SquadOfflineGatheringCard quest={wk3OfflineQuest} userId={userId} />
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
                                        const d = new Date(currentWeeklyMonday);
                                        d.setDate(d.getDate() + idx);
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
