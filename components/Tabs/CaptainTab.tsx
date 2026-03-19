import { useState } from 'react';
import { ShieldAlert, Dices, Loader2, ChevronDown, ChevronUp, Banknote, CalendarCheck, Building2 } from 'lucide-react';
import { DAILY_QUEST_CONFIG } from '@/lib/constants';
import { TeamSettings, W4Application, CaptainBriefing, FinePaymentRecord, SquadFineSubmission } from '@/types';
// SquadFineSubmission used in orgSubmissions prop below

interface SquadMemberFine {
    userId: string;
    name: string;
    totalFines: number;
    finePaid: number;
    balance: number;
}

interface CaptainTabProps {
    teamName: string;
    teamSettings?: TeamSettings;
    pendingW4Apps: W4Application[];
    onDrawWeeklyQuest: () => Promise<void>;
    onReviewW4: (appId: string, approve: boolean, notes: string) => Promise<void>;
    onGetAIBriefing: () => Promise<void>;
    aiBriefing: CaptainBriefing | null;
    isLoadingBriefing: boolean;
    // 罰款管理
    squadFineMembers: SquadMemberFine[];
    fineHistory: FinePaymentRecord[];
    orgSubmissions: SquadFineSubmission[];
    onRecordPayment: (targetUserId: string, amount: number, periodLabel: string, paidToCaptainAt?: string) => Promise<void>;
    onSetPaidToCaptainDate: (paymentId: string, date: string) => Promise<void>;
    onRecordOrgSubmission: (amount: number, submittedAt: string, notes?: string) => Promise<void>;
    isLoadingFines: boolean;
    // w3 違規結算
    onCheckW3Compliance: () => Promise<void>;
    isCheckingCompliance: boolean;
    complianceResult: { periodLabel: string; violators: { userId: string; name: string }[]; alreadyRun: boolean } | null;
}


function getCurrentWeekMondayStr(): string {
    const nowTaiwan = new Date(Date.now() + 8 * 3600 * 1000);
    const day = nowTaiwan.getUTCDay() || 7;
    const monday = new Date(nowTaiwan);
    monday.setUTCDate(monday.getUTCDate() - (day - 1));
    return monday.toISOString().slice(0, 10);
}

export function CaptainTab({
    teamName, teamSettings, pendingW4Apps, onDrawWeeklyQuest, onReviewW4,
    onGetAIBriefing, aiBriefing, isLoadingBriefing,
    squadFineMembers, fineHistory, orgSubmissions, onRecordPayment, onSetPaidToCaptainDate, onRecordOrgSubmission, isLoadingFines,
    onCheckW3Compliance, isCheckingCompliance, complianceResult,
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
        // 預設產生目前雙週週期標籤（台灣時間）
        const nowTW = new Date(Date.now() + 8 * 3600 * 1000);
        const day = nowTW.getUTCDay() || 7;
        const thisMonday = new Date(nowTW);
        thisMonday.setUTCDate(nowTW.getUTCDate() - (day - 1));
        const prevMonday = new Date(thisMonday);
        prevMonday.setUTCDate(thisMonday.getUTCDate() - 14);
        const prevPrevMonday = new Date(thisMonday);
        prevPrevMonday.setUTCDate(thisMonday.getUTCDate() - 7);
        return `${prevMonday.toISOString().slice(0, 10)}~${prevPrevMonday.toISOString().slice(0, 10)}`;
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
        await onReviewW4(appId, approve, reviewNotes[appId] || '');
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
                <h2 className="text-2xl font-black text-white italic mx-auto">{teamName || '未知小隊'}</h2>
                <p className="text-xs text-indigo-300 mt-2 font-black">你擁有點亮同伴前行的提燈。請謹慎決策。</p>
            </div>

            {/* ── AI 隊務分析 ── */}
            <section className="bg-slate-900 border-2 border-purple-500/30 p-8 rounded-4xl space-y-5 shadow-xl">
                <h3 className="text-lg font-black text-white border-b border-white/10 pb-4 text-left">🤖 AI 隊務分析</h3>
                <p className="text-xs text-slate-400 font-bold leading-relaxed text-left">
                    即時分析本小隊近 7 天修行表現，識別表現之星與需要關懷的隊員。
                </p>
                <button
                    disabled={isLoadingBriefing}
                    onClick={onGetAIBriefing}
                    className="w-full flex items-center justify-center gap-3 bg-purple-600 p-4 rounded-2xl text-white font-black text-base shadow-lg hover:bg-purple-500 active:scale-95 transition-all disabled:opacity-50"
                >
                    {isLoadingBriefing
                        ? <><Loader2 size={20} className="animate-spin" /> 分析中，請稍候…</>
                        : <>🤖 開始分析</>
                    }
                </button>

                {aiBriefing && (
                    <div className="space-y-4 pt-1 animate-in slide-in-from-bottom-4 duration-500">
                        <div className="flex items-center gap-2">
                            <span className={`text-xs font-black px-3 py-1 rounded-lg ${
                                aiBriefing.teamMorale === 'high' ? 'bg-emerald-500/20 text-emerald-400' :
                                aiBriefing.teamMorale === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                                'bg-red-500/20 text-red-400'
                            }`}>
                                {aiBriefing.teamMorale === 'high' ? '士氣高昂 ↑' :
                                 aiBriefing.teamMorale === 'medium' ? '士氣持平 →' : '士氣低迷 ↓'}
                            </span>
                        </div>
                        <p className="text-sm text-slate-300 leading-relaxed text-left">{aiBriefing.teamSummary}</p>
                        <div className="bg-slate-800 rounded-2xl p-4 space-y-1 text-left">
                            <p className="text-xs font-black text-emerald-400 uppercase tracking-widest">本週之星</p>
                            <p className="text-sm text-white font-bold">{aiBriefing.topPerformer}</p>
                        </div>
                        {aiBriefing.needsSupport.length > 0 && (
                            <div className="bg-slate-800 rounded-2xl p-4 space-y-2 text-left">
                                <p className="text-xs font-black text-yellow-400 uppercase tracking-widest">需要關懷</p>
                                <div className="flex flex-wrap gap-2">
                                    {aiBriefing.needsSupport.map(name => (
                                        <span key={name} className="px-3 py-1 bg-yellow-500/10 text-yellow-300 text-xs font-bold rounded-lg">
                                            {name}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-2xl p-4 text-left">
                            <p className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-1">本週建議</p>
                            <p className="text-xs text-slate-300 leading-relaxed">{aiBriefing.suggestion}</p>
                        </div>
                    </div>
                )}
            </section>

            {/* ── 💸 罰款管理 ── */}
            <section className="bg-slate-900 border-2 border-amber-500/30 p-8 rounded-4xl space-y-6 shadow-xl">
                <h3 className="text-lg font-black text-white border-b border-white/10 pb-4 flex items-center gap-2">
                    <Banknote size={18} className="text-amber-400" /> 罰款管理
                </h3>

                {/* w3 違規結算 */}
                <div className="bg-slate-800/60 rounded-2xl p-4 space-y-3">
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">📋 上週 w3 違規結算</p>
                    <button
                        disabled={isCheckingCompliance || complianceResult?.alreadyRun === true}
                        onClick={onCheckW3Compliance}
                        className="w-full flex items-center justify-center gap-2 bg-red-800/60 hover:bg-red-700/70 text-white font-black text-sm py-3 rounded-xl transition-all active:scale-95 disabled:opacity-50"
                    >
                        {isCheckingCompliance
                            ? <><Loader2 size={14} className="animate-spin" /> 結算中…</>
                            : complianceResult?.alreadyRun
                            ? `✅ 本週已結算（${complianceResult.periodLabel}）`
                            : '計算上週 w3 違規'}
                    </button>
                    {complianceResult && !complianceResult.alreadyRun && (
                        <p className="text-xs text-center animate-in slide-in-from-top-2 duration-300">
                            {complianceResult.violators.length === 0
                                ? <span className="text-emerald-400 font-black">🎉 上週全員達標！</span>
                                : <span className="text-red-400 font-bold">
                                    {complianceResult.violators.map(v => v.name).join('、')} 未完成 w3，各 +NT$200
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
                    <p className="text-sm text-slate-500 text-center py-4">小隊暫無罰款紀錄</p>
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
                                                title="隊員交款給小隊長的日期（選填）"
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

                                        {/* 隊員→小隊長日期 */}
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
                <h3 className="text-lg font-black text-white border-b border-white/10 pb-4 text-left">🎲 本週推薦定課抽籤</h3>

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
                            每週一 12:00 前抽選本週推薦定課。<br />
                            已抽過的定課不重複，{remaining.length > 0 ? `尚餘 ${remaining.length} 項可抽` : '本輪已全部抽完，下次抽籤將重置循環'}。
                        </p>
                        <button
                            disabled={isDrawing}
                            onClick={handleDraw}
                            className="w-full flex items-center justify-center gap-3 bg-indigo-600 p-5 rounded-2xl text-white font-black text-lg shadow-lg hover:bg-indigo-500 active:scale-95 transition-all disabled:opacity-50"
                        >
                            <Dices size={22} /> {isDrawing ? '命運抽籤中...' : '🎲 抽選本週定課'}
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

            {/* ❤️ 傳愛分數初審 */}
            <section className="bg-slate-900 border-2 border-pink-500/30 p-8 rounded-4xl space-y-6 shadow-xl">
                <h3 className="text-lg font-black text-white border-b border-white/10 pb-4">❤️ 傳愛分數審核（小隊長初審）</h3>

                {pendingW4Apps.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-4">目前無待審申請</p>
                ) : (
                    <div className="space-y-4">
                        {pendingW4Apps.map(app => (
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
                )}
            </section>
        </div>
    );
}
