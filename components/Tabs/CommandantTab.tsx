'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, XCircle, RefreshCw, Sword, Users, ChevronDown, ChevronUp, ScrollText, CalendarPlus, Calendar as CalendarIcon, Loader2, Crown, Trash2 } from 'lucide-react';
import dynamic from 'next/dynamic';

const SquadGrowthChart = dynamic(
    () => import('@/components/Charts/SquadGrowthChart').then(m => ({ default: m.SquadGrowthChart })),
    { ssr: false, loading: () => <div className="h-72 flex items-center justify-center"><Loader2 className="animate-spin text-rose-500" /></div> }
);
import { CharacterStats, BonusApplication, SquadMemberStats } from '@/types';
import { exportMembersWithSummary } from '@/app/actions/admin';
import { reviewBonusByAdmin, bulkReviewBonusByAdmin } from '@/app/actions/bonus';
import {
    scheduleSquadGathering,
    cancelSquadGathering,
    listGatheringSessions,
    listPendingGatherings,
    reviewGathering,
    type SquadGatheringSession,
    type PendingGatheringReview,
} from '@/app/actions/squad-gathering';

const ONE_TIME_QUEST_LABELS: Record<string, string> = {
    o1: '超越巔峰',
    o2_1: '戲劇進修－生命數字',
    o2_2: '戲劇進修－生命蛻變',
    o2_3: '戲劇進修－複訓大堂課',
    o2_4: '戲劇進修－告別負債&貧窮',
    o3: '聯誼會（1年）',
    o4: '聯誼會（2年）',
    o5: '報高階（訂金）',
    o6: '報高階（完款）',
    o7: '傳愛',
};

interface CommandantTabProps {
    userData: CharacterStats;
    apps: BonusApplication[];
    onRefresh: () => void;
    onShowMessage: (msg: string, type: 'success' | 'error' | 'info') => void;
    battalionMembers?: Record<string, SquadMemberStats[]>;
}

function isActive(lastCheckIn?: string): boolean {
    if (!lastCheckIn) return false;
    const nowTW = new Date(Date.now() + 8 * 3600 * 1000);
    const todayStr = nowTW.toISOString().slice(0, 10);
    const yest = new Date(nowTW);
    yest.setUTCDate(yest.getUTCDate() - 1);
    return lastCheckIn === todayStr || lastCheckIn === yest.toISOString().slice(0, 10);
}


// ── 安排 / 管理實體凝聚排期 ──────────────────────────────────────────────────
function GatheringScheduler({
    battalionMembers,
    onShowMessage,
}: {
    battalionMembers: Record<string, SquadMemberStats[]>;
    onShowMessage: (msg: string, type: 'success' | 'error' | 'info') => void;
}) {
    const teamOptions = Object.keys(battalionMembers).sort();
    const [team, setTeam] = useState<string>(teamOptions[0] ?? '');
    const [date, setDate] = useState<string>('');
    const [saving, setSaving] = useState(false);
    const [sessions, setSessions] = useState<SquadGatheringSession[]>([]);
    const [loading, setLoading] = useState(true);

    const reload = useCallback(async () => {
        const res = await listGatheringSessions();
        if (res.success) setSessions(res.sessions ?? []);
        setLoading(false);
    }, []);

    useEffect(() => { reload(); }, [reload]);

    const handleCreate = async () => {
        if (!team || !date) return;
        setSaving(true);
        const res = await scheduleSquadGathering(team, date);
        setSaving(false);
        if (res.success) {
            onShowMessage('✅ 已排定實體凝聚', 'success');
            setDate('');
            reload();
        } else {
            onShowMessage(res.error ?? '排定失敗', 'error');
        }
    };

    const handleCancel = async (sessionId: string) => {
        if (!confirm('確定要取消此凝聚？')) return;
        const res = await cancelSquadGathering(sessionId);
        if (res.success) {
            onShowMessage('已取消凝聚', 'info');
            reload();
        } else {
            onShowMessage(res.error ?? '取消失敗', 'error');
        }
    };

    const today = new Date().toISOString().slice(0, 10);
    const upcoming = sessions.filter(s => s.status === 'scheduled' || s.status === 'pending_review');

    return (
        <div className="bg-white border-2 border-rose-100 rounded-3xl p-5 space-y-4 shadow-md">
            <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                <CalendarPlus size={15} className="text-rose-400" /> 安排實體凝聚
            </h3>
            <div className="space-y-3">
                <div>
                    <label className="text-xs font-black text-gray-500">小隊</label>
                    <select
                        value={team}
                        onChange={e => setTeam(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-sm outline-none focus:border-rose-400 mt-1"
                    >
                        {teamOptions.length === 0 && <option value="">（尚無小隊資料）</option>}
                        {teamOptions.map(t => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-xs font-black text-gray-500">凝聚日期</label>
                    <input
                        type="date"
                        min={today}
                        value={date}
                        onChange={e => setDate(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-sm outline-none focus:border-rose-400 mt-1"
                    />
                </div>
                <button
                    disabled={saving || !team || !date}
                    onClick={handleCreate}
                    className="w-full py-2.5 bg-rose-600 text-white font-black rounded-xl active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <CalendarPlus size={14} />}
                    排定凝聚
                </button>
            </div>

            <div className="border-t border-gray-200 pt-3 space-y-2">
                <p className="text-sm font-black text-gray-700">已排定 / 審核中</p>
                {loading ? (
                    <div className="flex justify-center py-4"><Loader2 size={18} className="animate-spin text-rose-400" /></div>
                ) : upcoming.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-3">暫無排期</p>
                ) : (
                    <div className="space-y-2">
                        {upcoming.map(s => (
                            <div key={s.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2 border border-gray-200">
                                <div className="min-w-0">
                                    <p className="text-sm font-black text-gray-900 truncate">{s.teamName}</p>
                                    <p className="text-xs text-gray-500">
                                        {s.gatheringDate}
                                        <span className={`ml-2 font-bold ${s.status === 'scheduled' ? 'text-amber-600' : 'text-yellow-600'}`}>
                                            {s.status === 'scheduled' ? '排定中' : '審核中'}
                                        </span>
                                    </p>
                                </div>
                                {s.status === 'scheduled' && (
                                    <button
                                        onClick={() => handleCancel(s.id)}
                                        className="p-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 active:scale-95 transition-all"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── 待審實體凝聚（終審） ────────────────────────────────────────────────────
function GatheringPendingReviews({
    reviewerId,
    onShowMessage,
}: {
    reviewerId: string;
    onShowMessage: (msg: string, type: 'success' | 'error' | 'info') => void;
}) {
    const [items, setItems] = useState<PendingGatheringReview[]>([]);
    const [loading, setLoading] = useState(true);
    const [notes, setNotes] = useState<Record<string, string>>({});
    const [reviewingId, setReviewingId] = useState<string | null>(null);

    const reload = useCallback(async () => {
        const res = await listPendingGatherings();
        if (res.success) setItems(res.items ?? []);
        setLoading(false);
    }, []);

    useEffect(() => { reload(); }, [reload]);

    const handleReview = async (sessionId: string, approve: boolean) => {
        setReviewingId(sessionId);
        const res = await reviewGathering(reviewerId, sessionId, approve, notes[sessionId] || undefined);
        setReviewingId(null);
        if (res.success) {
            onShowMessage(
                approve
                    ? `✅ 已核准，每人 +${res.rewardPerPerson} 分（${res.attendeeCount} 人）`
                    : '已退回此凝聚',
                approve ? 'success' : 'info',
            );
            reload();
        } else {
            onShowMessage(res.error ?? '操作失敗', 'error');
        }
    };

    if (loading) return (
        <div className="bg-white border-2 border-rose-100 rounded-3xl p-5 shadow-md">
            <div className="flex items-center gap-2 text-rose-500 font-black text-sm">
                <CalendarIcon size={14} /> 待審實體凝聚
            </div>
            <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-rose-400" /></div>
        </div>
    );

    return (
        <div className="bg-white border-2 border-rose-100 rounded-3xl p-5 space-y-3 shadow-md">
            <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                <CalendarIcon size={15} className="text-rose-400" /> 待審實體凝聚（終審）
            </h3>
            {items.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">暫無待審凝聚</p>
            ) : (
                <div className="space-y-4">
                    {items.map(item => (
                        <div key={item.session.id} className="bg-gray-50 rounded-2xl p-4 space-y-3 border border-gray-200">
                            <div className="flex justify-between items-start gap-2">
                                <div className="min-w-0">
                                    <p className="font-black text-gray-900 text-base">{item.session.teamName}</p>
                                    <p className="text-sm text-gray-500">凝聚日：{item.session.gatheringDate}</p>
                                </div>
                                <span className="shrink-0 text-sm font-black text-amber-600 bg-amber-50 px-2 py-1 rounded-lg">
                                    每人 +{item.projectedReward}
                                </span>
                            </div>

                            <div className="bg-white rounded-xl p-3 space-y-1.5 border border-gray-200">
                                <p className="text-sm text-gray-700 font-bold flex items-center gap-2">
                                    <Users size={12} /> 出席 {item.attendees.length} / {item.teamMemberCount}
                                    {item.attendees.length >= item.teamMemberCount && item.teamMemberCount > 0 && (
                                        <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">全員到齊</span>
                                    )}
                                </p>
                                <p className="text-xs flex items-center gap-1">
                                    <Crown size={11} className={item.attendees.some(a => a.isCommandant) ? 'text-amber-500' : 'text-gray-400'} />
                                    <span className={item.attendees.some(a => a.isCommandant) ? 'text-amber-600 font-bold' : 'text-gray-500'}>
                                        {item.attendees.some(a => a.isCommandant) ? '大隊長到場（+100）' : '大隊長未到場'}
                                    </span>
                                </p>
                                <div className="pt-1 border-t border-gray-100 grid grid-cols-2 gap-1">
                                    {item.attendees.map(a => (
                                        <span key={a.userId} className="text-xs text-gray-600 flex items-center gap-1">
                                            <CheckCircle2 size={10} className="text-emerald-500" />
                                            {a.userName ?? a.userId}
                                            {a.isCommandant && <Crown size={9} className="text-amber-500" />}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            <textarea
                                placeholder="終審備註（選填）"
                                value={notes[item.session.id] || ''}
                                onChange={e => setNotes(prev => ({ ...prev, [item.session.id]: e.target.value }))}
                                rows={2}
                                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-sm outline-none focus:border-rose-400 resize-none"
                            />

                            <div className="flex gap-2">
                                <button
                                    disabled={reviewingId === item.session.id}
                                    onClick={() => handleReview(item.session.id, false)}
                                    className="flex-1 py-2 bg-red-50 text-red-500 font-black rounded-xl text-sm border border-red-200 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1"
                                >
                                    <XCircle size={13} /> 退回
                                </button>
                                <button
                                    disabled={reviewingId === item.session.id}
                                    onClick={() => handleReview(item.session.id, true)}
                                    className="flex-[2] py-2 bg-emerald-600 text-white font-black rounded-xl text-sm shadow-lg active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1"
                                >
                                    <CheckCircle2 size={13} /> {reviewingId === item.session.id ? '處理中…' : `核准（+${item.projectedReward}）`}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export function CommandantTab({ userData, apps, onRefresh, onShowMessage, battalionMembers = {} }: CommandantTabProps) {
    const [reviewingId, setReviewingId] = useState<string | null>(null);
    const [notes, setNotes] = useState<Record<string, string>>({});
    const [expandedSquads, setExpandedSquads] = useState<Record<string, boolean>>({});
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [batching, setBatching] = useState(false);
    const [memberExporting, setMemberExporting] = useState(false);

    const toggleSquad = (name: string) => setExpandedSquads(prev => ({ ...prev, [name]: !prev[name] }));
    const squadEntries = Object.entries(battalionMembers);

    const toggleSelect = (appId: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(appId)) next.delete(appId); else next.add(appId);
            return next;
        });
    };
    const selectAll = () => setSelectedIds(new Set(apps.map(a => a.id)));
    const clearSelection = () => setSelectedIds(new Set());

    const handleReview = async (appId: string, action: 'approve' | 'reject') => {
        setReviewingId(appId);
        try {
            const res = await reviewBonusByAdmin(appId, action, notes[appId] || '', userData.Name);
            if (res.success) {
                onShowMessage(
                    action === 'approve' ? '✅ 已核准入帳，積分已發放!' : '已駁回此申請。',
                    action === 'approve' ? 'success' : 'info'
                );
                onRefresh();
            } else {
                onShowMessage(res.error || '操作失敗', 'error');
            }
            if (res.warning) onShowMessage(res.warning, 'info');
        } catch (e: any) {
            onShowMessage('系統異常：' + e.message, 'error');
        } finally {
            setReviewingId(null);
        }
    };

    const handleBulkReview = async (action: 'approve' | 'reject') => {
        if (selectedIds.size === 0) return;
        const confirmed = window.confirm(`確定要一次${action === 'approve' ? '核准' : '駁回'} ${selectedIds.size} 筆申請嗎？`);
        if (!confirmed) return;
        setBatching(true);
        try {
            const ids = Array.from(selectedIds);
            const res = await bulkReviewBonusByAdmin(ids, action, '', userData.Name);
            if (!res.success) {
                onShowMessage(res.error || '批量操作失敗', 'error');
                return;
            }
            const results = res.results ?? [];
            const okCount = results.filter(r => r.ok).length;
            const warnCount = results.filter(r => r.ok && r.warning).length;
            const failCount = results.filter(r => !r.ok).length;
            let msg = `已${action === 'approve' ? '核准' : '駁回'} ${okCount} 筆`;
            if (warnCount > 0) msg += `（${warnCount} 筆入帳需補件）`;
            if (failCount > 0) msg += `；失敗 ${failCount} 筆`;
            onShowMessage(msg, failCount > 0 ? 'info' : 'success');
            setSelectedIds(new Set());
            onRefresh();
        } catch (e: any) {
            onShowMessage('系統異常：' + e.message, 'error');
        } finally {
            setBatching(false);
        }
    };

    return (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="bg-gradient-to-br from-rose-50 to-white border-2 border-rose-200 rounded-4xl p-6 shadow-md">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2 text-rose-500 font-black text-sm uppercase mb-1 tracking-widest">
                            <Sword size={14} /> 大隊長指揮部
                        </div>
                        <h2 className="text-2xl font-black text-gray-900 italic">一次性任務終審</h2>
                        <p className="text-sm text-gray-500 mt-1">以下為已通過小隊長初審、待終審的一次性任務申請</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={async () => {
                                setMemberExporting(true);
                                const res = await exportMembersWithSummary();
                                setMemberExporting(false);
                                if (!res.success || !res.csv) { onShowMessage(res.error || '匯出失敗', 'error'); return; }
                                const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8;' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `members_export_${new Date().toISOString().slice(0, 10)}.csv`;
                                a.click();
                                URL.revokeObjectURL(url);
                            }}
                            disabled={memberExporting}
                            className="flex items-center gap-1.5 px-3 py-2.5 rounded-2xl bg-rose-50 text-rose-600 hover:bg-rose-100 active:scale-95 transition-all border border-rose-200 text-sm font-black min-h-[44px] disabled:opacity-50"
                        >
                            <Crown size={14} />{memberExporting ? '匯出中…' : '下載成員清單'}
                        </button>
                        <button
                            onClick={onRefresh}
                            className="p-3 rounded-2xl bg-gray-100 text-gray-500 hover:text-gray-900 hover:bg-gray-200 active:scale-95 transition-all border border-gray-200"
                        >
                            <RefreshCw size={16} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Battalion member overview */}
            {squadEntries.length > 0 && (
                <div className="bg-white border-2 border-rose-100 rounded-3xl p-5 space-y-4 shadow-md">
                    <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                        <Users size={15} className="text-rose-400" /> 各隊成員積分總覽
                    </h3>
                    <div className="space-y-3">
                        {squadEntries.map(([squadName, members]) => {
                            const activeCount = members.filter(m => isActive(m.lastCheckIn)).length;
                            const rate = members.length > 0 ? Math.round(activeCount / members.length * 100) : 0;
                            const rateColor = rate >= 70 ? 'text-emerald-600' : rate >= 40 ? 'text-amber-600' : 'text-red-500';
                            const rateBg = rate >= 70 ? 'bg-emerald-50' : rate >= 40 ? 'bg-amber-50' : 'bg-red-50';
                            const isOpen = expandedSquads[squadName];
                            return (
                                <div key={squadName} className="bg-gray-50 rounded-2xl overflow-hidden border border-gray-200">
                                    <button
                                        onClick={() => toggleSquad(squadName)}
                                        className="w-full flex items-center justify-between px-4 py-3 text-left active:bg-gray-100 transition-colors"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="font-black text-gray-900 text-base truncate">{squadName}</span>
                                            <span className={`text-sm font-black px-2 py-0.5 rounded-full ${rateColor} ${rateBg}`}>
                                                {activeCount}/{members.length} 活躍 · {rate}%
                                            </span>
                                        </div>
                                        {isOpen ? <ChevronUp size={14} className="text-gray-400 shrink-0" /> : <ChevronDown size={14} className="text-gray-400 shrink-0" />}
                                    </button>
                                    {isOpen && (
                                        <div className="px-4 pb-3 space-y-1.5 border-t border-gray-200 pt-2">
                                            {members.map(m => (
                                                <div key={m.UserID} className="flex items-center gap-2">
                                                    <span className="text-sm text-gray-900 font-bold flex-1 truncate">
                                                        {m.Name}
                                                        {m.IsCaptain && <span className="text-indigo-500 ml-1 text-sm">隊長</span>}
                                                    </span>
                                                    <span className="text-sm text-gray-400">{m.Score.toLocaleString()} 分</span>
                                                    {m.Streak > 0 && <span className="text-sm text-orange-400">🔥{m.Streak}</span>}
                                                    {isActive(m.lastCheckIn) ? (
                                                        <span className="text-sm font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full shrink-0">活躍</span>
                                                    ) : (
                                                        <span className="text-sm font-black text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full shrink-0">沉寂</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* 大隊成長曲線（含本大隊全部小隊） */}
            <section className="bg-white border-2 border-rose-100 p-4 rounded-4xl shadow-md">
                <SquadGrowthChart weeks={8} />
            </section>

            {/* 實體凝聚排期 */}
            <GatheringScheduler battalionMembers={battalionMembers} onShowMessage={onShowMessage} />

            {/* 實體凝聚終審 */}
            <GatheringPendingReviews reviewerId={userData.UserID} onShowMessage={onShowMessage} />

            {/* Application list */}
            {apps.length === 0 ? (
                <div className="bg-gray-50 border border-gray-200 rounded-3xl p-10 text-center">
                    <p className="text-gray-400 font-black text-sm">目前無待終審申請</p>
                    <p className="text-gray-300 text-xs mt-1">所有申請均已處理完畢</p>
                </div>
            ) : (
                <div className="flex flex-col gap-4">
                    {/* 批量操作列 */}
                    <div className="bg-white border-2 border-rose-100 rounded-2xl p-3 flex flex-wrap items-center gap-2 shadow-sm">
                        <button
                            onClick={selectedIds.size === apps.length ? clearSelection : selectAll}
                            className="text-sm font-black text-rose-500 px-3 py-1.5 rounded-lg hover:bg-rose-50"
                        >
                            {selectedIds.size === apps.length ? '取消全選' : '全選'}
                        </button>
                        <span className="text-sm text-gray-500">
                            已選 <span className="font-black text-gray-900">{selectedIds.size}</span> / {apps.length} 筆
                        </span>
                        <div className="flex-1" />
                        <button
                            disabled={batching || selectedIds.size === 0}
                            onClick={() => handleBulkReview('reject')}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-sm font-black text-red-500 bg-red-50 border border-red-200 active:scale-95 disabled:opacity-40"
                        >
                            <XCircle size={12} /> 批量駁回
                        </button>
                        <button
                            disabled={batching || selectedIds.size === 0}
                            onClick={() => handleBulkReview('approve')}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-sm font-black text-white bg-emerald-600 active:scale-95 disabled:opacity-40"
                        >
                            <CheckCircle2 size={12} /> {batching ? '處理中…' : '批量核准'}
                        </button>
                    </div>

                    {apps.map(app => (
                        <div key={app.id} className={`bg-white border-2 rounded-3xl p-5 space-y-4 shadow-md transition-colors ${selectedIds.has(app.id) ? 'border-emerald-400 bg-emerald-50/30' : 'border-rose-100'}`}>
                            {/* App info */}
                            <div className="flex items-start justify-between gap-3">
                                <label className="flex items-start gap-2 min-w-0 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.has(app.id)}
                                        onChange={() => toggleSelect(app.id)}
                                        className="mt-1 accent-emerald-500"
                                    />
                                <div className="min-w-0">
                                    <p className="font-black text-gray-900 text-base">{app.user_name}</p>
                                    {ONE_TIME_QUEST_LABELS[app.quest_id] ? (
                                        <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1">
                                            <ScrollText size={10} className="text-amber-500 shrink-0" />
                                            {app.squad_name} · <span className="text-amber-600 font-bold">{ONE_TIME_QUEST_LABELS[app.quest_id]}</span>
                                            {app.interview_target && ` · ${app.interview_target}`}
                                        </p>
                                    ) : (
                                        <p className="text-sm text-gray-500 mt-0.5">
                                            {app.squad_name} · 訪談對象：<span className="text-rose-500">{app.interview_target}</span>
                                        </p>
                                    )}
                                    <p className="text-sm text-gray-400 mt-0.5">日期：{app.interview_date}</p>
                                    {app.squad_review_notes && (
                                        <p className="text-sm text-indigo-500 mt-1.5 bg-indigo-50 px-2 py-1 rounded-lg">
                                            劇組長備註：{app.squad_review_notes}
                                        </p>
                                    )}
                                    {app.description && (
                                        <p className="text-sm text-gray-500 italic mt-1.5">「{app.description}」</p>
                                    )}
                                </div>
                                </label>
                                <span className="shrink-0 text-sm font-black text-blue-500 bg-blue-50 px-2 py-1 rounded-lg">待終審</span>
                            </div>

                            {/* Notes */}
                            <textarea
                                placeholder="終審備註（選填）"
                                value={notes[app.id] || ''}
                                onChange={e => setNotes(prev => ({ ...prev, [app.id]: e.target.value }))}
                                rows={2}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-sm outline-none focus:border-rose-400 resize-none transition-colors"
                            />

                            {/* Actions */}
                            <div className="flex gap-3">
                                <button
                                    disabled={reviewingId === app.id}
                                    onClick={() => handleReview(app.id, 'reject')}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-black text-base text-red-500 bg-red-50 border border-red-200 active:scale-95 transition-all disabled:opacity-50"
                                >
                                    <XCircle size={14} /> 駁回
                                </button>
                                <button
                                    disabled={reviewingId === app.id}
                                    onClick={() => handleReview(app.id, 'approve')}
                                    className="flex-[2] flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-black text-base text-white bg-emerald-600 shadow-lg active:scale-95 transition-all disabled:opacity-50"
                                >
                                    <CheckCircle2 size={14} /> {reviewingId === app.id ? '處理中…' : '核准入帳'}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
