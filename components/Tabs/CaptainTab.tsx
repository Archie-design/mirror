import { useState, useEffect, useCallback } from 'react';
import { ShieldAlert, Loader2, Grid3x3, Users, Check, Crown, Calendar as CalendarIcon, Send, Star, RotateCcw } from 'lucide-react';
import dynamic from 'next/dynamic';
import QRCode from 'react-qr-code';

const SquadGrowthChart = dynamic(
    () => import('@/components/Charts/SquadGrowthChart').then(m => ({ default: m.SquadGrowthChart })),
    { ssr: false, loading: () => <div className="h-72 flex items-center justify-center"><Loader2 className="animate-spin text-teal-500" /></div> }
);
import { SQUAD_ROLES } from '@/lib/constants';
import { TeamSettings, BonusApplication, SquadMemberStats, TempQuestApplication } from '@/types';
import { getSquadGrids, uncompleteCellByCapt } from '@/app/actions/nine-grid';
import {
    getTeamGatheringContext,
    submitGatheringForReview,
    scanGatheringQR,
    type TeamGatheringContext,
} from '@/app/actions/squad-gathering';
import {
    listPendingOnlineGatheringsForCaptain,
    reviewOnlineGathering,
    type OnlineGatheringApp,
} from '@/app/actions/online-gathering';
import {
    listTempQuestAppsForCaptain,
    reviewTempQuestByCaptain,
} from '@/app/actions/temp-quest-application';
import { exportTeamDailyLogsCsv, getMemberDailyDetails, type MemberDailyDetail } from '@/app/actions/team';
import { downloadCsv } from '@/lib/utils/csv-download';
import { ScrollText, CheckCircle2 } from 'lucide-react';
import { getLogicalDateStr } from '@/lib/utils/time';
import type { UserNineGrid } from '@/types';

interface SquadMemberRole {
    userId: string;
    name: string;
    squadRole?: string;
}

interface CaptainTabProps {
    teamName: string;
    teamSettings?: TeamSettings;
    pendingBonusApps: BonusApplication[];
    onReviewBonus: (appId: string, approve: boolean, notes: string) => Promise<void>;
    squadMembersForRoles?: SquadMemberRole[];
    onSetSquadRole?: (targetUserId: string, role: string | null) => Promise<void>;
    squadMembers?: SquadMemberStats[];
    squadMembersLoaded?: boolean;
    captainId: string;
    captainName: string;
}

// 可抽籤的定課：基本定課 + 加權定課

function RolePicker({ member, onSet }: {
    member: { userId: string; name: string; squadRole?: string };
    onSet: (role: string | null) => Promise<void>;
}) {
    const [saving, setSaving] = useState(false);
    const handleSelect = async (role: string) => {
        const next = member.squadRole === role ? null : role;
        setSaving(true);
        await onSet(next);
        setSaving(false);
    };
    return (
        <div className="bg-gray-50 rounded-2xl p-3 space-y-2 border border-gray-200">
            <div className="flex items-center justify-between">
                <span className="font-bold text-gray-900 text-base">{member.name}</span>
                {member.squadRole
                    ? <span className="text-sm font-black text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">{member.squadRole}</span>
                    : <span className="text-sm text-gray-400">未指派</span>
                }
            </div>
            <div className="flex flex-wrap gap-1.5">
                {SQUAD_ROLES.map(role => (
                    <button
                        key={role}
                        disabled={saving}
                        onClick={() => handleSelect(role)}
                        className={`px-2.5 py-1 rounded-lg text-sm font-bold transition-all active:scale-95
                            ${member.squadRole === role
                                ? 'bg-violet-600 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                        {saving && member.squadRole === role ? '…' : role}
                    </button>
                ))}
            </div>
        </div>
    );
}


function isActive(lastCheckIn?: string): boolean {
    // lastCheckIn 為「最後一筆打卡的邏輯日」（getLogicalDateStr 計算）
    // 邏輯日一天沒打卡即沉寂：只比對今日邏輯日
    if (!lastCheckIn) return false;
    return lastCheckIn === getLogicalDateStr();
}

// ── 小隊九宮格總覽 ──────────────────────────────────────────────────────────
function SquadNineGridSection({ captainId }: { captainId: string }) {
    type GridRow = UserNineGrid & { user_name: string };
    const [grids, setGrids] = useState<GridRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [reverting, setReverting] = useState<string | null>(null); // `${memberId}:${cellIndex}`
    const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

    const reload = useCallback(() => {
        getSquadGrids(captainId).then(res => {
            if (res.success) setGrids(res.grids ?? []);
            setLoading(false);
        });
    }, [captainId]);

    useEffect(() => { reload(); }, [reload]);

    const handleRevert = async (memberId: string, memberName: string, cellIndex: number, cellLabel: string) => {
        if (!window.confirm(`確定幫「${memberName}」回溯「${cellLabel}」？\n此操作將清除該格打卡紀錄，並扣回連線加分（如有）。`)) return;
        const key = `${memberId}:${cellIndex}`;
        setReverting(key);
        setMsg(null);
        const res = await uncompleteCellByCapt(captainId, memberId, cellIndex);
        setReverting(null);
        if (res.success) {
            const bonus = res.scoreReversed > 0 ? `（已扣回 ${res.scoreReversed} 分連線獎勵）` : '';
            setMsg({ text: `已回溯「${memberName}」的「${cellLabel}」${bonus}`, ok: true });
            reload();
        } else {
            setMsg({ text: res.error, ok: false });
        }
        setTimeout(() => setMsg(null), 4000);
    };

    if (loading) return (
        <section className="bg-white border-2 border-teal-100 p-6 rounded-4xl">
            <div className="flex items-center gap-2 text-teal-600 text-sm font-black">
                <Grid3x3 size={16} /> 小隊九宮格
            </div>
            <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-teal-500" /></div>
        </section>
    );

    return (
        <section className="bg-white border-2 border-teal-100 p-6 rounded-4xl space-y-4 shadow-md">
            <h3 className="text-lg font-black text-gray-900 border-b border-gray-200 pb-3 flex items-center gap-2">
                <Grid3x3 size={18} className="text-teal-500" /> 小隊九宮格總覽
            </h3>
            {msg && (
                <p className={`text-xs font-bold px-3 py-2 rounded-xl border ${msg.ok ? 'text-teal-700 bg-teal-50 border-teal-200' : 'text-red-600 bg-red-50 border-red-200'}`}>
                    {msg.text}
                </p>
            )}
            {grids.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">小隊成員尚未選擇旅伴或初始化九宮格</p>
            ) : (
                <div className="space-y-6">
                    {grids.map(grid => (
                        <div key={grid.member_id} className="space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="font-black text-gray-900 text-base">{grid.user_name}</span>
                                {grid.companion_type ? (
                                    <span className="text-sm text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">
                                        {grid.companion_type} · {grid.cells.filter(c => c.completed).length}/9 格完成
                                    </span>
                                ) : (
                                    <span className="text-sm text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">尚未初始化</span>
                                )}
                            </div>
                            {!grid.companion_type ? null : (
                                <div className="grid grid-cols-3 gap-1.5">
                                    {grid.cells.map((cell, i) => {
                                        const revertKey = `${grid.member_id}:${i}`;
                                        const isReverting = reverting === revertKey;
                                        return (
                                            <div
                                                key={i}
                                                className={`rounded-xl p-2 space-y-1 border ${cell.completed ? 'bg-teal-50 border-teal-200' : 'bg-gray-50 border-gray-200'}`}
                                            >
                                                <span className={`text-sm font-black leading-tight ${cell.completed ? 'text-teal-700' : 'text-gray-600'}`}>
                                                    {cell.label || `格子 ${i + 1}`}
                                                </span>
                                                {cell.completed && (
                                                    <div className="flex items-center justify-between gap-1">
                                                        <span className="text-xs text-teal-600 font-bold">✓ 已完成</span>
                                                        <button
                                                            disabled={isReverting || reverting !== null}
                                                            onClick={() => handleRevert(grid.member_id, grid.user_name, i, cell.label || `格子 ${i + 1}`)}
                                                            className="p-1 rounded-lg text-gray-400 hover:text-orange-500 hover:bg-orange-50 border border-transparent hover:border-orange-200 transition-all disabled:opacity-30"
                                                            title="回溯此格"
                                                        >
                                                            {isReverting ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}

// ── 本週實體凝聚（wk3_offline） ─────────────────────────────────────────────
function SquadGatheringSection({ captainId }: { captainId: string }) {
    const [ctx, setCtx] = useState<TeamGatheringContext | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [selfCheckingIn, setSelfCheckingIn] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const reload = useCallback(async () => {
        const res = await getTeamGatheringContext(captainId);
        if (res.success) setCtx(res.context ?? null);
        setLoading(false);
    }, [captainId]);

    useEffect(() => { reload(); }, [reload]);

    // 當處於排定中時每 15 秒刷新一次出席進度；分頁不可見時暫停以節省請求
    useEffect(() => {
        if (!ctx?.session || ctx.session.status !== 'scheduled') return;
        let id: ReturnType<typeof setInterval> | null = null;

        const start = () => {
            if (id !== null) return;
            id = setInterval(reload, 15000);
        };
        const stop = () => {
            if (id !== null) { clearInterval(id); id = null; }
        };
        const onVisChange = () => {
            if (document.visibilityState === 'visible') {
                reload();  // 回到前景時立即補抓一次
                start();
            } else {
                stop();
            }
        };

        if (document.visibilityState === 'visible') start();
        document.addEventListener('visibilitychange', onVisChange);
        return () => {
            stop();
            document.removeEventListener('visibilitychange', onVisChange);
        };
    }, [ctx?.session, reload]);

    const handleSubmit = async () => {
        if (!ctx?.session) return;
        setSubmitting(true);
        setErr(null);
        const res = await submitGatheringForReview(captainId, ctx.session.id);
        if (!res.success) setErr(res.error ?? '送審失敗');
        await reload();
        setSubmitting(false);
    };

    const handleSelfCheckin = async () => {
        if (!ctx?.session) return;
        setSelfCheckingIn(true);
        setErr(null);
        const res = await scanGatheringQR(captainId, ctx.session.id);
        if (!res.success) setErr(res.error ?? '報到失敗');
        await reload();
        setSelfCheckingIn(false);
    };

    if (loading) return (
        <section className="bg-white border-2 border-rose-100 p-6 rounded-4xl">
            <div className="flex items-center gap-2 text-rose-600 text-sm font-black">
                <CalendarIcon size={16} /> 本週實體凝聚
            </div>
            <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-rose-500" /></div>
        </section>
    );

    const session = ctx?.session;
    const attendees = ctx?.attendees ?? [];
    const teamMemberCount = ctx?.teamMemberCount ?? 0;
    const hasCommandant = attendees.some(a => a.isCommandant);
    const captainAlreadyIn = attendees.some(a => a.userId === captainId);
    const isToday = session?.gatheringDate === getLogicalDateStr();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '');
    const qrUrl = session ? `${appUrl}/squad-gathering/${session.id}` : '';

    return (
        <section className="bg-white border-2 border-rose-100 p-6 rounded-4xl space-y-4 shadow-md">
            <h3 className="text-lg font-black text-gray-900 border-b border-gray-200 pb-3 flex items-center gap-2">
                <CalendarIcon size={18} className="text-rose-500" /> 本週實體凝聚
            </h3>

            {!session && (
                <p className="text-sm text-gray-400 text-center py-6">
                    本週尚未排定實體凝聚，請等待大隊長 / 管理員安排
                </p>
            )}

            {session && session.status === 'scheduled' && !isToday && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
                    <p className="font-black text-amber-700">預定凝聚日：{session.gatheringDate}</p>
                    <p className="text-sm text-amber-500 mt-1">當日將顯示掃碼 QR Code</p>
                </div>
            )}

            {session && session.status === 'scheduled' && isToday && (
                <div className="space-y-4">
                    <div className="bg-gray-50 rounded-2xl p-5 flex flex-col items-center gap-3 border border-gray-200">
                        <p className="text-sm font-black text-gray-700">請隊員 / 大隊長掃以下 QR 完成報到</p>
                        <div className="bg-white p-3 rounded-xl">
                            <QRCode value={qrUrl} size={180} />
                        </div>
                        <p className="text-xs text-gray-400 break-all text-center">{qrUrl}</p>
                    </div>

                    <button
                        disabled={selfCheckingIn || captainAlreadyIn}
                        onClick={handleSelfCheckin}
                        className="w-full py-3 bg-emerald-500 text-white font-black rounded-2xl shadow-md active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {selfCheckingIn ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                        {captainAlreadyIn ? '我已完成報到' : '我也到場了（小隊長自己簽到）'}
                    </button>

                    <div className="bg-gray-50 rounded-2xl p-4 space-y-2 border border-gray-200">
                        <div className="flex items-center gap-2 text-sm font-black text-gray-700">
                            <Users size={14} /> 出席進度 {attendees.length} / {teamMemberCount}
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                            <Crown size={14} className={hasCommandant ? 'text-amber-500' : 'text-gray-400'} />
                            <span className={hasCommandant ? 'text-amber-600 font-bold' : 'text-gray-500'}>
                                {hasCommandant ? '大隊長已到場（每人 +1000）' : '大隊長尚未到場'}
                            </span>
                        </div>
                        {attendees.length > 0 && (
                            <div className="pt-2 border-t border-gray-200 grid grid-cols-2 gap-1">
                                {attendees.map(a => (
                                    <span key={a.userId} className="text-sm text-gray-600 flex items-center gap-1">
                                        <Check size={12} className="text-emerald-500" />
                                        {a.userName ?? a.userId}
                                        {a.isCommandant && <Crown size={10} className="text-amber-500" />}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    <button
                        disabled={submitting || attendees.length === 0}
                        onClick={handleSubmit}
                        className="w-full py-3 bg-rose-600 text-white font-black rounded-2xl shadow-lg active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                        送出審核（交大隊長終審）
                    </button>
                    {err && <p className="text-sm text-red-500 text-center">{err}</p>}
                </div>
            )}

            {session && session.status === 'pending_review' && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 text-center space-y-2">
                    <p className="font-black text-yellow-700">審核中…等待大隊長終審</p>
                    <p className="text-sm text-yellow-600">
                        出席 {attendees.length} / {teamMemberCount}
                        {hasCommandant && ' · 大隊長已到'}
                    </p>
                </div>
            )}

            {session && session.status === 'approved' && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center space-y-2">
                    <p className="font-black text-emerald-700">
                        ✓ 已核准 — 每人 +{session.approvedRewardPerPerson ?? 300} 分
                    </p>
                    <p className="text-sm text-emerald-600">
                        出席 {session.approvedAttendeeCount ?? attendees.length} / {session.approvedMemberCount ?? teamMemberCount}
                        {session.approvedHasCommandant && ' · 大隊長到場'}
                    </p>
                </div>
            )}

            {session && session.status === 'rejected' && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-center space-y-2">
                    <p className="font-black text-red-700">已退回</p>
                    {session.notes && <p className="text-sm text-red-600 italic">{session.notes}</p>}
                </div>
            )}
        </section>
    );
}

// ── 本週線上凝聚初審（wk3_online 一級審核）────────────────────────────────
function SquadOnlineGatheringReviewSection({ captainId }: { captainId: string }) {
    const [apps, setApps] = useState<OnlineGatheringApp[]>([]);
    const [loading, setLoading] = useState(true);
    const [reviewingId, setReviewingId] = useState<string | null>(null);
    const [notesMap, setNotesMap] = useState<Record<string, string>>({});
    const [err, setErr] = useState<string | null>(null);

    const reload = useCallback(async () => {
        const res = await listPendingOnlineGatheringsForCaptain(captainId);
        if (res.success) setApps(res.apps ?? []);
        setLoading(false);
    }, [captainId]);

    useEffect(() => { reload(); }, [reload]);

    const handleReview = async (appId: string, approve: boolean) => {
        setReviewingId(appId);
        setErr(null);
        const res = await reviewOnlineGathering(captainId, appId, approve, notesMap[appId] || '');
        if (!res.success) setErr(res.error ?? '審核失敗');
        else if (res.warning) setErr(res.warning);
        await reload();
        setNotesMap(prev => { const n = { ...prev }; delete n[appId]; return n; });
        setReviewingId(null);
    };

    return (
        <section className="bg-white border-2 border-emerald-100 p-6 rounded-4xl space-y-4 shadow-md">
            <h3 className="text-lg font-black text-gray-900 border-b border-gray-200 pb-3 flex items-center gap-2">
                <Star size={18} className="text-emerald-500" /> 本週線上凝聚審核（一級）
            </h3>
            {loading ? (
                <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-emerald-500" /></div>
            ) : apps.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">目前無待審線上凝聚申請</p>
            ) : (
                <div className="space-y-3">
                    {apps.map(app => (
                        <div key={app.id} className="bg-gray-50 rounded-2xl p-4 space-y-3 border border-gray-200">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="font-black text-gray-900">{app.userName ?? app.userId}</p>
                                    <p className="text-sm text-gray-500">週一：{app.weekMonday}</p>
                                </div>
                                <span className="text-sm font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">+100 分</span>
                            </div>
                            {app.notes && (
                                <p className="text-sm text-gray-600 bg-white border border-gray-200 rounded-xl p-2 italic">「{app.notes}」</p>
                            )}
                            <textarea
                                placeholder="備註（選填，退回時建議填寫原因）"
                                value={notesMap[app.id] || ''}
                                onChange={e => setNotesMap(prev => ({ ...prev, [app.id]: e.target.value }))}
                                rows={2}
                                className="w-full bg-white border border-gray-200 rounded-xl p-2 text-gray-900 text-sm outline-none focus:border-emerald-400 resize-none"
                            />
                            <div className="flex gap-3">
                                <button
                                    disabled={reviewingId === app.id}
                                    onClick={() => handleReview(app.id, false)}
                                    className="flex-1 py-2 bg-red-50 text-red-500 font-black rounded-xl border border-red-200 active:scale-95 disabled:opacity-50"
                                >
                                    ❌ 退回
                                </button>
                                <button
                                    disabled={reviewingId === app.id}
                                    onClick={() => handleReview(app.id, true)}
                                    className="flex-[2] py-2 bg-emerald-600 text-white font-black rounded-xl shadow-lg active:scale-95 disabled:opacity-50"
                                >
                                    {reviewingId === app.id ? <Loader2 size={14} className="animate-spin inline" /> : '✅ 核准並入帳 +100'}
                                </button>
                            </div>
                        </div>
                    ))}
                    {err && <p className="text-sm text-red-500 text-center">{err}</p>}
                </div>
            )}
        </section>
    );
}

function TempQuestReviewSection({ captainId }: { captainId: string }) {
    const [apps, setApps] = useState<TempQuestApplication[]>([]);
    const [loading, setLoading] = useState(true);
    const [reviewingId, setReviewingId] = useState<string | null>(null);
    const [notesMap, setNotesMap] = useState<Record<string, string>>({});
    const [err, setErr] = useState<string | null>(null);

    const reload = useCallback(async () => {
        const res = await listTempQuestAppsForCaptain(captainId);
        if (res.success) setApps(res.apps ?? []);
        setLoading(false);
    }, [captainId]);

    useEffect(() => { reload(); }, [reload]);

    const handleReview = async (appId: string, approve: boolean) => {
        setReviewingId(appId);
        setErr(null);
        const res = await reviewTempQuestByCaptain(appId, captainId, approve, notesMap[appId] || '');
        if (!res.success) setErr(res.error ?? '審核失敗');
        await reload();
        setNotesMap(prev => { const n = { ...prev }; delete n[appId]; return n; });
        setReviewingId(null);
    };

    if (!loading && apps.length === 0) return null;

    return (
        <section className="bg-white border-2 border-blue-100 p-6 rounded-4xl space-y-4 shadow-md">
            <h3 className="text-lg font-black text-gray-900 border-b border-gray-200 pb-3 flex items-center gap-2">
                🎬 臨時加碼任務審核（初審）
            </h3>
            {loading ? (
                <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-blue-500" /></div>
            ) : (
                <div className="space-y-3">
                    {apps.map(app => (
                        <div key={app.id} className="bg-gray-50 rounded-2xl p-4 space-y-3 border border-gray-200">
                            <div className="flex justify-between items-start flex-wrap gap-2">
                                <div>
                                    <p className="font-black text-gray-900">{app.user_name}</p>
                                    <p className="text-xs text-gray-500">
                                        任務：<span className="text-amber-600 font-bold">{app.quest_title ?? app.quest_id}</span> · 日期：{app.quest_date}
                                    </p>
                                </div>
                                <span className="text-xs font-black text-amber-600 bg-amber-50 px-2 py-1 rounded-lg">待初審</span>
                            </div>
                            {app.note && (
                                <p className="text-sm text-gray-600 bg-white border border-gray-200 rounded-xl p-2 italic">「{app.note}」</p>
                            )}
                            {app.screenshot_url && (
                                <a href={app.screenshot_url} target="_blank" rel="noopener noreferrer" className="block">
                                    <img src={app.screenshot_url} alt="佐證截圖" loading="lazy"
                                        className="max-h-40 rounded-xl border border-gray-200 hover:opacity-90 transition-opacity" />
                                </a>
                            )}
                            <textarea
                                placeholder="備註（選填，退回時建議說明原因）"
                                value={notesMap[app.id] || ''}
                                onChange={e => setNotesMap(prev => ({ ...prev, [app.id]: e.target.value }))}
                                rows={2}
                                className="w-full bg-white border border-gray-200 rounded-xl p-2 text-gray-900 text-sm outline-none focus:border-blue-400 resize-none"
                            />
                            <div className="flex gap-3">
                                <button
                                    disabled={reviewingId === app.id}
                                    onClick={() => handleReview(app.id, false)}
                                    className="flex-1 py-2 bg-red-50 text-red-500 font-black rounded-xl border border-red-200 active:scale-95 disabled:opacity-50"
                                >❌ 退回</button>
                                <button
                                    disabled={reviewingId === app.id}
                                    onClick={() => handleReview(app.id, true)}
                                    className="flex-[2] py-2 bg-blue-600 text-white font-black rounded-xl shadow-lg active:scale-95 disabled:opacity-50"
                                >
                                    {reviewingId === app.id
                                        ? <Loader2 size={14} className="animate-spin inline" />
                                        : '✅ 通過，送終審'}
                                </button>
                            </div>
                        </div>
                    ))}
                    {err && <p className="text-sm text-red-500 text-center">{err}</p>}
                </div>
            )}
        </section>
    );
}

// 個人定課查詢結果：單日 card
function MemberDayCard({ day }: { day: MemberDailyDetail }) {
    const rows: Array<{ label: string; items: string[] }> = [
        { label: '每日定課',     items: day.bucket.daily },
        { label: '打拳',         items: day.bucket.boxing },
        { label: '其他加權任務', items: day.bucket.pOther },
        { label: '吃素',         items: day.bucket.diet },
        { label: '週主題',       items: day.bucket.topicWeek },
        { label: '天使通話',     items: day.bucket.angel },
        { label: '凝聚',         items: day.bucket.gather },
        { label: '九宮格',       items: day.bucket.nine },
        { label: '一次性任務',   items: day.bucket.once },
        { label: '臨時加碼',     items: day.bucket.temp },
    ].filter(r => r.items.length > 0);

    return (
        <div className="bg-white border border-indigo-100 rounded-2xl p-3 shadow-sm">
            <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-black text-gray-800">{day.logicalDate}</span>
                <span className="text-xs font-black bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-lg border border-emerald-200">
                    +{day.bucket.total.toLocaleString()} 分
                </span>
            </div>
            {rows.length === 0 ? (
                <p className="text-xs text-gray-400">當日無紀錄</p>
            ) : (
                <div className="space-y-1">
                    {rows.map(r => (
                        <div key={r.label} className="flex items-start gap-2 text-xs">
                            <CheckCircle2 size={12} className="mt-0.5 text-emerald-500 shrink-0" />
                            <div className="flex-1">
                                <span className="font-bold text-gray-700">{r.label}</span>
                                <span className="text-gray-500 ml-2">{r.items.join('、')}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// 小隊長：本隊每日定課明細匯出 + 個人定課查詢
function CaptainDailyLogsSection({ captainId, members }: {
    captainId: string;
    members: SquadMemberStats[];
}) {
    const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const [logsExporting, setLogsExporting] = useState(false);
    const [logsStart, setLogsStart] = useState('2026-05-10');
    const [logsEnd, setLogsEnd] = useState(getLogicalDateStr());

    const [lookupMemberId, setLookupMemberId] = useState('');
    const [lookupStart, setLookupStart] = useState('2026-05-10');
    const [lookupEnd, setLookupEnd] = useState(getLogicalDateStr());
    const [lookupLoading, setLookupLoading] = useState(false);
    const [lookupResult, setLookupResult] = useState<{
        member: { userId: string; name: string; teamName: string | null };
        days: MemberDailyDetail[];
    } | null>(null);

    const showMsg = (text: string, ok: boolean) => {
        setMsg({ text, ok });
        setTimeout(() => setMsg(null), 4000);
    };

    const handleExport = async () => {
        if (logsStart > logsEnd) { showMsg('日期區間錯誤：起 > 訖', false); return; }
        setLogsExporting(true);
        const res = await exportTeamDailyLogsCsv(captainId, null, logsStart, logsEnd);
        setLogsExporting(false);
        if (!res.success || !res.csv) { showMsg(res.error || '匯出失敗', false); return; }
        downloadCsv(res.csv, res.filename || `daily_logs_${logsStart}_${logsEnd}.csv`);
    };

    const handleLookup = async () => {
        if (!lookupMemberId) { showMsg('請選擇隊員', false); return; }
        if (lookupStart > lookupEnd) { showMsg('日期區間錯誤：起 > 訖', false); return; }
        setLookupLoading(true);
        const res = await getMemberDailyDetails(captainId, lookupMemberId, lookupStart, lookupEnd);
        setLookupLoading(false);
        if (!res.success || !res.member || !res.days) {
            setLookupResult(null);
            showMsg(res.error || '查詢失敗', false);
            return;
        }
        setLookupResult({ member: res.member, days: res.days });
    };

    return (
        <section className="bg-white border-2 border-indigo-100 p-6 rounded-4xl space-y-4 shadow-md">
            <h3 className="text-lg font-black text-gray-900 border-b border-gray-200 pb-3 flex items-center gap-2">
                <ScrollText size={18} className="text-indigo-500" /> 小隊定課查詢
            </h3>

            {msg && (
                <p className={`text-xs font-bold ${msg.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{msg.text}</p>
            )}

            {/* 匯出每日定課明細 */}
            <div>
                <p className="text-xs font-black text-indigo-600 mb-2 tracking-widest">每日定課明細匯出（本小隊）</p>
                <div className="flex flex-wrap items-end gap-2">
                    <label className="flex flex-col text-xs text-gray-600 font-bold">
                        起
                        <input type="date" value={logsStart} onChange={e => setLogsStart(e.target.value)}
                            className="mt-1 px-3 py-2 rounded-xl border border-gray-300 bg-white text-sm" />
                    </label>
                    <label className="flex flex-col text-xs text-gray-600 font-bold">
                        訖
                        <input type="date" value={logsEnd} onChange={e => setLogsEnd(e.target.value)}
                            className="mt-1 px-3 py-2 rounded-xl border border-gray-300 bg-white text-sm" />
                    </label>
                    <button
                        onClick={handleExport}
                        disabled={logsExporting}
                        className="flex items-center gap-1.5 px-3 py-2.5 rounded-2xl bg-indigo-500 text-white hover:bg-indigo-600 active:scale-95 transition-all text-sm font-black min-h-[44px] disabled:opacity-50"
                    >
                        <ScrollText size={14} />{logsExporting ? '匯出中…' : '下載明細'}
                    </button>
                </div>
            </div>

            {/* 查詢個人定課 */}
            <div className="pt-3 border-t border-gray-100">
                <p className="text-xs font-black text-indigo-600 mb-2 tracking-widest">查詢個人定課</p>
                <div className="flex flex-wrap items-end gap-2">
                    <label className="flex flex-col text-xs text-gray-600 font-bold">
                        隊員
                        <select
                            value={lookupMemberId}
                            onChange={e => setLookupMemberId(e.target.value)}
                            className="mt-1 px-3 py-2 rounded-xl border border-gray-300 bg-white text-sm min-w-[8rem]"
                        >
                            <option value="">請選擇</option>
                            {members.map(m => (
                                <option key={m.UserID} value={m.UserID}>{m.Name}</option>
                            ))}
                        </select>
                    </label>
                    <label className="flex flex-col text-xs text-gray-600 font-bold">
                        起
                        <input type="date" value={lookupStart} onChange={e => setLookupStart(e.target.value)}
                            className="mt-1 px-3 py-2 rounded-xl border border-gray-300 bg-white text-sm" />
                    </label>
                    <label className="flex flex-col text-xs text-gray-600 font-bold">
                        訖
                        <input type="date" value={lookupEnd} onChange={e => setLookupEnd(e.target.value)}
                            className="mt-1 px-3 py-2 rounded-xl border border-gray-300 bg-white text-sm" />
                    </label>
                    <button
                        onClick={handleLookup}
                        disabled={lookupLoading}
                        className="flex items-center gap-1.5 px-3 py-2.5 rounded-2xl bg-indigo-500 text-white hover:bg-indigo-600 active:scale-95 transition-all text-sm font-black min-h-[44px] disabled:opacity-50"
                    >
                        {lookupLoading ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />}
                        {lookupLoading ? '查詢中…' : '查詢'}
                    </button>
                </div>

                {lookupResult && (
                    <div className="mt-4 space-y-3">
                        <div className="text-sm font-black text-gray-800">
                            {lookupResult.member.name}
                            <span className="text-gray-500 font-normal ml-2 text-xs">
                                {lookupResult.member.teamName ?? '未編組'} · {lookupResult.member.userId}
                            </span>
                        </div>
                        {lookupResult.days.length === 0 ? (
                            <p className="text-sm text-gray-500">此區間無紀錄</p>
                        ) : (
                            <div className="space-y-2">
                                {lookupResult.days.map(d => <MemberDayCard key={d.logicalDate} day={d} />)}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
}

export function CaptainTab({
    teamName, teamSettings, pendingBonusApps, onReviewBonus,
    squadMembersForRoles = [], onSetSquadRole,
    squadMembers = [],
    squadMembersLoaded = false,
    captainId, captainName,
}: CaptainTabProps) {
    const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
    const [reviewingId, setReviewingId] = useState<string | null>(null);

    const handleReview = async (appId: string, approve: boolean) => {
        setReviewingId(appId);
        await onReviewBonus(appId, approve, reviewNotes[appId] || '');
        setReviewingId(null);
        setReviewNotes(prev => { const n = { ...prev }; delete n[appId]; return n; });
    };

    return (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            <div className="bg-indigo-50 border-2 border-indigo-200 rounded-4xl p-6 shadow-md text-center mx-auto">
                <div className="flex items-center justify-center gap-2 text-indigo-500 font-black text-sm uppercase mb-2 tracking-widest"><ShieldAlert size={16} /> 小隊長指揮所</div>
                <h2 className="text-2xl font-black text-gray-900 italic mx-auto">{teamName || '未知小隊'}</h2>
                <p className="text-sm text-indigo-400 mt-2 font-black">你擁有點亮同伴前行的提燈。請謹慎決策。</p>
            </div>

            {/* ── 👥 小隊成員總覽 ── */}
            <section className="bg-white border-2 border-indigo-100 p-6 rounded-4xl space-y-3 shadow-md">
                <h3 className="text-lg font-black text-gray-900 border-b border-gray-200 pb-3 flex items-center gap-2">
                    <Users size={18} className="text-indigo-500" /> 小隊成員總覽
                </h3>
                {!squadMembersLoaded ? (
                    <p className="text-sm text-gray-400 text-center py-4">載入中…</p>
                ) : squadMembers.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">找不到小隊成員資料，請確認帳號已設定小隊名稱。</p>
                ) : (
                    <div className="space-y-2">
                        {squadMembers.map(m => (
                            <div key={m.UserID} className="flex items-center gap-3 bg-gray-50 rounded-2xl px-4 py-3 border border-gray-200">
                                <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-black text-indigo-500 shrink-0">
                                    {m.Name.slice(0, 1)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="font-black text-gray-900 text-base">{m.Name}</span>
                                        {m.IsCaptain && (
                                            <span className="text-sm font-black text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-full">隊長</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                        <span className="text-sm text-gray-500">{m.Score.toLocaleString()} 分</span>
                                        {m.Streak > 0 && <span className="text-sm text-orange-400">🔥 {m.Streak}</span>}
                                    </div>
                                </div>
                                <div className="shrink-0">
                                    {isActive(m.lastCheckIn) ? (
                                        <span className="text-sm font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">活躍</span>
                                    ) : m.lastCheckIn ? (
                                        <span className="text-sm font-black text-gray-400 bg-gray-100 px-2 py-1 rounded-full">{m.lastCheckIn}</span>
                                    ) : (
                                        <span className="text-sm font-black text-gray-300 bg-gray-100 px-2 py-1 rounded-full">未打卡</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* ── 📋 小隊定課查詢 ── */}
            <CaptainDailyLogsSection captainId={captainId} members={squadMembers} />

            {/* ── 📈 小隊成長曲線 ── */}
            <section className="bg-white border-2 border-emerald-100 p-4 rounded-4xl shadow-md">
                <SquadGrowthChart weeks={8} />
            </section>

            {/* ── 📅 本週實體凝聚 ── */}
            <SquadGatheringSection captainId={captainId} />

            {/* ── 🌐 本週線上凝聚審核 ── */}
            <SquadOnlineGatheringReviewSection captainId={captainId} />

            {/* ── 🎬 臨時加碼任務初審 ── */}
            <TempQuestReviewSection captainId={captainId} />

            {/* ── 🌐 小隊九宮格總覽 ── */}
            <SquadNineGridSection captainId={captainId} />

            {/* ── 🎭 小隊角色職稱指派 ── */}
            {squadMembersForRoles.length > 0 && onSetSquadRole && (
                <section className="bg-white border-2 border-violet-200 p-6 rounded-4xl space-y-4 shadow-md">
                    <h3 className="text-lg font-black text-gray-900 border-b border-gray-200 pb-3 flex items-center gap-2">
                        🎭 小隊角色職稱指派
                    </h3>
                    <p className="text-sm text-gray-500 leading-relaxed">
                        為每位成員指派職稱。職稱僅為管理性質，不影響計分與任務類型。
                    </p>
                    <div className="space-y-2">
                        {squadMembersForRoles.map(m => (
                            <RolePicker
                                key={m.userId}
                                member={m}
                                onSet={(role) => onSetSquadRole(m.userId, role)}
                            />
                        ))}
                    </div>
                </section>
            )}

            {/* ── 📜 一次性任務審核（小隊長初審）── */}
            <section className="bg-white border-2 border-amber-200 p-8 rounded-4xl space-y-6 shadow-md">
                <h3 className="text-lg font-black text-gray-900 border-b border-gray-200 pb-4">📜 一次性任務審核（小隊長初審）</h3>

                {(() => {
                    const oApps = pendingBonusApps.filter(a => a.quest_id.startsWith('o'));
                    if (oApps.length === 0) {
                        return <p className="text-sm text-gray-400 text-center py-4">目前無待審一次性任務申請</p>;
                    }

                    const DRAMA_IDS = new Set(['o2_1', 'o2_2', 'o2_3', 'o2_4']);
                    const O_LABELS: Record<string, string> = {
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

                    return (
                        <div className="space-y-4">
                            {oApps.map(app => {
                                const isDrama = DRAMA_IDS.has(app.quest_id);
                                return (
                                    <div key={app.id} className="bg-gray-50 rounded-2xl p-5 space-y-3 border border-gray-200">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="font-black text-gray-900">{app.user_name}</p>
                                                <p className="text-sm text-gray-500">
                                                    {O_LABELS[app.quest_id] || app.quest_id}
                                                    {app.interview_target && ` · ${app.interview_target}`}
                                                </p>
                                                <p className="text-sm text-gray-400">{app.interview_date}</p>
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                                <span className={`text-sm font-black px-2 py-1 rounded-lg ${isDrama ? 'text-amber-600 bg-amber-50' : 'text-gray-600 bg-gray-100'}`}>
                                                    {isDrama ? '一級審核（直接入帳）' : '二級審核（初審）'}
                                                </span>
                                                <span className="text-sm font-black text-yellow-600 bg-yellow-50 px-2 py-1 rounded-lg">待初審</span>
                                            </div>
                                        </div>
                                        {app.description && <p className="text-sm text-gray-500 italic">{app.description}</p>}
                                        {app.screenshot_url && (
                                            <a href={app.screenshot_url} target="_blank" rel="noopener noreferrer">
                                                <img
                                                    src={app.screenshot_url}
                                                    alt="申請截圖"
                                                    className="w-full max-h-48 object-contain rounded-xl border border-gray-200 cursor-pointer hover:opacity-80 transition-opacity"
                                                />
                                            </a>
                                        )}
                                        <textarea
                                            placeholder="備註（選填）"
                                            value={reviewNotes[app.id] || ''}
                                            onChange={e => setReviewNotes(prev => ({ ...prev, [app.id]: e.target.value }))}
                                            rows={2}
                                            className="w-full bg-white border border-gray-200 rounded-xl p-3 text-gray-900 text-sm outline-none focus:border-amber-400 resize-none"
                                        />
                                        <div className="flex gap-3">
                                            <button
                                                disabled={reviewingId === app.id}
                                                onClick={() => handleReview(app.id, false)}
                                                className="flex-1 py-2 bg-red-50 text-red-500 font-black rounded-xl text-base border border-red-200 active:scale-95 transition-all disabled:opacity-50"
                                            >
                                                ❌ 駁回
                                            </button>
                                            <button
                                                disabled={reviewingId === app.id}
                                                onClick={() => handleReview(app.id, true)}
                                                className="flex-[2] py-2 bg-emerald-600 text-white font-black rounded-xl text-base shadow-lg active:scale-95 transition-all disabled:opacity-50"
                                            >
                                                {isDrama ? '✅ 核准（直接入帳）' : '✅ 初審通過'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    );
                })()}
            </section>
        </div>
    );
}
