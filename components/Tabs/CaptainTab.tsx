import { useState } from 'react';
import { ShieldAlert, Dices, Loader2, ChevronDown, ChevronUp, Banknote, CalendarCheck, Building2, Users } from 'lucide-react';
import { DAILY_QUEST_CONFIG, SQUAD_ROLES } from '@/lib/constants';
import { TeamSettings, BonusApplication, FinePaymentRecord, SquadFineSubmission, SquadMemberStats } from '@/types';
// SquadFineSubmission used in orgSubmissions prop below

interface SquadMemberFine {
    userId: string;
    name: string;
    totalFines: number;
    finePaid: number;
    balance: number;
}

interface SquadMemberRole {
    userId: string;
    name: string;
    squadRole?: string;
}

interface CaptainTabProps {
    teamName: string;
    teamSettings?: TeamSettings;
    pendingBonusApps: BonusApplication[];
    onDrawWeeklyQuest: () => Promise<void>;
    onReviewBonus: (appId: string, approve: boolean, notes: string) => Promise<void>;
    // 小隊角色指派
    squadMembersForRoles?: SquadMemberRole[];
    onSetSquadRole?: (targetUserId: string, role: string | null) => Promise<void>;
    // 罰款管理
    squadFineMembers: SquadMemberFine[];
    fineHistory: FinePaymentRecord[];
    orgSubmissions: SquadFineSubmission[];
    onRecordPayment: (targetUserId: string, amount: number, periodLabel: string, paidToCaptainAt?: string) => Promise<void>;
    onSetPaidToCaptainDate: (paymentId: string, date: string) => Promise<void>;
    onRecordOrgSubmission: (amount: number, submittedAt: string, notes?: string) => Promise<void>;
    isLoadingFines: boolean;
    // 違規結算
    onCheckW3Compliance: () => Promise<void>;
    isCheckingCompliance: boolean;
    complianceResult: { periodLabel: string; violators: { userId: string; name: string; missingSum?: number; fineAdded?: number }[]; alreadyRun: boolean } | null;
    // 成員總覽
    squadMembers?: SquadMemberStats[];
}


// ── 角色選擇卡片 ──────────────────────────────────────────────────────────
function RolePicker({ member, onSet }: {
    member: { userId: string; name: string; squadRole?: string };
    onSet: (role: string | null) => Promise<void>;
}) {
    const [saving, setSaving] = useState(false);

    const handleSelect = async (role: string) => {
        const next = member.squadRole === role ? null : role; // 再點一次取消
        setSaving(true);
        await onSet(next);
        setSaving(false);
    };

    return (
        <div className="bg-slate-800 rounded-2xl p-3 space-y-2">
            <div className="flex items-center justify-between">
                <span className="font-bold text-white text-sm">{member.name}</span>
                {member.squadRole
                    ? <span className="text-[10px] font-black text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded-full">{member.squadRole}</span>
                    : <span className="text-[10px] text-slate-500">未指派</span>
                }
            </div>
            <div className="flex flex-wrap gap-1.5">
                {SQUAD_ROLES.map(role => (
                    <button
                        key={role}
                        disabled={saving}
                        onClick={() => handleSelect(role)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all active:scale-95
                            ${member.squadRole === role
                                ? 'bg-violet-600 text-white'
                                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                    >
                        {saving && member.squadRole === role ? '…' : role}
                    </button>
                ))}
            </div>
        </div>
    );
}

function getCurrentWeekMondayStr(): string {
    const nowTaiwan = new Date(Date.now() + 8 * 3600 * 1000);
    const day = nowTaiwan.getUTCDay() || 7;
    const monday = new Date(nowTaiwan);
    monday.setUTCDate(monday.getUTCDate() - (day - 1));
    return monday.toISOString().slice(0, 10);
}

function isActive(lastCheckIn?: string): boolean {
    if (!lastCheckIn) return false;
    const nowTW = new Date(Date.now() + 8 * 3600 * 1000);
    const todayStr = nowTW.toISOString().slice(0, 10);
    const yest = new Date(nowTW);
    yest.setUTCDate(yest.getUTCDate() - 1);
    return lastCheckIn === todayStr || lastCheckIn === yest.toISOString().slice(0, 10);
}

export function CaptainTab({
    teamName, teamSettings, pendingBonusApps, onDrawWeeklyQuest, onReviewBonus,
    squadMembersForRoles = [], onSetSquadRole,
    squadFineMembers, fineHistory, orgSubmissions, onRecordPayment, onSetPaidToCaptainDate, onRecordOrgSubmission, isLoadingFines,
    onCheckW3Compliance, isCheckingCompliance, complianceResult,
    squadMembers = [],
}: CaptainTabProps) {
    const [isDrawing, setIsDrawing] = useState(false);
    const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
    const [reviewingId, setReviewingId] = useState<string | null>(null);

    // 罰款管理 state
    const [paymentInput, setPaymentInput] = useState<Record<string, { amount: string; date: string }>>({});
    const [recordingId, setRecordingId] = useState<string | null>(null);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [updatingDateId, setUpdatingDateId] = useState<string | null>(null);
    const [captainDateInputs, setCaptainDateInputs] = useState<Record<string, string>>({});
    // 批次上繳大會
    const [orgSubmitAmount, setOrgSubmitAmount] = useState('');
    const [orgSubmitDate, setOrgSubmitDate] = useState('');
    const [orgSubmitNotes, setOrgSubmitNotes] = useState('');
    const [isSubmittingOrg, setIsSubmittingOrg] = useState(false);
    const [periodLabel, setPeriodLabel] = useState(() => {
        // 預設為上週週期（與 checkSquadFineCompliance 預設行為一致）
        const nowTW = new Date(Date.now() + 8 * 3600 * 1000);
        const day = nowTW.getUTCDay() || 7;
        const thisMonday = new Date(nowTW);
        thisMonday.setUTCDate(nowTW.getUTCDate() - (day - 1));
        const lastMonday = new Date(thisMonday);
        lastMonday.setUTCDate(thisMonday.getUTCDate() - 7);
        return `${lastMonday.toISOString().slice(0, 10)}~${thisMonday.toISOString().slice(0, 10)}`;
    });

    const weekMondayStr = getCurrentWeekMondayStr();
    const alreadyDrawnThisWeek = teamSettings?.mandatory_quest_week === weekMondayStr;
    const currentQuestId = teamSettings?.mandatory_quest_id;
    const currentQuestName = DAILY_QUEST_CONFIG.find(q => q.id === currentQuestId)?.title;
    const drawHistory: string[] = teamSettings?.quest_draw_history || [];
    const remaining = DAILY_QUEST_CONFIG.filter(q => q.id.startsWith('q') && !drawHistory.includes(q.id));

    const handleDraw = async () => {
        setIsDrawing(true);
        await onDrawWeeklyQuest();
        setIsDrawing(false);
    };

    const handleReview = async (appId: string, approve: boolean) => {
        setReviewingId(appId);
        await onReviewBonus(appId, approve, reviewNotes[appId] || '');
        setReviewingId(null);
        setReviewNotes(prev => { const n = { ...prev }; delete n[appId]; return n; });
    };

    const handleRecordPayment = async (userId: string) => {
        const input = paymentInput[userId];
        const amount = parseInt(input?.amount || '0', 10);
        if (!amount || amount <= 0) return;
        setRecordingId(userId);
        await onRecordPayment(userId, amount, periodLabel, input?.date || undefined);
        setRecordingId(null);
        setPaymentInput(prev => { const n = { ...prev }; delete n[userId]; return n; });
    };

    const handleSetCaptainDate = async (paymentId: string) => {
        const date = captainDateInputs[paymentId];
        if (!date) return;
        setUpdatingDateId(paymentId + '_captain');
        await onSetPaidToCaptainDate(paymentId, date);
        setUpdatingDateId(null);
    };

    const handleRecordOrgSubmission = async () => {
        const amount = parseInt(orgSubmitAmount, 10);
        if (!amount || amount <= 0 || !orgSubmitDate) return;
        setIsSubmittingOrg(true);
        await onRecordOrgSubmission(amount, orgSubmitDate, orgSubmitNotes || undefined);
        setIsSubmittingOrg(false);
        setOrgSubmitAmount('');
        setOrgSubmitDate('');
        setOrgSubmitNotes('');
    };

    return (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            <div className="bg-indigo-950/40 border-2 border-indigo-500/40 rounded-4xl p-6 shadow-2xl text-center mx-auto">
                <div className="flex items-center justify-center gap-2 text-indigo-400 font-black text-xs uppercase mb-2 tracking-widest"><ShieldAlert size={16} /> 隊長權限指揮所</div>
                <h2 className="text-2xl font-black text-white italic mx-auto">{teamName || '未知劇組'}</h2>
                <p className="text-xs text-indigo-300 mt-2 font-black">你擁有點亮同伴前行的提燈。請謹慎決策。</p>
            </div>


            {/* ── 👥 小隊成員總覽 ── */}
            <section className="bg-slate-900 border-2 border-indigo-500/20 p-6 rounded-4xl space-y-3 shadow-xl">
                <h3 className="text-lg font-black text-white border-b border-white/10 pb-3 flex items-center gap-2">
                    <Users size={18} className="text-indigo-400" /> 小隊成員總覽
                </h3>
                {squadMembers.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-4">載入中…</p>
                ) : (
                    <div className="space-y-2">
                        {squadMembers.map(m => (
                            <div key={m.UserID} className="flex items-center gap-3 bg-slate-800/60 rounded-2xl px-4 py-3">
                                <div className="w-9 h-9 rounded-full bg-indigo-900/50 flex items-center justify-center text-sm font-black text-indigo-300 shrink-0">
                                    {m.Name.slice(0, 1)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="font-black text-white text-sm">{m.Name}</span>
                                        {m.IsCaptain && (
                                            <span className="text-[10px] font-black text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded-full">隊長</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                        <span className="text-[10px] text-slate-500">Lv.{m.Level}</span>
                                        <span className="text-[10px] text-slate-500">{m.Exp.toLocaleString()} 票房</span>
                                        {m.Streak > 0 && <span className="text-[10px] text-orange-400">🔥 {m.Streak}</span>}
                                    </div>
                                </div>
                                <div className="shrink-0">
                                    {isActive(m.lastCheckIn) ? (
                                        <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full">活躍</span>
                                    ) : m.lastCheckIn ? (
                                        <span className="text-[10px] font-black text-slate-500 bg-slate-700/50 px-2 py-1 rounded-full">{m.lastCheckIn}</span>
                                    ) : (
                                        <span className="text-[10px] font-black text-slate-600 bg-slate-800/50 px-2 py-1 rounded-full">未打卡</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* ── 💸 罰款管理 ── */}
            <section className="bg-slate-900 border-2 border-amber-500/30 p-8 rounded-4xl space-y-6 shadow-xl">
                <h3 className="text-lg font-black text-white border-b border-white/10 pb-4 flex items-center gap-2">
                    <Banknote size={18} className="text-amber-400" /> 罰款管理
                </h3>

                {/* 定課違規結算 */}
                <div className="bg-slate-800/60 rounded-2xl p-4 space-y-3">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">📋 定課未達標結算</p>
                    <button
                        disabled={isCheckingCompliance || complianceResult?.alreadyRun === true}
                        onClick={onCheckW3Compliance}
                        className="w-full flex items-center justify-center gap-2 bg-red-800/60 hover:bg-red-700/70 text-white font-black text-sm py-3 rounded-xl transition-all active:scale-95 disabled:opacity-50"
                    >
                        {isCheckingCompliance
                            ? <><Loader2 size={14} className="animate-spin" /> 結算中…</>
                            : complianceResult?.alreadyRun
                            ? `✅ 本週已結算（${complianceResult.periodLabel}）`
                            : '計算指定期間定課違規'}
                    </button>
                    {complianceResult && !complianceResult.alreadyRun && (
                        <p className="text-xs text-center animate-in slide-in-from-top-2 duration-300">
                            {complianceResult.violators.length === 0
                                ? <span className="text-emerald-400 font-black">🎉 結算期間內全員達標！</span>
                                : <span className="text-red-400 font-bold">
                                    {complianceResult.violators.map(v => `${v.name}(缺${v.missingSum}次，+NT$${v.fineAdded})`).join('、')}
                                  </span>
                            }
                        </p>
                    )}
                </div>

                {/* 收款概覽 + 記錄上繳大會 */}
                {(() => {
                    const totalCollected = squadFineMembers.reduce((s, m) => s + m.finePaid, 0);
                    const totalSubmitted = orgSubmissions.reduce((s, r) => s + r.amount, 0);
                    const pendingSubmit = Math.max(0, totalCollected - totalSubmitted);
                    return (
                        <div className="bg-slate-800/60 rounded-2xl p-4 space-y-4">
                            <p className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                <Building2 size={13} /> 收款概覽
                            </p>
                            <div className="grid grid-cols-3 gap-2 text-center">
                                <div className="bg-slate-700/50 rounded-xl py-3">
                                    <p className="text-[10px] text-slate-400 font-bold mb-1">已向成員收款</p>
                                    <p className="text-base font-black text-emerald-400">NT${totalCollected}</p>
                                </div>
                                <div className="bg-slate-700/50 rounded-xl py-3">
                                    <p className="text-[10px] text-slate-400 font-bold mb-1">已上繳大會</p>
                                    <p className="text-base font-black text-blue-400">NT${totalSubmitted}</p>
                                </div>
                                <div className="bg-slate-700/50 rounded-xl py-3">
                                    <p className="text-[10px] text-slate-400 font-bold mb-1">待上繳</p>
                                    <p className={`text-base font-black ${pendingSubmit > 0 ? 'text-amber-400' : 'text-slate-500'}`}>NT${pendingSubmit}</p>
                                </div>
                            </div>

                            {/* 記錄上繳大會 */}
                            <div className="space-y-2 pt-1 border-t border-white/5">
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">記錄上繳大會</p>
                                <div className="flex gap-2">
                                    <input
                                        type="number"
                                        placeholder="金額 NT$"
                                        value={orgSubmitAmount}
                                        onChange={e => setOrgSubmitAmount(e.target.value)}
                                        min={1}
                                        className="flex-1 bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-blue-500"
                                    />
                                    <input
                                        type="date"
                                        value={orgSubmitDate}
                                        onChange={e => setOrgSubmitDate(e.target.value)}
                                        className="flex-1 bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-blue-500"
                                    />
                                </div>
                                <input
                                    type="text"
                                    placeholder="備註（選填）"
                                    value={orgSubmitNotes}
                                    onChange={e => setOrgSubmitNotes(e.target.value)}
                                    className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-blue-500"
                                />
                                <button
                                    disabled={isSubmittingOrg || !orgSubmitAmount || !orgSubmitDate}
                                    onClick={handleRecordOrgSubmission}
                                    className="w-full flex items-center justify-center gap-2 bg-blue-700/70 hover:bg-blue-600/80 text-white font-black text-sm py-3 rounded-xl transition-all active:scale-95 disabled:opacity-50"
                                >
                                    {isSubmittingOrg ? <><Loader2 size={14} className="animate-spin" /> 記錄中…</> : <><Building2 size={14} /> 記錄上繳大會</>}
                                </button>
                            </div>

                            {/* 上繳紀錄 */}
                            {orgSubmissions.length > 0 && (
                                <div className="space-y-2 pt-1 border-t border-white/5">
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">上繳紀錄</p>
                                    {orgSubmissions.map(r => (
                                        <div key={r.id} className="flex justify-between items-center text-xs py-1">
                                            <span className="text-blue-300 font-bold">{r.submitted_at}</span>
                                            <span className="text-white font-black">NT${r.amount}</span>
                                            <span className="text-slate-500">{r.notes || '—'}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* 週期標籤 */}
                <div className="flex items-center gap-3">
                    <span className="text-xs font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">結算週期</span>
                    <input
                        value={periodLabel}
                        onChange={e => setPeriodLabel(e.target.value)}
                        placeholder="2026-03-03~2026-03-10"
                        className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-amber-500"
                    />
                </div>

                {/* 成員罰款列表 */}
                {isLoadingFines ? (
                    <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-amber-400" /></div>
                ) : squadFineMembers.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-4">劇組暫無罰款紀錄</p>
                ) : (
                    <div className="space-y-3">
                        {squadFineMembers.map(m => (
                            <div key={m.userId} className="bg-slate-800 rounded-2xl p-4 space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="font-black text-white">{m.name}</span>
                                    <div className="flex gap-3 text-xs text-right">
                                        <span className="text-slate-400">累計 <span className="text-red-400 font-black">NT${m.totalFines}</span></span>
                                        <span className="text-slate-400">已繳 <span className="text-emerald-400 font-black">NT${m.finePaid}</span></span>
                                        <span className={`font-black ${m.balance > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                                            餘額 NT${m.balance}
                                        </span>
                                    </div>
                                </div>
                                {m.balance > 0 && (
                                    <div className="flex gap-2 items-end">
                                        <div className="flex-1 space-y-1.5">
                                            <input
                                                type="number"
                                                placeholder="繳款金額 NT$"
                                                value={paymentInput[m.userId]?.amount || ''}
                                                onChange={e => setPaymentInput(prev => ({
                                                    ...prev,
                                                    [m.userId]: { ...prev[m.userId], amount: e.target.value },
                                                }))}
                                                min={1}
                                                max={m.balance}
                                                className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-amber-500"
                                            />
                                            <input
                                                type="date"
                                                title="隊員交款給劇組長的日期（選填）"
                                                value={paymentInput[m.userId]?.date || ''}
                                                onChange={e => setPaymentInput(prev => ({
                                                    ...prev,
                                                    [m.userId]: { ...prev[m.userId], date: e.target.value },
                                                }))}
                                                className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-amber-500"
                                            />
                                            <p className="text-[10px] text-slate-500">↑ 隊員交款日期（選填）</p>
                                        </div>
                                        <button
                                            disabled={recordingId === m.userId || !paymentInput[m.userId]?.amount}
                                            onClick={() => handleRecordPayment(m.userId)}
                                            className="px-4 py-4 bg-amber-600 text-white font-black rounded-xl text-sm active:scale-95 transition-all disabled:opacity-40 whitespace-nowrap flex items-center gap-1.5"
                                        >
                                            {recordingId === m.userId
                                                ? <Loader2 size={14} className="animate-spin" />
                                                : <CalendarCheck size={14} />}
                                            記錄
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* 歷史繳款紀錄 */}
                {fineHistory.length > 0 && (
                    <div className="space-y-3">
                        <button
                            onClick={() => setHistoryOpen(o => !o)}
                            className="w-full flex items-center justify-between text-xs font-black text-slate-400 uppercase tracking-widest py-1"
                        >
                            <span>歷史繳款紀錄 ({fineHistory.length})</span>
                            {historyOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>

                        {historyOpen && (
                            <div className="space-y-3 animate-in slide-in-from-top-2 duration-300">
                                {fineHistory.map(rec => (
                                    <div key={rec.id} className="bg-slate-800/80 rounded-2xl p-4 space-y-3">
                                        <div className="flex justify-between items-center">
                                            <div>
                                                <span className="font-black text-white text-sm">{rec.user_name}</span>
                                                <span className="text-emerald-400 font-black text-sm ml-2">+NT${rec.amount}</span>
                                            </div>
                                            <span className="text-[10px] text-slate-500 bg-slate-700 px-2 py-1 rounded-lg">{rec.period_label}</span>
                                        </div>

                                        {/* 隊員→劇組長日期 */}
                                        <div className="flex items-center gap-2">
                                            <CalendarCheck size={13} className="text-blue-400 shrink-0" />
                                            <span className="text-xs text-slate-400 whitespace-nowrap">隊員交款日：</span>
                                            {rec.paid_to_captain_at
                                                ? <span className="text-xs text-blue-300 font-bold">{rec.paid_to_captain_at}</span>
                                                : <span className="text-xs text-slate-600">未記錄</span>
                                            }
                                            <input
                                                type="date"
                                                title="修改隊員交款日"
                                                value={captainDateInputs[rec.id] || rec.paid_to_captain_at || ''}
                                                onChange={e => setCaptainDateInputs(prev => ({ ...prev, [rec.id]: e.target.value }))}
                                                className="bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-white text-xs outline-none focus:border-blue-500 ml-auto"
                                            />
                                            <button
                                                disabled={updatingDateId === rec.id + '_captain'}
                                                onClick={() => handleSetCaptainDate(rec.id)}
                                                className="px-2 py-1 bg-blue-700/50 text-blue-300 rounded-lg text-xs font-black disabled:opacity-40 active:scale-95 transition-all"
                                            >
                                                {updatingDateId === rec.id + '_captain' ? <Loader2 size={10} className="animate-spin" /> : '✓'}
                                            </button>
                                        </div>

                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </section>

            <section className="bg-slate-900 border-2 border-slate-800 p-8 rounded-4xl space-y-6 shadow-xl text-center">
                <h3 className="text-lg font-black text-white border-b border-white/10 pb-4 text-left">🎲 本週推薦通告抽籤</h3>

                {alreadyDrawnThisWeek && currentQuestName ? (
                    <div className="space-y-3">
                        <p className="text-xs text-slate-400 font-bold">本週已抽出</p>
                        <div className="bg-indigo-900/30 border-2 border-indigo-500/50 rounded-3xl p-6">
                            <p className="text-3xl font-black text-white">「{currentQuestName}」</p>
                            <p className="text-xs text-indigo-400 mt-2 font-bold">週一 {weekMondayStr} 起生效</p>
                        </div>
                        <p className="text-xs text-slate-500">下週一前無法再次抽籤</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <p className="text-xs text-slate-400 font-bold leading-relaxed">
                            每週一 12:00 前抽選本週推薦通告。<br />
                            已抽過的通告不重複，{remaining.length > 0 ? `尚餘 ${remaining.length} 項可抽` : '本輪已全部抽完，下次抽籤將重置循環'}。
                        </p>
                        <button
                            disabled={isDrawing}
                            onClick={handleDraw}
                            className="w-full flex items-center justify-center gap-3 bg-indigo-600 p-5 rounded-2xl text-white font-black text-lg shadow-lg hover:bg-indigo-500 active:scale-95 transition-all disabled:opacity-50"
                        >
                            <Dices size={22} /> {isDrawing ? '命運抽籤中...' : '🎲 抽選本週通告'}
                        </button>
                    </div>
                )}

                {drawHistory.length > 0 && (
                    <div className="text-left space-y-2 mt-2">
                        <p className="text-xs font-black text-slate-500 uppercase tracking-widest">本輪已抽歷程</p>
                        <div className="flex flex-wrap gap-2">
                            {drawHistory.map(id => {
                                const name = DAILY_QUEST_CONFIG.find(q => q.id === id)?.title || id;
                                return (
                                    <span key={id} className={`px-3 py-1 rounded-xl text-xs font-bold ${id === currentQuestId ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                                        {name}
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                )}
            </section>

            {/* 🎭 小隊角色職稱指派 */}
            {squadMembersForRoles.length > 0 && onSetSquadRole && (
                <section className="bg-slate-900 border-2 border-violet-500/30 p-6 rounded-4xl space-y-4 shadow-xl">
                    <h3 className="text-lg font-black text-white border-b border-white/10 pb-3 flex items-center gap-2">
                        🎭 小隊角色職稱指派
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed">
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

            {/* ❤️ 傳愛申請初審 */}
            <section className="bg-slate-900 border-2 border-pink-500/30 p-8 rounded-4xl space-y-6 shadow-xl">
                <h3 className="text-lg font-black text-white border-b border-white/10 pb-4">❤️ 傳愛申請審核（小隊長初審）</h3>

                {(() => {
                    const interviewApps = pendingBonusApps.filter(a => a.quest_id.startsWith('w4|'));
                    return interviewApps.length === 0 ? (
                        <p className="text-sm text-slate-500 text-center py-4">目前無待審傳愛申請</p>
                    ) : (
                        <div className="space-y-4">
                            {interviewApps.map(app => (
                                <div key={app.id} className="bg-slate-800 rounded-2xl p-5 space-y-3">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="font-black text-white">{app.user_name}</p>
                                            <p className="text-xs text-slate-400">訪談：{app.interview_target} · {app.interview_date}</p>
                                        </div>
                                        <span className="text-[10px] font-black text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded-lg">待初審</span>
                                    </div>
                                    {app.description && <p className="text-xs text-slate-400 italic">{app.description}</p>}
                                    <textarea
                                        placeholder="備註（選填）"
                                        value={reviewNotes[app.id] || ''}
                                        onChange={e => setReviewNotes(prev => ({ ...prev, [app.id]: e.target.value }))}
                                        rows={2}
                                        className="w-full bg-slate-700 border border-slate-600 rounded-xl p-3 text-white text-xs outline-none focus:border-pink-500 resize-none"
                                    />
                                    <div className="flex gap-3">
                                        <button
                                            disabled={reviewingId === app.id}
                                            onClick={() => handleReview(app.id, false)}
                                            className="flex-1 py-2 bg-red-600/20 text-red-400 font-black rounded-xl text-sm border border-red-600/30 active:scale-95 transition-all disabled:opacity-50"
                                        >
                                            ❌ 駁回
                                        </button>
                                        <button
                                            disabled={reviewingId === app.id}
                                            onClick={() => handleReview(app.id, true)}
                                            className="flex-2 py-2 bg-emerald-600 text-white font-black rounded-xl text-sm shadow-lg active:scale-95 transition-all disabled:opacity-50"
                                        >
                                            ✅ 初審通過
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    );
                })()}
            </section>

            {/* 📋 聯誼會報名審核 */}
            <section className="bg-slate-900 border-2 border-blue-500/30 p-8 rounded-4xl space-y-6 shadow-xl">
                <h3 className="text-lg font-black text-white border-b border-white/10 pb-4">📋 聯誼會報名審核（小隊長審核）</h3>

                {(() => {
                    const b5b6Apps = pendingBonusApps.filter(a => a.quest_id === 'b5' || a.quest_id === 'b6');
                    return b5b6Apps.length === 0 ? (
                        <p className="text-sm text-slate-500 text-center py-4">目前無待審聯誼會申請</p>
                    ) : (
                        <div className="space-y-4">
                            {b5b6Apps.map(app => (
                                <div key={app.id} className="bg-slate-800 rounded-2xl p-5 space-y-3">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="font-black text-white">{app.user_name}</p>
                                            <p className="text-xs text-slate-400">報名項目：{app.interview_target}</p>
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                            <span className="text-[10px] font-black text-blue-300 bg-blue-500/20 px-2 py-1 rounded-lg">
                                                {app.quest_id === 'b5' ? '1年' : '2年'}
                                            </span>
                                            <span className="text-[10px] font-black text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded-lg">待初審</span>
                                        </div>
                                    </div>
                                    {app.description && <p className="text-xs text-slate-400 italic">{app.description}</p>}
                                    {app.screenshot_url && (
                                        <div className="space-y-1">
                                            <p className="text-[10px] text-slate-400 font-bold">截圖憑證</p>
                                            <a href={app.screenshot_url} target="_blank" rel="noopener noreferrer">
                                                <img
                                                    src={app.screenshot_url}
                                                    alt="申請截圖"
                                                    className="w-full max-h-48 object-contain rounded-xl border border-slate-600 cursor-pointer hover:opacity-80 transition-opacity"
                                                />
                                            </a>
                                        </div>
                                    )}
                                    <textarea
                                        placeholder="備註（選填）"
                                        value={reviewNotes[app.id] || ''}
                                        onChange={e => setReviewNotes(prev => ({ ...prev, [app.id]: e.target.value }))}
                                        rows={2}
                                        className="w-full bg-slate-700 border border-slate-600 rounded-xl p-3 text-white text-xs outline-none focus:border-blue-500 resize-none"
                                    />
                                    <div className="flex gap-3">
                                        <button
                                            disabled={reviewingId === app.id}
                                            onClick={() => handleReview(app.id, false)}
                                            className="flex-1 py-2 bg-red-600/20 text-red-400 font-black rounded-xl text-sm border border-red-600/30 active:scale-95 transition-all disabled:opacity-50"
                                        >
                                            ❌ 駁回
                                        </button>
                                        <button
                                            disabled={reviewingId === app.id}
                                            onClick={() => handleReview(app.id, true)}
                                            className="flex-2 py-2 bg-emerald-600 text-white font-black rounded-xl text-sm shadow-lg active:scale-95 transition-all disabled:opacity-50"
                                        >
                                            ✅ 初審通過
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    );
                })()}
            </section>
        </div>
    );
}
