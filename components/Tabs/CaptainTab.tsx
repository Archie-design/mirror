import { useState, useEffect, useCallback } from 'react';
import { ShieldAlert, Loader2, Grid3x3, Users, Check, Crown, Calendar as CalendarIcon, Send, Star } from 'lucide-react';
import QRCode from 'react-qr-code';
import { SQUAD_ROLES } from '@/lib/constants';
import { TeamSettings, BonusApplication, SquadMemberStats } from '@/types';
import { getSquadGrids } from '@/app/actions/nine-grid';
import {
    getTeamGatheringContext,
    submitGatheringForReview,
    type TeamGatheringContext,
} from '@/app/actions/squad-gathering';
import {
    listPendingOnlineGatheringsForCaptain,
    reviewOnlineGathering,
    type OnlineGatheringApp,
} from '@/app/actions/online-gathering';
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
    if (!lastCheckIn) return false;
    const nowTW = new Date(Date.now() + 8 * 3600 * 1000);
    const todayStr = nowTW.toISOString().slice(0, 10);
    const yest = new Date(nowTW);
    yest.setUTCDate(yest.getUTCDate() - 1);
    return lastCheckIn === todayStr || lastCheckIn === yest.toISOString().slice(0, 10);
}

// ── 小隊九宮格總覽 ──────────────────────────────────────────────────────────
function SquadNineGridSection({ captainId }: { captainId: string }) {
    type GridRow = UserNineGrid & { user_name: string };
    const [grids, setGrids] = useState<GridRow[]>([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        getSquadGrids(captainId).then(res => {
            if (res.success) setGrids(res.grids ?? []);
            setLoading(false);
        });
    }, [captainId]);

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
                            {!grid.companion_type ? null : <div className="grid grid-cols-3 gap-1.5">
                                {grid.cells.map((cell, i) => (
                                    <div
                                        key={i}
                                        className={`rounded-xl p-2 space-y-1 border ${cell.completed
                                            ? 'bg-teal-50 border-teal-200'
                                            : 'bg-gray-50 border-gray-200'}`}
                                    >
                                        <span className={`text-sm font-black leading-tight ${cell.completed ? 'text-teal-700' : 'text-gray-600'}`}>
                                            {cell.label || `格子 ${i + 1}`}
                                        </span>
                                        {cell.completed && (
                                            <span className="text-sm text-teal-600 font-bold">✓ 已完成</span>
                                        )}
                                    </div>
                                ))}
                            </div>}
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
    const [err, setErr] = useState<string | null>(null);

    const reload = useCallback(async () => {
        const res = await getTeamGatheringContext(captainId);
        if (res.success) setCtx(res.context ?? null);
        setLoading(false);
    }, [captainId]);

    useEffect(() => { reload(); }, [reload]);

    // 當處於排定中時每 15 秒刷新一次出席進度
    useEffect(() => {
        if (!ctx?.session || ctx.session.status !== 'scheduled') return;
        const id = setInterval(reload, 15000);
        return () => clearInterval(id);
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

                    <div className="bg-gray-50 rounded-2xl p-4 space-y-2 border border-gray-200">
                        <div className="flex items-center gap-2 text-sm font-black text-gray-700">
                            <Users size={14} /> 出席進度 {attendees.length} / {teamMemberCount}
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                            <Crown size={14} className={hasCommandant ? 'text-amber-500' : 'text-gray-400'} />
                            <span className={hasCommandant ? 'text-amber-600 font-bold' : 'text-gray-500'}>
                                {hasCommandant ? '大隊長已到場（每人 +100）' : '大隊長尚未到場'}
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

            {/* ── 📅 本週實體凝聚 ── */}
            <SquadGatheringSection captainId={captainId} />

            {/* ── 🌐 本週線上凝聚審核 ── */}
            <SquadOnlineGatheringReviewSection captainId={captainId} />

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
