'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import type { BonusApplication, TempQuestApplication } from '@/types';
import { getBonusApplications, reviewBonusBySquadLeader } from '@/app/actions/bonus';
import { listPendingTempQuestsForAdmin, reviewTempQuestByCaptain } from '@/app/actions/temp-quest-application';
import { listPendingOnlineGatheringsForAdmin, reviewOnlineGathering, type OnlineGatheringApp } from '@/app/actions/online-gathering';

// Admin 兜底初審區塊：處理沒有 captain 可以初審、或 captain 暫無回應的 pending 申請。
// 三類：一次性任務 (Bonus pending)、臨時加碼 (TempQuest pending)、線上凝聚 (OnlineGathering pending)
export function AdminPendingReviewSection({
    adminUserId,
    onShowMessage,
}: {
    adminUserId: string;
    onShowMessage: (msg: string, type: 'success' | 'error' | 'info') => void;
}) {
    const [loading, setLoading] = useState(true);
    const [bonusApps, setBonusApps] = useState<BonusApplication[]>([]);
    const [tempApps, setTempApps] = useState<TempQuestApplication[]>([]);
    const [onlineApps, setOnlineApps] = useState<OnlineGatheringApp[]>([]);
    const [reviewingId, setReviewingId] = useState<string | null>(null);
    const [notesMap, setNotesMap] = useState<Record<string, string>>({});

    const reload = useCallback(async () => {
        setLoading(true);
        const [b, t, o] = await Promise.all([
            getBonusApplications({ status: 'pending' }),
            listPendingTempQuestsForAdmin(),
            listPendingOnlineGatheringsForAdmin(),
        ]);
        if (b.success) setBonusApps(b.applications);
        if (t.success) setTempApps(t.apps);
        if (o.success && o.apps) setOnlineApps(o.apps);
        setLoading(false);
    }, []);

    useEffect(() => { reload(); }, [reload]);

    const handleBonus = async (appId: string, approve: boolean) => {
        setReviewingId(appId);
        const res = await reviewBonusBySquadLeader(appId, adminUserId, approve, notesMap[appId] || '');
        setReviewingId(null);
        if (!res.success) { onShowMessage(res.error ?? '審核失敗', 'error'); return; }
        onShowMessage(approve ? '✅ 一次性任務初審已通過' : '已退回一次性任務', approve ? 'success' : 'info');
        await reload();
    };

    const handleTemp = async (appId: string, approve: boolean) => {
        setReviewingId(appId);
        const res = await reviewTempQuestByCaptain(appId, adminUserId, approve, notesMap[appId] || '');
        setReviewingId(null);
        if (!res.success) { onShowMessage(res.error ?? '審核失敗', 'error'); return; }
        onShowMessage(approve ? '✅ 臨時任務初審已通過' : '已退回臨時任務', approve ? 'success' : 'info');
        await reload();
    };

    const handleOnline = async (appId: string, approve: boolean) => {
        setReviewingId(appId);
        const res = await reviewOnlineGathering(adminUserId, appId, approve, notesMap[appId] || '');
        setReviewingId(null);
        if (!res.success) { onShowMessage(res.error ?? '審核失敗', 'error'); return; }
        onShowMessage(approve ? '✅ 線上凝聚已核准 (+1000)' : '已退回線上凝聚', approve ? 'success' : 'info');
        await reload();
    };

    const total = bonusApps.length + tempApps.length + onlineApps.length;

    return (
        <section className="space-y-4">
            <div className="flex items-center gap-2 text-amber-400 font-black text-sm uppercase tracking-widest">
                <Clock size={14} /> 待初審申請（Admin 兜底）
                {total > 0 && <span className="ml-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300">{total}</span>}
            </div>

            <div className="bg-slate-900 border-2 border-amber-500/20 p-6 rounded-4xl shadow-xl space-y-6">
                {loading ? (
                    <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-amber-400" /></div>
                ) : total === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-4">目前無待初審申請</p>
                ) : (
                    <>
                        {/* 一次性任務 pending */}
                        {bonusApps.length > 0 && (
                            <div className="space-y-3">
                                <p className="text-xs font-black text-amber-300 tracking-widest">一次性任務（{bonusApps.length}）</p>
                                {bonusApps.map(app => (
                                    <div key={app.id} className="bg-slate-800 rounded-2xl p-4 space-y-3">
                                        <div className="flex justify-between items-start gap-2">
                                            <div className="min-w-0">
                                                <p className="font-black text-white text-sm">{app.user_name}</p>
                                                <p className="text-xs text-slate-400">{app.squad_name ?? '無小隊'} · <span className="text-amber-300 font-bold">{app.quest_id}</span> · {app.interview_date}</p>
                                                {app.interview_target && <p className="text-xs text-slate-300 mt-0.5">對象：{app.interview_target}</p>}
                                                {app.description && <p className="text-xs text-slate-400 italic mt-0.5">{app.description}</p>}
                                            </div>
                                        </div>
                                        {app.screenshot_url && (
                                            <a href={app.screenshot_url} target="_blank" rel="noopener noreferrer" className="block">
                                                <img src={app.screenshot_url} alt="" loading="lazy" className="max-h-32 rounded-lg border border-slate-700" />
                                            </a>
                                        )}
                                        <textarea
                                            placeholder="備註（選填）"
                                            value={notesMap[app.id] || ''}
                                            onChange={e => setNotesMap(p => ({ ...p, [app.id]: e.target.value }))}
                                            rows={1}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-xs outline-none focus:border-amber-400 resize-none"
                                        />
                                        <div className="flex gap-2">
                                            <button disabled={reviewingId === app.id} onClick={() => handleBonus(app.id, false)} className="flex-1 py-2 bg-red-500/10 text-red-300 font-black rounded-xl text-xs border border-red-500/30 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1">
                                                <XCircle size={12} /> 退回
                                            </button>
                                            <button disabled={reviewingId === app.id} onClick={() => handleBonus(app.id, true)} className="flex-[2] py-2 bg-emerald-600 text-white font-black rounded-xl text-xs shadow active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1">
                                                <CheckCircle2 size={12} /> {reviewingId === app.id ? '處理中…' : '通過初審'}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* 臨時加碼 pending */}
                        {tempApps.length > 0 && (
                            <div className="space-y-3">
                                <p className="text-xs font-black text-amber-300 tracking-widest">臨時加碼任務（{tempApps.length}）</p>
                                {tempApps.map(app => (
                                    <div key={app.id} className="bg-slate-800 rounded-2xl p-4 space-y-3">
                                        <div className="flex justify-between items-start gap-2">
                                            <div className="min-w-0">
                                                <p className="font-black text-white text-sm">{app.user_name}</p>
                                                <p className="text-xs text-slate-400">{app.team_name ?? '無小隊'} · {app.quest_id} · {app.quest_date}</p>
                                                {app.note && <p className="text-xs text-slate-400 italic mt-0.5">學員備註：{app.note}</p>}
                                            </div>
                                        </div>
                                        {app.screenshot_url && (
                                            <a href={app.screenshot_url} target="_blank" rel="noopener noreferrer" className="block">
                                                <img src={app.screenshot_url} alt="" loading="lazy" className="max-h-32 rounded-lg border border-slate-700" />
                                            </a>
                                        )}
                                        <textarea
                                            placeholder="備註（選填）"
                                            value={notesMap[app.id] || ''}
                                            onChange={e => setNotesMap(p => ({ ...p, [app.id]: e.target.value }))}
                                            rows={1}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-xs outline-none focus:border-amber-400 resize-none"
                                        />
                                        <div className="flex gap-2">
                                            <button disabled={reviewingId === app.id} onClick={() => handleTemp(app.id, false)} className="flex-1 py-2 bg-red-500/10 text-red-300 font-black rounded-xl text-xs border border-red-500/30 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1">
                                                <XCircle size={12} /> 退回
                                            </button>
                                            <button disabled={reviewingId === app.id} onClick={() => handleTemp(app.id, true)} className="flex-[2] py-2 bg-emerald-600 text-white font-black rounded-xl text-xs shadow active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1">
                                                <CheckCircle2 size={12} /> {reviewingId === app.id ? '處理中…' : '通過初審'}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* 線上凝聚 pending */}
                        {onlineApps.length > 0 && (
                            <div className="space-y-3">
                                <p className="text-xs font-black text-amber-300 tracking-widest">線上凝聚（{onlineApps.length}）</p>
                                {onlineApps.map(app => (
                                    <div key={app.id} className="bg-slate-800 rounded-2xl p-4 space-y-3">
                                        <div className="flex justify-between items-start gap-2">
                                            <div className="min-w-0">
                                                <p className="font-black text-white text-sm">{app.userName ?? app.userId}</p>
                                                <p className="text-xs text-slate-400">{app.teamName ?? '無小隊'} · 週一 {app.weekMonday}</p>
                                                {app.notes && <p className="text-xs text-slate-400 italic mt-0.5">學員備註：{app.notes}</p>}
                                            </div>
                                        </div>
                                        <textarea
                                            placeholder="備註（選填）"
                                            value={notesMap[app.id] || ''}
                                            onChange={e => setNotesMap(p => ({ ...p, [app.id]: e.target.value }))}
                                            rows={1}
                                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-xs outline-none focus:border-amber-400 resize-none"
                                        />
                                        <div className="flex gap-2">
                                            <button disabled={reviewingId === app.id} onClick={() => handleOnline(app.id, false)} className="flex-1 py-2 bg-red-500/10 text-red-300 font-black rounded-xl text-xs border border-red-500/30 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1">
                                                <XCircle size={12} /> 退回
                                            </button>
                                            <button disabled={reviewingId === app.id} onClick={() => handleOnline(app.id, true)} className="flex-[2] py-2 bg-emerald-600 text-white font-black rounded-xl text-xs shadow active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1">
                                                <CheckCircle2 size={12} /> {reviewingId === app.id ? '處理中…' : '通過初審（+1000 入帳）'}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </section>
    );
}
