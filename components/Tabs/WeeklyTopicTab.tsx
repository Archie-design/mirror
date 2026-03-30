import { useState } from 'react';
import {
    Phone, Mic, Award, Users, PhoneCall,
    GraduationCap, Sparkles, Handshake, BookOpen, Megaphone, Ticket,
    Film, Clapperboard, AlertTriangle,
    type LucideIcon,
} from 'lucide-react';
import { Quest, DailyLog, SystemSettings, TemporaryQuest, W4Application, FineSettings } from '@/types';
import { WEEKLY_QUEST_CONFIG, SQUAD_THEME_CONFIG, QUEST_ICON_MAP, SQUAD_THEME_ICON_MAP } from '@/lib/constants';
import { getLogicalDateStr, getCurrentThemePeriod } from '@/lib/utils/time';

interface WeeklyTopicTabProps {
    systemSettings: SystemSettings;
    fineSettings?: FineSettings;
    logicalTodayStr: string;
    logs: DailyLog[];
    currentWeeklyMonday: Date;
    isTopicDone: boolean;
    temporaryQuests: TemporaryQuest[];
    w4Applications: W4Application[];
    onCheckIn: (q: Quest) => void;
    onUndo: (q: Quest) => void;
    onSubmitW4: (data: { interviewTarget: string; interviewDate: string; description: string }) => Promise<void>;
    onSubmitBonusApp: (type: 'b3' | 'b4' | 'b5' | 'b6' | 'b7', target: string, date: string, desc: string) => Promise<void>;
}

const BONUS_CONFIG: Array<{
    id: 'b3' | 'b4' | 'b5' | 'b6' | 'b7';
    icon: string;
    title: string;
    sub: string;
    reward: number;
    repeatable: boolean;
}> = [
    { id: 'b3', icon: '🎓', title: '續報高階/五運班', sub: '2026/1/16 後完款的皆可計算', reward: 5000, repeatable: false },
    { id: 'b4', icon: '👼', title: '成為小天使', sub: '2026 年度已是小天使的皆可計算', reward: 5000, repeatable: false },
    { id: 'b5', icon: '🤝', title: '報名聯誼會（1年）', sub: '2026/1/16 後完款', reward: 3000, repeatable: false },
    { id: 'b6', icon: '🤝', title: '報名聯誼會（2年）', sub: '2026/1/16 後完款', reward: 5000, repeatable: false },
    { id: 'b7', icon: '📚', title: '參加實體課程', sub: '官網公告或全體系課程，連續幾天只算 1 次', reward: 1000, repeatable: true },
];

const BONUS_ICON_MAP: Record<string, LucideIcon> = {
    b3: GraduationCap,
    b4: Sparkles,
    b5: Handshake,
    b6: Handshake,
    b7: BookOpen,
};

const W4_STATUS_LABELS: Record<string, { label: string; color: string }> = {
    pending:       { label: '🟡 待劇組長初審', color: 'text-yellow-400' },
    squad_approved:{ label: '🔵 待發行商長終審', color: 'text-blue-400' },
    approved:      { label: '🟢 已核准（票房入帳）', color: 'text-emerald-400' },
    rejected:      { label: '🔴 已退回', color: 'text-red-400' },
};

// ── 週曆打卡列 ───────────────────────────────────────────────────────────
function WeekCalendarRow({
    questId,
    logs,
    limit,
    disabled,
    currentWeeklyMonday,
    onCheckIn,
    onUndo,
}: {
    questId: string;
    logs: DailyLog[];
    limit: number;
    disabled: boolean;
    currentWeeklyMonday: Date;
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
                        <span className="text-[10px] text-gray-500 font-mono">{d.getMonth() + 1}/{d.getDate()}</span>
                        <button
                            disabled={isDisabled}
                            onClick={() => isDone ? onUndo(questId, d) : onCheckIn(questId, d)}
                            className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all
                                ${isDone
                                    ? 'bg-[#E50914] text-white shadow-lg'
                                    : isDisabled
                                        ? 'bg-[#222] text-gray-600 cursor-not-allowed'
                                        : 'bg-[#222] text-gray-500 hover:bg-[#333] active:scale-90'}`}
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
    systemSettings,
    fineSettings,
    logicalTodayStr,
    logs,
    currentWeeklyMonday,
    isTopicDone,
    temporaryQuests,
    w4Applications,
    onCheckIn,
    onUndo,
    onSubmitW4,
    onSubmitBonusApp,
}: WeeklyTopicTabProps) {
    // ── 當前電影主題週期 ──
    const themePeriod = getCurrentThemePeriod();

    // ── 傳愛申請 state ──
    const [showW4Form, setShowW4Form] = useState(false);
    const [w4Target, setW4Target] = useState('');
    const [w4Date, setW4Date] = useState(getLogicalDateStr(new Date()));
    const [w4BonusType, setW4BonusType] = useState<'b1' | 'b2'>('b1');
    const [w4Desc, setW4Desc] = useState('');
    const [isSubmittingW4, setIsSubmittingW4] = useState(false);

    // ── b3-b7 加分申請 state ──
    const [activeBonusForm, setActiveBonusForm] = useState<'b3' | 'b4' | 'b5' | 'b6' | 'b7' | null>(null);
    const [bonusTarget, setBonusTarget] = useState('');
    const [bonusDate, setBonusDate] = useState(getLogicalDateStr(new Date()));
    const [bonusDesc, setBonusDesc] = useState('');
    const [isSubmittingBonus, setIsSubmittingBonus] = useState(false);

    // ── 小隊主題定聚選擇 state ──
    const [selectedTheme, setSelectedTheme] = useState<string | null>(null);

    const handleW4Submit = async (e: { preventDefault: () => void }) => {
        e.preventDefault();
        if (!w4Target.trim()) return;
        setIsSubmittingW4(true);
        await onSubmitW4({
            interviewTarget: w4Target,
            interviewDate: w4Date,
            description: `[${w4BonusType === 'b2' ? '訂金5千以上' : '訂金5千以下'}] ${w4Desc}`.trim(),
        });
        setIsSubmittingW4(false);
        setShowW4Form(false);
        setW4Target('');
        setW4Desc('');
    };

    const handleBonusSubmit = async (e: { preventDefault: () => void }) => {
        e.preventDefault();
        if (!activeBonusForm || !bonusTarget.trim()) return;
        setIsSubmittingBonus(true);
        await onSubmitBonusApp(activeBonusForm, bonusTarget.trim(), bonusDate, bonusDesc.trim());
        setIsSubmittingBonus(false);
        setActiveBonusForm(null);
        setBonusTarget('');
        setBonusDesc('');
    };

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

    // ── 罰款邏輯判斷 ──
    const isFineActive = () => {
        if (!fineSettings?.enabled) return false;
        if (!fineSettings.periodStart || !fineSettings.periodEnd) return true;
        return logicalTodayStr >= fineSettings.periodStart && logicalTodayStr <= fineSettings.periodEnd;
    };
    const showFine = isFineActive();
    const isFineItem = (id: string) => showFine && fineSettings?.items?.includes(id);

    // ── 各任務本週完成次數 ──
    const countThisWeek = (qId: string) =>
        logs.filter(l => l.QuestID.startsWith(qId + '|') && new Date(l.Timestamp) >= currentWeeklyMonday).length;

    const a1Quest = WEEKLY_QUEST_CONFIG.find(q => q.id === 'a1')!;
    const w1Quest = WEEKLY_QUEST_CONFIG.find(q => q.id === 'w1')!;
    const w2Quest = WEEKLY_QUEST_CONFIG.find(q => q.id === 'w2')!;
    const w3Quest = WEEKLY_QUEST_CONFIG.find(q => q.id === 'w3')!;
    const w4Quest = WEEKLY_QUEST_CONFIG.find(q => q.id === 'w4')!;

    const a1Count = countThisWeek('a1');
    const w1Count = countThisWeek('w1');
    const w2Count = countThisWeek('w2');
    // w3/w4 月限：用本月
    const thisMonthStr = new Date().toISOString().slice(0, 7); // YYYY-MM
    const w3CountMonth = logs.filter(l => l.QuestID.startsWith('w3|') && l.QuestID.slice(3, 10) >= thisMonthStr + '-01').length;
    const w4CountMonth = logs.filter(l => l.QuestID.startsWith('w4|') && l.QuestID.slice(3, 10) >= thisMonthStr + '-01').length;

    // ── t3 沉澱週分享計數（依 t3QuestBase 為前綴）──
    const t3Base = themePeriod.t3QuestBase;
    const t3Count = t3Base
        ? logs.filter(l => l.QuestID.startsWith(t3Base + '|')).length
        : 0;

    // ── b3-b7 申請記錄（從 w4Applications 篩選）──
    const bonusApps = w4Applications.filter(a =>
        ['b3', 'b4', 'b5', 'b6', 'b7'].some(id => a.quest_id === id || a.quest_id.startsWith(id + '|'))
    );

    return (
        <div className="space-y-8 pb-10 animate-in slide-in-from-right-8 duration-500">


            {/* ── 電影主題週次狀態 ── */}
            <section className="space-y-3">
                <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1">當前電影主題</h2>
                <div className={`p-4 rounded-3xl border flex items-center gap-4 ${
                    themePeriod.type === 'regular' ? 'bg-[#111] border-[#D4AF37]/30'
                    : themePeriod.type === 'reflection' ? 'bg-[#D4AF37]/5 border-[#D4AF37]/40'
                    : 'bg-[#111] border-[#333]'
                }`}>
                    <div className="w-12 h-12 rounded-2xl bg-black/50 flex items-center justify-center text-white/60 shrink-0"><Film size={28} /></div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-black text-white text-sm">《{themePeriod.movie}》</p>
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                                themePeriod.type === 'reflection' ? 'bg-[#D4AF37] text-black' : 'bg-[#E50914] text-white'
                            }`}>{themePeriod.weeks}</span>
                        </div>
                        <p className="text-[10px] text-gray-500 mt-0.5 leading-relaxed">{themePeriod.desc}</p>
                    </div>
                </div>
            </section>

            {/* ── 沉澱週 t3 分享任務（功夫熊貓 / 腦筋急轉彎）── */}
            {themePeriod.taskType === 't3' && t3Base && (
                <section className="space-y-3">
                    <div className="flex justify-between items-center px-1">
                        <h2 className="text-[10px] font-black text-[#D4AF37] uppercase tracking-widest">沉澱週分享任務</h2>
                        <span className={`text-[10px] font-bold ${t3Count >= 3 ? 'text-[#E50914]' : 'text-gray-600'}`}>{t3Count} / 3 則</span>
                    </div>
                    <div className={`p-5 rounded-3xl border space-y-4 relative overflow-hidden ${
                        t3Count >= 3 ? 'opacity-60 bg-[#D4AF37]/10 border-[#D4AF37]/30' : (isFineItem('t3') ? 'bg-red-950/10 border-red-500/20' : 'bg-[#D4AF37]/10 border-[#D4AF37]/30')
                    }`}>
                        {isFineItem('t3') && t3Count < 1 && (
                            <div className="absolute top-0 right-0 px-3 py-1 bg-red-600/20 border-l border-b border-red-500/30 rounded-bl-xl flex items-center gap-1">
                                <AlertTriangle size={10} className="text-red-500" />
                                <span className="text-[10px] font-black text-red-500 uppercase tracking-tighter">本週必修罰款</span>
                            </div>
                        )}
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-black/40 flex items-center justify-center text-white/60 shrink-0"><Film size={22} /></div>
                            <div className="flex-1">
                                <p className="font-bold text-white text-sm">沉澱週分享</p>
                                <p className="text-[10px] text-gray-400">{themePeriod.desc}</p>
                                <p className="text-[10px] text-[#D4AF37] mt-0.5">+{themePeriod.t3Reward} / 則，最多 3 則</p>
                            </div>
                        </div>
                        <div className="flex justify-between items-center">
                            {['一', '二', '三', '四', '五', '六', '日'].map((day, idx) => {
                                const d = new Date();
                                const cd = d.getDay() || 7;
                                d.setDate(d.getDate() + (idx + 1 - cd));
                                const qId = `${t3Base}|${getLogicalDateStr(d)}`;
                                const isDone = logs.some(l => l.QuestID === qId);
                                const isCapped = !isDone && t3Count >= 3;
                                return (
                                    <div key={idx} className="flex flex-col items-center gap-1.5">
                                        <span className="text-[10px] text-gray-500 font-mono">{d.getMonth() + 1}/{d.getDate()}</span>
                                        <button
                                            disabled={isCapped}
                                            onClick={() => isDone
                                                ? onUndo({ id: qId, title: '沉澱週分享', reward: themePeriod.t3Reward })
                                                : onCheckIn({ id: qId, title: '沉澱週分享', reward: themePeriod.t3Reward })}
                                            className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all
                                                ${isDone ? 'bg-[#D4AF37] text-black' : isCapped ? 'bg-[#222] text-gray-600 cursor-not-allowed' : 'bg-[#222] text-gray-500 hover:bg-[#333] active:scale-90'}`}
                                        >{day}</button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </section>
            )}

            {/* ── 個人主題影展（t1）── */}
            <section className="space-y-3">
                <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1">個人主題任務</h2>
                <div className={`p-5 rounded-3xl border-2 ${isTopicDone ? 'border-[#D4AF37]/60 bg-[#D4AF37]/5' : 'border-[#D4AF37]/30 bg-[#111]'} shadow-xl`}>
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 rounded-2xl bg-black/50 flex items-center justify-center text-white/60 shrink-0"><Clapperboard size={28} /></div>
                        <div className="flex-1">
                            <span className="text-[9px] font-black bg-[#D4AF37] text-black px-2 py-0.5 rounded-full uppercase">主題影展</span>
                            <h3 className="text-lg font-black text-white mt-1 italic">「{systemSettings.TopicQuestTitle}」</h3>
                        </div>
                        <div className="text-right">
                            <p className="font-black text-[#D4AF37]">+1,000</p>
                            <p className="text-[10px] text-gray-500">計劃完成</p>
                        </div>
                    </div>
                    <button
                        onClick={() => isTopicDone
                            ? onUndo({ id: 't1', title: '主題影展', reward: 1000 })
                            : onCheckIn({ id: 't1', title: '主題影展', reward: 1000 })}
                        className={`w-full py-3.5 rounded-2xl font-black text-sm transition-all active:scale-95
                            ${isTopicDone
                                ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/30'
                                : 'bg-[#D4AF37] text-black shadow-lg shadow-[0_0_15px_rgba(212,175,55,0.3)]'}`}
                    >
                        {isTopicDone ? '✓ 已完成計劃（點擊取消）' : <span className="flex items-center justify-center gap-1.5"><Ticket size={14} />完成計劃 / 解盤</span>}
                    </button>
                </div>
            </section>

            {/* ── 每日親證打卡（t2 — 需先完成 t1）── */}
            {isTopicDone && (() => {
                const t2Config = { id: 't2', title: '每日親證打卡', reward: 500, limit: 99 };
                const { onCheckIn: t2CheckIn, onUndo: t2Undo } = makeWeekHandler('t2', { id: 't2', title: '每日親證打卡', reward: 500, limit: 99 });
                return (
                    <section className="space-y-3">
                        <div className="flex justify-between items-center px-1">
                            <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">每日親證打卡</h2>
                            <span className="text-[10px] text-gray-600">+{t2Config.reward} / 日</span>
                        </div>
                        <div className="p-5 rounded-3xl bg-[#111] border border-[#333]">
                            <WeekCalendarRow
                                questId="t2"
                                logs={logs}
                                limit={99}
                                disabled={false}
                                currentWeeklyMonday={currentWeeklyMonday}
                                onCheckIn={t2CheckIn}
                                onUndo={t2Undo}
                            />
                        </div>
                    </section>
                );
            })()}

            {/* ── a1：天使通話（每週 1–3 次）── */}
            <section className="space-y-3">
                <div className="flex justify-between items-center px-1">
                    <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">天使通話</h2>
                    <span className={`text-[10px] font-bold ${a1Count >= 3 ? 'text-[#E50914]' : 'text-gray-600'}`}>{a1Count} / 3 次</span>
                </div>
                <div className={`p-5 rounded-3xl border space-y-4 relative overflow-hidden ${
                    a1Count >= 3 ? 'opacity-60 bg-[#111] border-[#333]' : (isFineItem('a1') ? 'bg-red-950/10 border-red-500/20' : 'bg-[#111] border-[#333]')
                }`}>
                    {isFineItem('a1') && a1Count < 1 && (
                        <div className="absolute top-0 right-0 px-3 py-1 bg-red-600/20 border-l border-b border-red-500/30 rounded-bl-xl flex items-center gap-1">
                            <AlertTriangle size={10} className="text-red-500" />
                            <span className="text-[10px] font-black text-red-500 uppercase tracking-tighter">本週必修罰款</span>
                        </div>
                    )}
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-black/40 flex items-center justify-center text-white/70 shrink-0"><Phone size={22} /></div>
                        <div className="flex-1">
                            <p className="font-bold text-white text-sm">天使通話</p>
                            <p className="text-[10px] text-gray-500">每週至少 1 次，最多 3 次 · +{a1Quest.reward}/次</p>
                        </div>
                    </div>
                    <WeekCalendarRow
                        questId="a1"
                        logs={logs}
                        limit={3}
                        disabled={a1Count >= 3}
                        currentWeeklyMonday={currentWeeklyMonday}
                        onCheckIn={(_, day) => onCheckIn({ ...a1Quest, id: `a1|${getLogicalDateStr(day)}` })}
                        onUndo={(_, day) => onUndo({ ...a1Quest, id: `a1|${getLogicalDateStr(day)}` })}
                    />
                </div>
            </section>

            {/* ── w1：親證分享（每週最多 1 則）── */}
            <section className="space-y-3">
                <div className="flex justify-between items-center px-1">
                    <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">親證分享</h2>
                    <span className={`text-[10px] font-bold ${w1Count >= 1 ? 'text-[#E50914]' : 'text-gray-600'}`}>{w1Count} / 1 則</span>
                </div>
                <div className={`p-5 rounded-3xl border space-y-4 relative overflow-hidden ${
                    w1Count >= 1 ? 'opacity-60 bg-[#111] border-[#333]' : (isFineItem('w1') ? 'bg-red-950/10 border-red-500/20' : 'bg-[#111] border-[#333]')
                }`}>
                    {isFineItem('w1') && w1Count < 1 && (
                        <div className="absolute top-0 right-0 px-3 py-1 bg-red-600/20 border-l border-b border-red-500/30 rounded-bl-xl flex items-center gap-1">
                            <AlertTriangle size={10} className="text-red-500" />
                            <span className="text-[10px] font-black text-red-500 uppercase tracking-tighter">本週必修罰款</span>
                        </div>
                    )}
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-black/40 flex items-center justify-center text-white/70 shrink-0"><Mic size={22} /></div>
                        <div className="flex-1">
                            <p className="font-bold text-white text-sm">親證分享</p>
                            <p className="text-[10px] text-gray-500">群組分享上週親證 & 下週行動方案 · +{w1Quest.reward}</p>
                        </div>
                    </div>
                    <WeekCalendarRow
                        questId="w1"
                        logs={logs}
                        limit={1}
                        disabled={w1Count >= 1}
                        currentWeeklyMonday={currentWeeklyMonday}
                        {...makeWeekHandler('w1', w1Quest)}
                    />
                </div>
            </section>

            {/* ── w2：欣賞／肯定夥伴（每週最多 3 則，各不同人）── */}
            <section className="space-y-3">
                <div className="flex justify-between items-center px-1">
                    <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">欣賞／肯定夥伴</h2>
                    <span className={`text-[10px] font-bold ${w2Count >= 3 ? 'text-[#E50914]' : 'text-gray-600'}`}>{w2Count} / 3 則</span>
                </div>
                <div className={`p-5 rounded-3xl border space-y-4 relative overflow-hidden ${
                    w2Count >= 3 ? 'opacity-60 bg-[#111] border-[#333]' : (isFineItem('w2') ? 'bg-red-950/10 border-red-500/20' : 'bg-[#111] border-[#333]')
                }`}>
                    {isFineItem('w2') && w2Count < 1 && (
                        <div className="absolute top-0 right-0 px-3 py-1 bg-red-600/20 border-l border-b border-red-500/30 rounded-bl-xl flex items-center gap-1">
                            <AlertTriangle size={10} className="text-red-500" />
                            <span className="text-[10px] font-black text-red-500 uppercase tracking-tighter">本週必修罰款</span>
                        </div>
                    )}
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-black/40 flex items-center justify-center text-white/70 shrink-0"><Award size={22} /></div>
                        <div className="flex-1">
                            <p className="font-bold text-white text-sm">欣賞／肯定夥伴</p>
                            <p className="text-[10px] text-gray-500">每次需為不同人，每週最多 3 則 · +{w2Quest.reward}/則</p>
                        </div>
                    </div>
                    <WeekCalendarRow
                        questId="w2"
                        logs={logs}
                        limit={3}
                        disabled={w2Count >= 3}
                        currentWeeklyMonday={currentWeeklyMonday}
                        {...makeWeekHandler('w2', w2Quest)}
                    />
                </div>
            </section>

            {/* ── w3：小隊定聚（每月最多 2 次）+ 主題任務 ── */}
            <section className="space-y-3">
                <div className="flex justify-between items-center px-1">
                    <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">小隊定聚</h2>
                    <span className={`text-[10px] font-bold ${w3CountMonth >= 2 ? 'text-[#E50914]' : 'text-gray-600'}`}>{w3CountMonth} / 2 次（本月）</span>
                </div>
                <div className={`p-5 rounded-3xl border space-y-5 relative overflow-hidden ${
                    w3CountMonth >= 2 ? 'opacity-60 bg-[#111] border-[#333]' : (isFineItem('w3') ? 'bg-red-950/10 border-red-500/20' : 'bg-[#111] border-[#333]')
                }`}>
                    {isFineItem('w3') && w3CountMonth < 1 && (
                        <div className="absolute top-0 right-0 px-3 py-1 bg-red-600/20 border-l border-b border-red-500/30 rounded-bl-xl flex items-center gap-1">
                            <AlertTriangle size={10} className="text-red-500" />
                            <span className="text-[10px] font-black text-red-500 uppercase tracking-tighter">本月必修罰款</span>
                        </div>
                    )}
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-black/40 flex items-center justify-center text-white/70 shrink-0"><Users size={22} /></div>
                        <div className="flex-1">
                            <p className="font-bold text-white text-sm">小隊定聚</p>
                            <p className="text-[10px] text-gray-500">每月最多 2 次 · 基礎 +{w3Quest.reward.toLocaleString()} · 另加主題獎勵</p>
                        </div>
                    </div>
                    <WeekCalendarRow
                        questId="w3"
                        logs={logs}
                        limit={2}
                        disabled={w3CountMonth >= 2}
                        currentWeeklyMonday={currentWeeklyMonday}
                        {...makeWeekHandler('w3', w3Quest)}
                    />

                    {/* 主題選擇 */}
                    <div className="space-y-2">
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">選擇本次主題（另加積分）</p>
                        <div className="grid grid-cols-2 gap-2">
                            {SQUAD_THEME_CONFIG.map(theme => (
                                <button
                                    key={theme.id}
                                    onClick={() => setSelectedTheme(selectedTheme === theme.id ? null : theme.id)}
                                    className={`p-3 rounded-2xl border text-left transition-all
                                        ${selectedTheme === theme.id
                                            ? 'border-[#D4AF37] bg-[#D4AF37]/10'
                                            : 'border-[#333] bg-black hover:border-[#555]'}`}
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        {(() => {
                                            const TIcon = SQUAD_THEME_ICON_MAP[theme.id];
                                            return TIcon
                                                ? <TIcon size={16} className={selectedTheme === theme.id ? 'text-[#D4AF37]' : 'text-white/60'} />
                                                : <span className="text-xl">{theme.icon}</span>;
                                        })()}
                                        <span className={`font-black text-xs ${selectedTheme === theme.id ? 'text-[#D4AF37]' : 'text-white'}`}>{theme.title}</span>
                                    </div>
                                    <p className="text-[9px] text-gray-500">{theme.attr}</p>
                                    <p className="text-[10px] text-[#D4AF37] font-bold mt-1">+{theme.reward.toLocaleString()} (+{theme.bonusFull.toLocaleString()} 全員)</p>
                                </button>
                            ))}
                        </div>
                        {selectedTheme && (() => {
                            const theme = SQUAD_THEME_CONFIG.find(t => t.id === selectedTheme)!;
                            return (
                                <div className="p-3 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 space-y-2">
                                    <div className="flex items-center gap-1.5 text-xs text-[#D4AF37] font-bold">
                                        {(() => {
                                            const TIcon = SQUAD_THEME_ICON_MAP[theme.id];
                                            return TIcon ? <TIcon size={13} /> : <span>{theme.icon}</span>;
                                        })()}
                                        {theme.title} 主題說明
                                    </div>
                                    <p className="text-[10px] text-gray-400">{theme.desc}</p>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => onCheckIn({ id: theme.id, title: `${theme.title} 主題定聚`, reward: theme.reward })}
                                            className="flex-1 py-2 bg-[#D4AF37] text-black font-black rounded-xl text-xs active:scale-95 transition-all"
                                        >
                                            +{theme.reward.toLocaleString()} 主題積分
                                        </button>
                                        <button
                                            onClick={() => onCheckIn({ id: `${theme.id}_full`, title: `${theme.title} 全員到齊`, reward: theme.bonusFull })}
                                            className="flex-1 py-2 bg-[#333] text-white font-bold rounded-xl text-xs active:scale-95 transition-all hover:bg-[#444]"
                                        >
                                            +{theme.bonusFull.toLocaleString()} 全員加成
                                        </button>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            </section>

            {/* ── w4：小隊通話（每月最多 2 次）── */}
            <section className="space-y-3">
                <div className="flex justify-between items-center px-1">
                    <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">小隊通話</h2>
                    <span className={`text-[10px] font-bold ${w4CountMonth >= 2 ? 'text-[#E50914]' : 'text-gray-600'}`}>{w4CountMonth} / 2 次（本月）</span>
                </div>
                <div className={`p-5 rounded-3xl border space-y-4 relative overflow-hidden ${
                    w4CountMonth >= 2 ? 'opacity-60 bg-[#111] border-[#333]' : (isFineItem('w4') ? 'bg-red-950/10 border-red-500/20' : 'bg-[#111] border-[#333]')
                }`}>
                    {isFineItem('w4') && w4CountMonth < 1 && (
                        <div className="absolute top-0 right-0 px-3 py-1 bg-red-600/20 border-l border-b border-red-500/30 rounded-bl-xl flex items-center gap-1">
                            <AlertTriangle size={10} className="text-red-500" />
                            <span className="text-[10px] font-black text-red-500 uppercase tracking-tighter">本月必修罰款</span>
                        </div>
                    )}
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-black/40 flex items-center justify-center text-white/70 shrink-0"><PhoneCall size={22} /></div>
                        <div className="flex-1">
                            <p className="font-bold text-white text-sm">小隊通話</p>
                            <p className="text-[10px] text-gray-500">每月最多 2 次 · +{w4Quest.reward.toLocaleString()}</p>
                        </div>
                    </div>
                    <WeekCalendarRow
                        questId="w4"
                        logs={logs}
                        limit={2}
                        disabled={w4CountMonth >= 2}
                        currentWeeklyMonday={currentWeeklyMonday}
                        {...makeWeekHandler('w4', w4Quest)}
                    />
                </div>
            </section>

            {/* ── 傳愛系統（b1/b2）── */}
            <section className="space-y-3">
                <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1">傳愛加分</h2>
                <div className="p-5 rounded-3xl bg-[#111] border border-[#E50914]/20 shadow-xl space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-black/40 flex items-center justify-center text-white/70 shrink-0"><Megaphone size={22} /></div>
                        <div className="flex-1">
                            <p className="font-bold text-white text-sm">傳愛（三層審核制）</p>
                            <p className="text-[10px] text-gray-500">訂金 5千以下 +100 · 5千以上 +200</p>
                        </div>
                    </div>

                    {!showW4Form ? (
                        <button
                            onClick={() => setShowW4Form(true)}
                            className="w-full py-3.5 rounded-2xl font-black text-sm bg-[#E50914] text-white shadow-lg active:scale-95 transition-all flex items-center justify-center gap-1.5"
                        >
                            <Ticket size={14} />提交傳愛申請
                        </button>
                    ) : (
                        <form onSubmit={handleW4Submit} className="space-y-3 text-left">
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">被介紹對象 *</label>
                                <input required value={w4Target} onChange={e => setW4Target(e.target.value)}
                                    placeholder="例：王小明"
                                    className="w-full mt-1 bg-[#222] border border-[#333] rounded-2xl p-3.5 text-white font-bold outline-none focus:border-[#E50914] text-sm" />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">訂金金額</label>
                                <div className="flex gap-2 mt-1">
                                    {(['b1', 'b2'] as const).map(type => (
                                        <button key={type} type="button"
                                            onClick={() => setW4BonusType(type)}
                                            className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all
                                                ${w4BonusType === type ? 'bg-[#E50914] text-white' : 'bg-[#222] text-gray-400 hover:bg-[#333]'}`}
                                        >
                                            {type === 'b1' ? '5千以下 +100' : '5千以上 +200'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">日期 *</label>
                                <input required type="date" value={w4Date} onChange={e => setW4Date(e.target.value)}
                                    className="w-full mt-1 bg-[#222] border border-[#333] rounded-2xl p-3.5 text-white font-bold outline-none focus:border-[#E50914] text-sm" />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">簡述（選填）</label>
                                <textarea value={w4Desc} onChange={e => setW4Desc(e.target.value)}
                                    rows={2} placeholder="簡述推薦情況…"
                                    className="w-full mt-1 bg-[#222] border border-[#333] rounded-2xl p-3.5 text-white font-bold outline-none focus:border-[#E50914] text-sm resize-none" />
                            </div>
                            <div className="flex gap-2">
                                <button type="button" onClick={() => setShowW4Form(false)}
                                    className="flex-1 py-3 bg-[#222] text-gray-400 font-bold rounded-2xl text-sm">取消</button>
                                <button type="submit" disabled={isSubmittingW4}
                                    className="flex-1 py-3 bg-[#E50914] text-white font-black rounded-2xl text-sm active:scale-95 transition-all disabled:opacity-50">
                                    {isSubmittingW4 ? '提交中…' : '確認送出'}
                                </button>
                            </div>
                        </form>
                    )}

                    {w4Applications.length > 0 && (
                        <div className="space-y-2 pt-2 border-t border-[#333]">
                            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">申請記錄</p>
                            {w4Applications.map(app => {
                                const si = W4_STATUS_LABELS[app.status] ?? { label: app.status, color: 'text-gray-400' };
                                return (
                                    <div key={app.id} className="bg-[#222] rounded-2xl p-3.5 space-y-1">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="font-bold text-white text-sm">{app.interview_target}</p>
                                                <p className="text-[10px] text-gray-500">{app.interview_date}</p>
                                            </div>
                                            <span className={`text-[10px] font-black ${si.color}`}>{si.label}</span>
                                        </div>
                                        {app.description && <p className="text-[10px] text-gray-400 italic">{app.description}</p>}
                                        {app.status === 'rejected' && (app.final_review_notes || app.squad_review_notes) && (
                                            <p className="text-[10px] text-[#E50914] font-bold">駁回原因：{app.final_review_notes || app.squad_review_notes}</p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </section>

            {/* ── b3–b7 其他加分任務申請 ── */}
            <section className="space-y-3">
                <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1">其他加分任務申請</h2>
                <div className="space-y-2">
                    {BONUS_CONFIG.map(cfg => {
                        const existingApp = bonusApps.find(a =>
                            a.quest_id === cfg.id || a.quest_id.startsWith(cfg.id + '|')
                        );
                        const isApproved = existingApp?.status === 'approved';
                        const isPending = existingApp && existingApp.status !== 'rejected' && existingApp.status !== 'approved';
                        const isOpen = activeBonusForm === cfg.id;

                        return (
                            <div key={cfg.id} className={`rounded-2xl border p-4 space-y-3 transition-all ${
                                isApproved ? 'bg-[#E50914]/10 border-[#E50914]/30 opacity-60'
                                : isPending ? 'bg-yellow-500/5 border-yellow-500/20'
                                : 'bg-[#111] border-[#222]'
                            }`}>
                                <div className="flex items-center gap-3">
                                    {(() => {
                                        const BIcon = BONUS_ICON_MAP[cfg.id];
                                        return BIcon
                                            ? <div className="w-10 h-10 rounded-xl bg-black/40 flex items-center justify-center text-white/70 shrink-0"><BIcon size={20} /></div>
                                            : <span className="text-2xl shrink-0">{cfg.icon}</span>;
                                    })()}
                                    <div className="flex-1 min-w-0">
                                        <p className={`font-bold text-sm ${isApproved ? 'text-[#E50914]' : 'text-white'}`}>{cfg.title}</p>
                                        <p className="text-[10px] text-gray-500">{cfg.sub}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className={`font-black text-sm ${isApproved ? 'text-[#E50914]' : 'text-[#D4AF37]'}`}>+{cfg.reward.toLocaleString()}</p>
                                        {isPending && <p className="text-[9px] text-yellow-400 font-bold">審核中</p>}
                                        {isApproved && <p className="text-[9px] text-[#E50914] font-bold">已入帳</p>}
                                    </div>
                                </div>

                                {/* 申請按鈕 or 展開表單 */}
                                {!isApproved && !isPending && (
                                    <>
                                        {!isOpen ? (
                                            <button
                                                onClick={() => { setActiveBonusForm(cfg.id); setBonusDate(getLogicalDateStr(new Date())); }}
                                                className="w-full py-2.5 rounded-xl bg-[#222] border border-[#333] text-gray-400 font-bold text-xs hover:border-[#D4AF37]/50 hover:text-[#D4AF37] transition-colors"
                                            >
                                                + 提交申請
                                            </button>
                                        ) : (
                                            <form onSubmit={handleBonusSubmit} className="space-y-2 text-left animate-in slide-in-from-top-2 duration-200">
                                                <input
                                                    required
                                                    value={bonusTarget}
                                                    onChange={e => setBonusTarget(e.target.value)}
                                                    placeholder={cfg.id === 'b7' ? '課程名稱' : cfg.id === 'b4' ? '小天使編號或說明' : '說明'}
                                                    className="w-full bg-[#222] border border-[#333] rounded-xl px-3 py-2.5 text-white text-sm font-bold outline-none focus:border-[#D4AF37] placeholder:text-gray-600"
                                                />
                                                <input
                                                    required
                                                    type="date"
                                                    value={bonusDate}
                                                    onChange={e => setBonusDate(e.target.value)}
                                                    className="w-full bg-[#222] border border-[#333] rounded-xl px-3 py-2.5 text-white text-sm font-bold outline-none focus:border-[#D4AF37]"
                                                />
                                                <textarea
                                                    value={bonusDesc}
                                                    onChange={e => setBonusDesc(e.target.value)}
                                                    rows={2}
                                                    placeholder="備註（選填）"
                                                    className="w-full bg-[#222] border border-[#333] rounded-xl px-3 py-2.5 text-white text-sm font-bold outline-none focus:border-[#D4AF37] resize-none placeholder:text-gray-600"
                                                />
                                                <div className="flex gap-2">
                                                    <button type="button" onClick={() => setActiveBonusForm(null)} className="flex-1 py-2.5 bg-[#222] text-gray-400 font-bold rounded-xl text-sm">取消</button>
                                                    <button type="submit" disabled={isSubmittingBonus || !bonusTarget.trim()} className="flex-2 py-2.5 bg-[#D4AF37] text-black font-black rounded-xl text-sm active:scale-95 transition-all disabled:opacity-50">
                                                        {isSubmittingBonus ? '提交中…' : '確認送出'}
                                                    </button>
                                                </div>
                                            </form>
                                        )}
                                    </>
                                )}

                                {/* 既有申請的狀態 */}
                                {existingApp && existingApp.status === 'rejected' && (
                                    <p className="text-[10px] text-[#E50914] font-bold">⚠️ 上次申請已退回：{existingApp.final_review_notes || existingApp.squad_review_notes || '無備註'}</p>
                                )}
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* ── 臨時加碼任務 ── */}
            {temporaryQuests.length > 0 && (
                <section className="space-y-3">
                    <h2 className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1">⏳ 臨時加碼任務</h2>
                    {temporaryQuests.map(tq => {
                        const isMax = logs.filter(l => l.QuestID.startsWith(tq.id)).length >= 1;
                        return (
                            <div key={tq.id} className={`p-5 rounded-3xl bg-[#111] border border-blue-500/20 relative overflow-hidden ${isMax ? 'opacity-50' : ''}`}>
                                <div className="absolute top-0 right-0 bg-blue-600/20 text-blue-400 px-3 py-1 rounded-bl-xl text-[9px] font-black uppercase tracking-widest">官方加碼</div>
                                <div className="flex items-center gap-3 mb-4 mt-2">
                                    <span className="text-3xl">🎬</span>
                                    <div className="flex-1">
                                        <p className="font-bold text-white text-sm">{tq.title}</p>
                                        {tq.sub && <p className="text-[10px] text-blue-300">{tq.sub}</p>}
                                        {tq.desc && <p className="text-[10px] text-gray-500 mt-0.5">{tq.desc}</p>}
                                    </div>
                                    <p className="font-black text-blue-400">+{tq.reward.toLocaleString()}</p>
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
                                                <span className="text-[10px] text-gray-500 font-mono">{d.getMonth() + 1}/{d.getDate()}</span>
                                                <button onClick={() => isDone ? onUndo({ ...tq, id: qId }) : (!isMax && onCheckIn({ ...tq, id: qId }))}
                                                    className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all ${isDone ? 'bg-[#E50914] text-white' : 'bg-[#222] text-gray-500 hover:bg-[#333]'}`}
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
