'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { Loader2, CheckCircle2, XCircle, ChevronRight, X, Search, ArrowUpDown, AlertTriangle, Trophy, Users } from 'lucide-react';
import type { TempQuestApplication } from '@/types';
import { listAllAppsForMission, reviewTempQuestByAdmin } from '@/app/actions/temp-quest-application';

type StatusFilter = 'all' | 'pending' | 'squad_approved' | 'approved' | 'rejected' | 'duplicate';
type SortKey = 'date_asc' | 'date_desc' | 'name' | 'team' | 'status';
type AwardFilter = 'none' | 'five' | 'full';

interface SquadStat { teamName: string; total: number; credited: number; }
interface CreditedNoApp { userId: string; userName: string; teamName: string | null; }

const FULL_THRESHOLD = 5; // ≥5 人完成的參獎門檻

const STATUS_LABEL: Record<string, string> = {
    pending: '待初審', squad_approved: '初審通過', approved: '已核准', rejected: '已退回',
};
const STATUS_CLASS: Record<string, string> = {
    pending: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    squad_approved: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    approved: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    rejected: 'bg-red-500/20 text-red-300 border-red-500/30',
};
const SORT_LABEL: Record<SortKey, string> = {
    date_desc: '最新優先', date_asc: '最舊優先', name: '姓名', team: '小隊', status: '狀態',
};

function toTaipeiTime(isoStr: string): string {
    return new Date(isoStr).toLocaleString('zh-TW', {
        timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
    });
}

export function MissionReviewTab({ questId, onShowMessage, showTeamAwards = false }: {
    questId: string;
    onShowMessage: (msg: string, type: 'success' | 'error' | 'info') => void;
    showTeamAwards?: boolean;
}) {
    const [apps, setApps] = useState<TempQuestApplication[]>([]);
    const [squadStats, setSquadStats] = useState<SquadStat[]>([]);
    const [creditedCount, setCreditedCount] = useState(0);
    const [creditedNoApp, setCreditedNoApp] = useState<CreditedNoApp[]>([]);
    const [showNoApp, setShowNoApp] = useState(false);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<StatusFilter>('all');
    const [awardFilter, setAwardFilter] = useState<AwardFilter>('none');
    const [sortBy, setSortBy] = useState<SortKey>('date_desc');
    const [nameSearch, setNameSearch] = useState('');
    const [reviewingId, setReviewingId] = useState<string | null>(null);
    const [notesMap, setNotesMap] = useState<Record<string, string>>({});
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

    const reload = useCallback(async () => {
        setLoading(true);
        const res = await listAllAppsForMission(questId);
        if (res.success) {
            setApps(res.apps);
            setSquadStats(res.squadStats);
            setCreditedCount(res.creditedCount);
            setCreditedNoApp(res.creditedNoApp);
        }
        else onShowMessage(res.error ?? '載入失敗', 'error');
        setLoading(false);
    }, [questId, onShowMessage]);

    useEffect(() => { reload(); }, [reload]);
    // 切換任務時重置篩選，避免沿用上一個任務的狀態
    useEffect(() => { setFilter('all'); setAwardFilter('none'); setNameSearch(''); }, [questId]);

    // user_id 出現 2+ 筆 → 重複送審
    const duplicateUserIds = useMemo(() => {
        const count = new Map<string, number>();
        for (const a of apps) count.set(a.user_id, (count.get(a.user_id) ?? 0) + 1);
        return new Set([...count.entries()].filter(([, n]) => n > 1).map(([id]) => id));
    }, [apps]);

    // 參獎資格：以實際入帳(credited)為準
    const fullTeams = useMemo(() => squadStats.filter(s => s.total > 0 && s.credited === s.total), [squadStats]);
    const fiveTeams = useMemo(() => squadStats.filter(s => s.credited >= FULL_THRESHOLD), [squadStats]);
    const fullTeamNames = useMemo(() => new Set(fullTeams.map(s => s.teamName)), [fullTeams]);
    const fiveTeamNames = useMemo(() => new Set(fiveTeams.map(s => s.teamName)), [fiveTeams]);

    const counts = useMemo(() => ({
        all: apps.length,
        pending: apps.filter(a => a.status === 'pending').length,
        squad_approved: apps.filter(a => a.status === 'squad_approved').length,
        approved: apps.filter(a => a.status === 'approved').length,
        rejected: apps.filter(a => a.status === 'rejected').length,
        duplicate: apps.filter(a => duplicateUserIds.has(a.user_id)).length,
    }), [apps, duplicateUserIds]);

    // 參獎篩選作用的隊伍集合
    const awardTeamSet = awardFilter === 'full' ? fullTeamNames : awardFilter === 'five' ? fiveTeamNames : null;

    const displayedSquads = useMemo(() => (
        awardTeamSet ? squadStats.filter(s => awardTeamSet.has(s.teamName)) : squadStats
    ), [squadStats, awardTeamSet]);

    const displayed = useMemo(() => {
        let list = apps;
        if (filter === 'duplicate') list = list.filter(a => duplicateUserIds.has(a.user_id));
        else if (filter !== 'all') list = list.filter(a => a.status === filter);

        if (awardTeamSet) list = list.filter(a => a.team_name != null && awardTeamSet.has(a.team_name));

        if (nameSearch.trim()) {
            const q = nameSearch.trim().toLowerCase();
            list = list.filter(a => a.user_name.toLowerCase().includes(q));
        }

        return [...list].sort((a, b) => {
            if (sortBy === 'date_asc')  return (a.created_at ?? '') < (b.created_at ?? '') ? -1 : 1;
            if (sortBy === 'date_desc') return (a.created_at ?? '') > (b.created_at ?? '') ? -1 : 1;
            if (sortBy === 'name')   return a.user_name.localeCompare(b.user_name, 'zh-TW');
            if (sortBy === 'team')   return (a.team_name ?? '').localeCompare(b.team_name ?? '', 'zh-TW');
            if (sortBy === 'status') return a.status.localeCompare(b.status);
            return 0;
        });
    }, [apps, filter, awardTeamSet, nameSearch, sortBy, duplicateUserIds]);

    const handleReview = async (appId: string, action: 'approve' | 'reject') => {
        setReviewingId(appId);
        const res = await reviewTempQuestByAdmin(appId, action, notesMap[appId] ?? '', 'admin');
        setReviewingId(null);
        if (res.success) { onShowMessage(action === 'approve' ? '終審通過，已入帳' : '已退回', 'success'); await reload(); }
        else onShowMessage(res.error ?? '操作失敗', 'error');
    };

    if (loading) return <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-amber-400" /></div>;

    return (
        <div className="space-y-5">
            <div className="flex items-center gap-2 text-amber-400 font-black text-sm uppercase tracking-widest">
                <ChevronRight size={16} /> 全部送審記錄
            </div>

            {/* 統計卡（前 5 張為申請狀態；末張為實際入帳＝真正完成，含直接補分） */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                {([
                    ['all',           '送審總計', counts.all,           'text-slate-300'],
                    ['approved',      '申請核准', counts.approved,      'text-emerald-400'],
                    ['squad_approved','待終審',   counts.squad_approved,'text-blue-400'],
                    ['pending',       '待初審',   counts.pending,       'text-amber-400'],
                    ['rejected',      '已退回',   counts.rejected,      'text-red-400'],
                ] as [StatusFilter, string, number, string][]).map(([key, label, count, color]) => (
                    <div key={key} className="bg-slate-900 border border-slate-700 rounded-2xl p-3 text-center">
                        <p className={`text-2xl font-black ${color}`}>{count}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{label}</p>
                    </div>
                ))}
                <div className="bg-emerald-950/40 border border-emerald-600/40 rounded-2xl p-3 text-center">
                    <p className="text-2xl font-black text-emerald-300">{creditedCount}</p>
                    <p className="text-xs text-emerald-400/80 mt-0.5">實際入帳</p>
                </div>
            </div>

            {/* 參獎資格（僅秘密任務2 等啟用者）— 以實際入帳為準、不含大隊長 */}
            {showTeamAwards && (
                <div className="bg-amber-950/30 border border-amber-700/40 rounded-3xl p-4 space-y-4">
                    <p className="text-xs font-black text-amber-300 uppercase tracking-widest flex items-center gap-1.5">
                        <Trophy size={13} /> 參獎資格（依實際入帳，不含大隊長）
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="bg-slate-900/60 border border-emerald-700/40 rounded-2xl p-3">
                            <p className="text-xs font-black text-emerald-300 mb-2 flex items-center gap-1">
                                <CheckCircle2 size={12} /> 全組完成 · {fullTeams.length} 隊
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {fullTeams.length === 0 && <span className="text-[11px] text-slate-500">尚無</span>}
                                {fullTeams.map(s => (
                                    <span key={s.teamName} className="text-[11px] bg-emerald-900/40 border border-emerald-700/40 rounded-lg px-2 py-1 text-emerald-200">
                                        {s.teamName} <span className="text-emerald-400/70">{s.credited}/{s.total}</span>
                                    </span>
                                ))}
                            </div>
                        </div>
                        <div className="bg-slate-900/60 border border-amber-700/40 rounded-2xl p-3">
                            <p className="text-xs font-black text-amber-300 mb-2 flex items-center gap-1">
                                <Users size={12} /> ≥{FULL_THRESHOLD} 人完成 · {fiveTeams.length} 隊
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {fiveTeams.length === 0 && <span className="text-[11px] text-slate-500">尚無</span>}
                                {fiveTeams.map(s => (
                                    <span key={s.teamName} className="text-[11px] bg-amber-900/40 border border-amber-700/40 rounded-lg px-2 py-1 text-amber-200">
                                        {s.teamName} <span className="text-amber-400/70">{s.credited}/{s.total}</span>
                                        {fullTeamNames.has(s.teamName) && <span className="ml-1 text-emerald-400">★全組</span>}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                        <span className="text-[11px] text-slate-500">篩選下方名單：</span>
                        {([
                            ['none', '全部'],
                            ['full', `全組完成 (${fullTeams.length})`],
                            ['five', `≥${FULL_THRESHOLD} 人完成 (${fiveTeams.length})`],
                        ] as [AwardFilter, string][]).map(([key, label]) => (
                            <button key={key} onClick={() => setAwardFilter(key)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                                    awardFilter === key ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
                                }`}
                            >{label}</button>
                        ))}
                    </div>
                </div>
            )}

            {/* 直接補分（無申請）名單：申請列表看不到，這裡補列，回應「後台沒顯示有做過」 */}
            {creditedNoApp.length > 0 && (
                <div className="bg-slate-900 border border-emerald-700/30 rounded-2xl p-3">
                    <button
                        onClick={() => setShowNoApp(v => !v)}
                        className="w-full flex items-center justify-between text-xs font-black text-emerald-300"
                    >
                        <span>✅ 已入帳但無送審申請（直接補分）：{creditedNoApp.length} 人</span>
                        <span className="text-slate-500">{showNoApp ? '收合 ▲' : '展開 ▼'}</span>
                    </button>
                    {showNoApp && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                            {creditedNoApp.map(c => (
                                <span key={c.userId} className="text-[11px] bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-slate-300">
                                    {c.userName}<span className="text-slate-500">（{c.teamName ?? '無小隊'}）</span>
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* 小隊完成率（以實際入帳為準）*/}
            <div className="bg-slate-900 border border-slate-700 rounded-3xl p-4">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
                    各小隊完成率（實際入帳）{awardTeamSet && <span className="text-amber-400">· 已篩選 {displayedSquads.length} 隊</span>}
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {displayedSquads.map(s => {
                        const rate = s.total > 0 ? Math.round(s.credited / s.total * 100) : 0;
                        const isFull = s.total > 0 && s.credited === s.total;
                        const isFive = s.credited >= FULL_THRESHOLD;
                        const barColor = rate === 100 ? 'bg-emerald-500' : rate >= 50 ? 'bg-amber-500' : 'bg-slate-600';
                        const ring = showTeamAwards && isFull ? 'ring-1 ring-emerald-500/60'
                            : showTeamAwards && isFive ? 'ring-1 ring-amber-500/50' : '';
                        return (
                            <div key={s.teamName} className={`bg-slate-800 rounded-xl p-2.5 ${ring}`}>
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-xs font-bold text-slate-200">{s.teamName}</span>
                                    <span className={`text-xs font-black ${rate === 100 ? 'text-emerald-400' : 'text-slate-400'}`}>{s.credited}/{s.total}</span>
                                </div>
                                <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                    <div className={`h-full ${barColor} transition-all`} style={{ width: `${rate}%` }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 搜尋 + 排序 */}
            <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                    <input
                        type="text"
                        placeholder="搜尋姓名…"
                        value={nameSearch}
                        onChange={e => setNameSearch(e.target.value)}
                        className="w-full pl-8 pr-8 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-amber-500/50"
                    />
                    {nameSearch && (
                        <button onClick={() => setNameSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                            <X size={12} />
                        </button>
                    )}
                </div>
                <div className="relative">
                    <ArrowUpDown size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                    <select
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value as SortKey)}
                        className="pl-7 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-200 outline-none focus:border-amber-500/50 cursor-pointer"
                    >
                        {(Object.entries(SORT_LABEL) as [SortKey, string][]).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* 篩選列 */}
            <div className="flex flex-wrap gap-2 items-center">
                {([
                    ['all',           `全部 (${counts.all})`],
                    ['squad_approved',`待終審 (${counts.squad_approved})`],
                    ['pending',       `待初審 (${counts.pending})`],
                    ['approved',      `已核准 (${counts.approved})`],
                    ['rejected',      `已退回 (${counts.rejected})`],
                    ['duplicate',     `重複送審 (${counts.duplicate})`],
                ] as [StatusFilter, string][]).map(([key, label]) => (
                    <button key={key} onClick={() => setFilter(key)}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                            filter === key ? 'bg-amber-500 text-black'
                            : key === 'duplicate' ? 'bg-orange-900/30 text-orange-400 border border-orange-700/40 hover:bg-orange-900/50'
                            : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
                        }`}
                    >
                        {key === 'duplicate' && <AlertTriangle size={11} />}{label}
                    </button>
                ))}
                <span className="ml-auto text-xs text-slate-500">顯示 {displayed.length} 筆</span>
            </div>

            {/* 申請卡 */}
            <div className="space-y-3">
                {displayed.length === 0 && <p className="text-center text-slate-500 py-8 text-sm">無符合條件的記錄</p>}
                {displayed.map(app => {
                    const isDup = duplicateUserIds.has(app.user_id);
                    return (
                        <div key={app.id} className={`border rounded-2xl p-4 space-y-3 ${isDup ? 'bg-orange-950/30 border-orange-700/40' : 'bg-slate-800 border-slate-700'}`}>
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <p className="font-black text-slate-100">{app.user_name}</p>
                                        {isDup && (
                                            <span className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">
                                                <AlertTriangle size={10} /> 重複送審
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-400 mt-0.5">
                                        {app.team_name ?? '（無小隊）'}{' · '}活動日 {app.quest_date}{' · '}送審 {app.created_at ? toTaipeiTime(app.created_at) : '—'}
                                    </p>
                                </div>
                                <span className={`shrink-0 text-xs font-black px-2 py-0.5 rounded-full border ${STATUS_CLASS[app.status] ?? ''}`}>
                                    {STATUS_LABEL[app.status] ?? app.status}
                                </span>
                            </div>

                            {app.note && (
                                <p className="text-xs text-slate-300 italic bg-slate-700/50 rounded-xl px-3 py-2">學員備註：{app.note}</p>
                            )}

                            {app.screenshot_url && (
                                <button onClick={() => setLightboxUrl(app.screenshot_url!)} className="block">
                                    <img src={app.screenshot_url} alt="截圖"
                                        className="max-h-32 rounded-xl border border-slate-600 object-cover hover:opacity-80 transition-opacity cursor-pointer" />
                                    <p className="text-[10px] text-slate-500 mt-1">點擊放大</p>
                                </button>
                            )}

                            <div className="text-xs text-slate-500 space-y-0.5">
                                {app.squad_review_by && (
                                    <p>初審：{app.squad_review_by} · {app.squad_review_at ? toTaipeiTime(app.squad_review_at) : ''}
                                        {app.squad_review_notes ? ` · 「${app.squad_review_notes}」` : ''}</p>
                                )}
                                {app.final_review_by && (
                                    <p>終審：{app.final_review_by} · {app.final_review_at ? toTaipeiTime(app.final_review_at) : ''}
                                        {app.final_review_notes ? ` · 「${app.final_review_notes}」` : ''}</p>
                                )}
                            </div>

                            {app.status === 'squad_approved' && (
                                <div className="space-y-2 pt-1 border-t border-slate-700">
                                    <textarea rows={1} placeholder="終審備註（選填）"
                                        value={notesMap[app.id] ?? ''}
                                        onChange={e => setNotesMap(prev => ({ ...prev, [app.id]: e.target.value }))}
                                        className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-amber-500/50 resize-none"
                                    />
                                    <div className="flex gap-2">
                                        <button disabled={reviewingId === app.id} onClick={() => handleReview(app.id, 'reject')}
                                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-black bg-red-900/30 text-red-400 border border-red-800/50 hover:bg-red-900/50 disabled:opacity-50 transition-all">
                                            {reviewingId === app.id ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />} 終審退回
                                        </button>
                                        <button disabled={reviewingId === app.id} onClick={() => handleReview(app.id, 'approve')}
                                            className="flex-[2] flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-black bg-emerald-700 text-white hover:bg-emerald-600 disabled:opacity-50 transition-all">
                                            {reviewingId === app.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} 終審通過
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Lightbox — portal 掛到 body，避免被上層 overflow/transform 裁切 */}
            {lightboxUrl && typeof document !== 'undefined' && ReactDOM.createPortal(
                <div
                    className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center p-4"
                    onClick={() => setLightboxUrl(null)}
                >
                    <button
                        onClick={() => setLightboxUrl(null)}
                        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20"
                    >
                        <X size={20} />
                    </button>
                    <img
                        src={lightboxUrl}
                        alt="截圖放大"
                        className="max-w-full max-h-[90vh] rounded-2xl object-contain"
                        onClick={e => e.stopPropagation()}
                    />
                </div>,
                document.body
            )}
        </div>
    );
}
