import React from 'react';
import { Settings, X, BarChart3, Save, Users, Lock, QrCode, Crown, Sliders, UserCog, Grid3X3, Calendar, Plus, Trash2, ToggleLeft, ToggleRight, Pencil, Check } from 'lucide-react';
import { SystemSettings, CharacterStats, TemporaryQuest, BonusApplication, AdminLog, CourseEvent } from '@/types';
import { DEFAULT_COURSE_EVENTS } from '@/lib/courseConfig';

import { DAILY_BASIC_CONFIG, DAILY_WEIGHTED_CONFIG, DAWN_QUEST, DIET_QUEST_CONFIG, WEEKLY_QUEST_CONFIG } from '@/lib/constants';
import { listAllMembers, transferMember, setMemberRole, deleteMember } from '@/app/actions/admin';
import { NineGridTemplateEditor } from '@/components/Admin/NineGridTemplateEditor';

interface MemberRow {
    UserID: string;
    Name: string;
    Email?: string;
    SquadName?: string;
    TeamName?: string;
    IsCaptain?: boolean;
    IsCommandant?: boolean;
    Score?: number;
}

// 統一章節標頭：羅馬數字銘牌 + 襯線標題 + 延伸的黃銅細線
type Accent = 'gold' | 'emerald' | 'ruby' | 'pink' | 'teal' | 'amber';
const ACCENT_MAP: Record<Accent, { text: string; ring: string; rule: string }> = {
    gold:    { text: 'text-[#F5C842]',   ring: 'border-[#F5C842]/60',   rule: 'from-[#F5C842]/50' },
    emerald: { text: 'text-emerald-300',  ring: 'border-emerald-400/50', rule: 'from-emerald-400/40' },
    ruby:    { text: 'text-[#E07A6E]',    ring: 'border-[#E07A6E]/60',   rule: 'from-[#E07A6E]/50' },
    pink:    { text: 'text-pink-300',     ring: 'border-pink-400/50',    rule: 'from-pink-400/40' },
    teal:    { text: 'text-teal-300',     ring: 'border-teal-400/50',    rule: 'from-teal-400/40' },
    amber:   { text: 'text-amber-300',    ring: 'border-amber-400/50',   rule: 'from-amber-400/40' },
};

function SectionHeading({ numeral, title, subtitle, accent = 'gold', icon }: {
    numeral: string; title: string; subtitle?: string; accent?: Accent; icon?: React.ReactNode;
}) {
    const c = ACCENT_MAP[accent];
    return (
        <div className="flex items-center gap-3 md:gap-4">
            <span className={`shrink-0 w-9 h-9 rounded-full bg-[#081812] font-display font-black text-[11px] flex items-center justify-center tracking-widest border ${c.ring} ${c.text}`}>
                {numeral}
            </span>
            <div className="flex items-baseline gap-2 min-w-0">
                {icon && <span className={`${c.text} opacity-80`}>{icon}</span>}
                <h3 className={`font-display text-base md:text-lg font-black tracking-wide ${c.text} truncate`}>{title}</h3>
                {subtitle && <span className="text-[10px] uppercase tracking-[0.25em] text-emerald-200/40 hidden md:inline">{subtitle}</span>}
            </div>
            <div className={`flex-1 h-px bg-gradient-to-r to-transparent ${c.rule}`} />
        </div>
    );
}

function MemberManagementSection() {
    const [members, setMembers] = React.useState<MemberRow[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [search, setSearch] = React.useState('');
    const [editingId, setEditingId] = React.useState<string | null>(null);
    const [editSquad, setEditSquad] = React.useState('');
    const [editTeam, setEditTeam] = React.useState('');
    const [editRole, setEditRole] = React.useState<'captain' | 'commandant' | 'none'>('none');
    const [saving, setSaving] = React.useState(false);
    const [deletingId, setDeletingId] = React.useState<string | null>(null);
    const [msg, setMsg] = React.useState('');

    const load = async () => {
        setLoading(true);
        const res = await listAllMembers();
        if (res.success) setMembers(res.members as MemberRow[]);
        setLoading(false);
    };

    React.useEffect(() => { load(); }, []);

    const filtered = search.trim()
        ? members.filter(m =>
            m.Name?.includes(search) ||
            m.Email?.includes(search) ||
            m.UserID?.includes(search) ||
            m.SquadName?.includes(search) ||
            m.TeamName?.includes(search)
        )
        : members;

    const startEdit = (m: MemberRow) => {
        setEditingId(m.UserID);
        setEditSquad(m.SquadName || '');
        setEditTeam(m.TeamName || '');
        setEditRole(m.IsCommandant ? 'commandant' : m.IsCaptain ? 'captain' : 'none');
        setMsg('');
    };

    const handleDelete = async (m: MemberRow) => {
        const label = `${m.Name}${m.SquadName ? `（${m.SquadName}${m.TeamName ? ` / ${m.TeamName}` : ''}）` : ''}`;
        if (!window.confirm(`確認將「${label}」從名單中完全移除？\n此操作會同時刪除打卡記錄、申請、報到、九宮格等所有資料，且無法復原。`)) return;
        setDeletingId(m.UserID); setMsg('');
        const res = await deleteMember(m.UserID);
        setDeletingId(null);
        if (!res.success) { setMsg(res.error || '移除失敗'); return; }
        setMsg(`已將「${m.Name}」從名單中移除`);
        if (editingId === m.UserID) setEditingId(null);
        await load();
    };

    const handleSave = async (m: MemberRow) => {
        setSaving(true); setMsg('');
        const squadChanged = editSquad !== (m.SquadName || '') || editTeam !== (m.TeamName || '');
        const roleChanged = editRole !== (m.IsCommandant ? 'commandant' : m.IsCaptain ? 'captain' : 'none');

        if (squadChanged) {
            const res = await transferMember(m.UserID, editSquad || null, editTeam || null);
            if (!res.success) { setMsg(res.error || '轉隊失敗'); setSaving(false); return; }
        }
        if (roleChanged) {
            const res = await setMemberRole(m.UserID, editRole);
            if (!res.success) { setMsg(res.error || '角色更新失敗'); setSaving(false); return; }
        }
        setSaving(false);
        setEditingId(null);
        setMsg('已更新');
        await load();
    };

    // Collect unique squad/team names for datalist
    const squads = [...new Set(members.map(m => m.SquadName).filter(Boolean))];
    const teams = [...new Set(members.map(m => m.TeamName).filter(Boolean))];

    return (
        <div className="bg-[#0d241b] border border-emerald-400/15 p-5 md:p-6 rounded-4xl space-y-4 brass-ring">
            <div className="flex gap-2">
                <input
                    placeholder="搜尋姓名 / 手機 / 信箱 / 大隊 / 小隊"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="flex-1 bg-[#061410] border border-emerald-900/60 rounded-xl px-3 py-2.5 text-emerald-100 text-xs outline-none focus:border-emerald-400/60 placeholder:text-emerald-200/25 min-h-[44px]"
                />
                <button
                    onClick={load}
                    disabled={loading}
                    className="px-4 rounded-xl text-xs font-black text-emerald-200/70 hover:text-[#F5C842] border border-emerald-900/60 hover:border-[#F5C842]/40 bg-[#081812] disabled:opacity-40 min-h-[44px] transition-colors"
                >
                    {loading ? '…' : '重整'}
                </button>
            </div>
            {msg && (
                <p className="text-xs text-center font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-xl py-2 animate-fade-up">
                    {msg}
                </p>
            )}
            <div className="max-h-[440px] overflow-y-auto space-y-1 pr-1">
                <datalist id="dl-squads">{squads.map(s => <option key={s} value={s!} />)}</datalist>
                <datalist id="dl-teams">{teams.map(t => <option key={t} value={t!} />)}</datalist>
                {filtered.length === 0 && <p className="text-xs text-emerald-200/40 text-center py-8">無符合成員</p>}
                {filtered.map(m => {
                    const isEditing = editingId === m.UserID;
                    return (
                        <div key={m.UserID} className={`rounded-xl p-3 text-xs transition-colors ${isEditing ? 'bg-[#F5C842]/5 border border-[#F5C842]/30' : 'bg-[#061410]/60 border border-transparent hover:border-emerald-400/15'}`}>
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-display font-black text-emerald-50 w-16 truncate">{m.Name}</span>
                                <span className="text-emerald-200/45 flex-1 truncate min-w-0">{m.SquadName || '—'} / {m.TeamName || '—'}</span>
                                {m.IsCaptain && <span className="text-[10px] text-indigo-300 bg-indigo-400/10 border border-indigo-400/20 px-1.5 py-0.5 rounded-full">隊長</span>}
                                {m.IsCommandant && <span className="text-[10px] text-[#E07A6E] bg-[#E07A6E]/10 border border-[#E07A6E]/20 px-1.5 py-0.5 rounded-full">大隊長</span>}
                                <span className="text-[#F5C842]/60 text-[10px] font-display font-black">{(m.Score ?? 0).toLocaleString()} 分</span>
                                {!isEditing && (
                                    <div className="flex gap-1.5 shrink-0">
                                        <button onClick={() => startEdit(m)} className="text-emerald-300 hover:text-emerald-200 text-[11px] font-bold px-2 py-1 rounded-lg hover:bg-emerald-400/10 transition-colors">編輯</button>
                                        <button
                                            onClick={() => handleDelete(m)}
                                            disabled={deletingId === m.UserID}
                                            className="text-[#E07A6E] hover:text-[#E07A6E] hover:bg-[#E07A6E]/10 text-[11px] font-bold px-2 py-1 rounded-lg disabled:opacity-40 transition-colors"
                                        >
                                            {deletingId === m.UserID ? '移除中…' : '移除'}
                                        </button>
                                    </div>
                                )}
                            </div>
                            {isEditing && (
                                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
                                    <div>
                                        <label className="text-[10px] text-emerald-200/50 block mb-1 uppercase tracking-widest">大隊</label>
                                        <input list="dl-squads" value={editSquad} onChange={e => setEditSquad(e.target.value)}
                                            className="w-full bg-[#061410] border border-emerald-900/60 rounded-lg px-2 py-1.5 text-emerald-100 text-xs outline-none focus:border-[#F5C842]/50" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-emerald-200/50 block mb-1 uppercase tracking-widest">小隊</label>
                                        <input list="dl-teams" value={editTeam} onChange={e => setEditTeam(e.target.value)}
                                            className="w-full bg-[#061410] border border-emerald-900/60 rounded-lg px-2 py-1.5 text-emerald-100 text-xs outline-none focus:border-[#F5C842]/50" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-emerald-200/50 block mb-1 uppercase tracking-widest">角色</label>
                                        <select value={editRole} onChange={e => setEditRole(e.target.value as 'captain' | 'commandant' | 'none')}
                                            className="w-full bg-[#061410] border border-emerald-900/60 rounded-lg px-2 py-1.5 text-emerald-100 text-xs outline-none focus:border-[#F5C842]/50">
                                            <option value="none">一般學員</option>
                                            <option value="captain">小隊長</option>
                                            <option value="commandant">大隊長</option>
                                        </select>
                                    </div>
                                    <div className="flex gap-1.5">
                                        <button disabled={saving} onClick={() => handleSave(m)}
                                            className="flex-1 py-2 bg-[#F5C842] text-[#1A2A1A] rounded-lg font-black text-[11px] hover:brightness-110 disabled:opacity-50 transition-all">
                                            {saving ? '…' : '儲存'}
                                        </button>
                                        <button onClick={() => setEditingId(null)}
                                            className="py-2 px-3 bg-[#061410] text-emerald-200/70 border border-emerald-900/60 rounded-lg text-[11px] hover:text-emerald-200 transition-colors">取消</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            <p className="text-[10px] text-emerald-200/40 text-center tracking-widest uppercase">
                共 {members.length} 人{search && ` · 篩選 ${filtered.length} 人`}
            </p>
        </div>
    );
}


const ACTION_LABELS: Record<string, string> = {
    temp_quest_add: '新增臨時任務',
    temp_quest_toggle: '切換臨時任務狀態',
    temp_quest_delete: '刪除臨時任務',
    roster_import: '匯入名冊',
    auto_assign_squads: '自動分配大隊',
    weekly_snapshot: '每週積分結算',
    bonus_final_approve: '一次性任務終審核准',
    bonus_final_reject: '一次性任務終審駁回',
    drama_training_squad_approve: '戲劇進修初審核准',
    topic_title_update: '更新主題名稱',
    member_transfer: '成員轉隊',
    set_member_role: '更新成員角色',
    member_delete: '移除成員',
};

interface AdminDashboardProps {
    adminAuth: boolean;
    onAuth: (e: { preventDefault: () => void; currentTarget: HTMLFormElement }) => void;
    systemSettings: SystemSettings;
    updateGlobalSetting: (key: string, value: string) => void;
    leaderboard: CharacterStats[];
    temporaryQuests: TemporaryQuest[];
    pendingFinalReviewApps: BonusApplication[];
    adminLogs: AdminLog[];
    onAddTempQuest: (title: string, sub: string, desc: string, reward: number) => void;
    onToggleTempQuest: (id: string, active: boolean) => void;
    onDeleteTempQuest: (id: string) => void;
    onImportRoster: (csvData: string) => Promise<void>;
    onFinalReviewBonus: (appId: string, approve: boolean, notes: string) => Promise<void>;
    onClose: () => void;
}

export function AdminDashboard({
    adminAuth, onAuth, systemSettings, updateGlobalSetting,
    leaderboard, temporaryQuests,
    pendingFinalReviewApps, adminLogs,
    onAddTempQuest, onToggleTempQuest, onDeleteTempQuest,
    onImportRoster, onFinalReviewBonus, onClose
}: AdminDashboardProps) {
    const [csvInput, setCsvInput] = React.useState("");
    const [isImporting, setIsImporting] = React.useState(false);
    const [w4Notes, setW4Notes] = React.useState<Record<string, string>>({});
    const [reviewingW4Id, setReviewingW4Id] = React.useState<string | null>(null);
    const [volunteerPwd, setVolunteerPwd] = React.useState('');
    const [volPwdSaved, setVolPwdSaved] = React.useState(false);
    const [activeAdminTab, setActiveAdminTab] = React.useState<'members' | 'quests' | 'review' | 'system' | 'ninegrid' | 'course'>('members');

    // Quest Reward & Disable State
    const ALL_QUESTS = React.useMemo(() => [
        ...DAILY_BASIC_CONFIG.map(q => ({ id: q.id, title: q.title, defaultReward: q.reward })),
        ...DAILY_WEIGHTED_CONFIG.map(q => ({ id: q.id, title: q.title, defaultReward: q.reward })),
        { id: DAWN_QUEST.id, title: DAWN_QUEST.title, defaultReward: DAWN_QUEST.reward },
        ...DIET_QUEST_CONFIG.map(q => ({ id: q.id, title: q.title, defaultReward: q.reward })),
        ...WEEKLY_QUEST_CONFIG.map(q => ({ id: q.id, title: q.title, defaultReward: q.reward })),
    ], []);
    const [rewardOverrides, setRewardOverrides] = React.useState<Record<string, number>>(
        systemSettings.QuestRewardOverrides || {}
    );
    const [disabledQuests, setDisabledQuests] = React.useState<string[]>(
        systemSettings.DisabledQuests || []
    );
    const [questSettingsSaved, setQuestSettingsSaved] = React.useState(false);
    const disabledSet = new Set(disabledQuests);

    // Course event management state
    const [courseEvents, setCourseEvents] = React.useState<CourseEvent[]>(
        systemSettings.CourseEvents && systemSettings.CourseEvents.length > 0
            ? systemSettings.CourseEvents
            : DEFAULT_COURSE_EVENTS
    );
    const [courseEventsSaved, setCourseEventsSaved] = React.useState(false);
    const blankEvent = (): CourseEvent => ({
        id: '', name: '', date: '', dateDisplay: '', time: '', location: '', enabled: true,
    });
    const [newEvent, setNewEvent] = React.useState<CourseEvent>(blankEvent());
    const [editingEventId, setEditingEventId] = React.useState<string | null>(null);

    const handleImportSubmit = async (e: { preventDefault: () => void }) => {
        e.preventDefault();
        if (!csvInput.trim()) return;
        setIsImporting(true);
        await onImportRoster(csvInput);
        setIsImporting(false);
        setCsvInput("");
    };

    const handleW4Review = async (appId: string, approve: boolean) => {
        setReviewingW4Id(appId);
        await onFinalReviewBonus(appId, approve, w4Notes[appId] || '');
        setReviewingW4Id(null);
        setW4Notes(prev => { const n = { ...prev }; delete n[appId]; return n; });
    };

    if (!adminAuth) {
        return (
            <div className="admin-grain min-h-screen text-emerald-50 p-8 flex flex-col justify-center items-center animate-in fade-in relative overflow-hidden">
                <div className="relative z-10 max-w-sm w-full space-y-10 text-center mx-auto animate-fade-up">
                    <div className="space-y-4">
                        <div className="w-24 h-24 rounded-full mx-auto flex items-center justify-center border-2 border-[#F5C842]/40 bg-[#081812] text-[#F5C842] shadow-[0_0_40px_-8px_rgba(245,200,66,0.5)]">
                            <Lock size={36} strokeWidth={1.5} />
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-[0.5em] text-[#F5C842]/70">Wizard&apos;s Chamber</p>
                        <h1 className="font-display text-4xl font-black text-emerald-50 tracking-wider">大法師密室</h1>
                        <div className="mx-auto w-24 h-px brass-rule" />
                        <p className="text-xs text-emerald-200/60 tracking-wide">說出通關密語，方得入內。</p>
                    </div>
                    <form onSubmit={onAuth} className="space-y-5">
                        <input
                            name="password"
                            type="password"
                            required
                            autoFocus
                            placeholder="密令"
                            className="w-full bg-[#061410] border border-[#F5C842]/30 rounded-2xl p-5 text-[#F5C842] text-center text-xl outline-none focus:border-[#F5C842] focus:shadow-[0_0_24px_-4px_rgba(245,200,66,0.4)] font-display font-black tracking-[0.6em] placeholder:text-emerald-200/25 placeholder:tracking-[0.3em] transition-all"
                        />
                        <div className="flex gap-3">
                            <button type="button" onClick={onClose} className="flex-1 py-4 bg-[#081812] text-emerald-200/60 font-bold rounded-2xl border border-emerald-900/50 hover:text-emerald-200 transition-colors">返回</button>
                            <button className="flex-[1.5] py-4 bg-gradient-to-b from-[#F5C842] to-[#d4a726] text-[#1A2A1A] font-display font-black text-base rounded-2xl shadow-[0_8px_24px_-8px_rgba(245,200,66,0.6)] active:scale-95 transition-all tracking-widest">進入密室</button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    const TAB_CONFIG = [
        { id: 'members'  as const, label: '成員',   numeral: 'I',   icon: <Users size={14} /> },
        { id: 'quests'   as const, label: '任務',   numeral: 'II',  icon: <Sliders size={14} /> },
        { id: 'review'   as const, label: '審核',   numeral: 'III', icon: <Settings size={14} /> },
        { id: 'ninegrid' as const, label: '九宮格', numeral: 'IV',  icon: <Grid3X3 size={14} /> },
        { id: 'system'   as const, label: '系統',   numeral: 'V',   icon: <BarChart3 size={14} /> },
        { id: 'course'   as const, label: '課程',   numeral: 'VI',  icon: <Calendar size={14} /> },
    ];

    return (
        <div className="admin-grain min-h-screen text-emerald-50 p-4 md:p-8 animate-in fade-in relative">
            <div className="relative z-10 max-w-6xl mx-auto space-y-8 pb-20">
                <header className="flex justify-between items-center">
                    <div className="flex items-center gap-3 md:gap-5">
                        <div className="relative p-3 md:p-4 rounded-2xl bg-[#081812] border border-[#F5C842]/40 text-[#F5C842] shadow-[0_0_32px_-8px_rgba(245,200,66,0.5)]">
                            <Crown size={26} strokeWidth={1.75} />
                            <span className="absolute -inset-px rounded-2xl pointer-events-none" style={{ boxShadow: 'inset 0 1px 0 rgba(245,200,66,0.25)' }} />
                        </div>
                        <div className="text-left">
                            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-[#F5C842]/70 hidden md:block">Wizard&apos;s Back Office</p>
                            <h1 className="font-display text-3xl md:text-4xl font-black text-emerald-50 tracking-wider">大法師密室</h1>
                            <div className="mt-1 w-32 h-px brass-rule hidden md:block" />
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="關閉"
                        className="p-3 md:p-4 rounded-2xl text-emerald-200/60 border border-emerald-900/50 bg-[#081812]/70 backdrop-blur-md hover:text-[#E07A6E] hover:border-[#E07A6E]/40 transition-all hover:rotate-90"
                    >
                        <X size={20} />
                    </button>
                </header>

                {/* Tab navigation — 黃銅分頁（羅馬數字 + 底線） */}
                <div className="relative">
                    <div className="flex gap-1 bg-[#081812] p-1.5 rounded-2xl border border-[#F5C842]/15 overflow-x-auto no-scrollbar brass-ring">
                        {TAB_CONFIG.map(tab => {
                            const active = activeAdminTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveAdminTab(tab.id)}
                                    className={`relative flex-1 min-w-[72px] flex flex-col items-center justify-center gap-0.5 py-2.5 px-2 rounded-xl text-[11px] font-black transition-all ${
                                        active
                                            ? 'bg-gradient-to-b from-[#F5C842]/15 to-transparent text-[#F5C842]'
                                            : 'text-emerald-200/45 hover:text-emerald-100 hover:bg-emerald-950/40'
                                    }`}
                                >
                                    <div className="flex items-center gap-1.5">
                                        <span className={`font-display text-[10px] tracking-widest ${active ? 'text-[#F5C842]' : 'text-emerald-200/35'}`}>{tab.numeral}</span>
                                        <span className="opacity-70">{tab.icon}</span>
                                        <span>{tab.label}</span>
                                    </div>
                                    {active && <span className="absolute bottom-0 left-4 right-4 h-px bg-[#F5C842] shadow-[0_0_8px_rgba(245,200,66,0.8)]" />}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ── Tab: 成員 ── */}
                {activeAdminTab === 'members' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fade-up">
                    <section className="space-y-5">
                        <SectionHeading numeral="I.i" title="學員名冊管理" subtitle="Roster Entrance" accent="gold" icon={<Users size={16} />} />
                        <div className="bg-[#0d241b] border border-[#F5C842]/15 p-6 md:p-7 rounded-4xl space-y-6 brass-ring">
                            <div className="space-y-3">
                                <p className="text-[10px] font-black text-[#F5C842]/60 uppercase tracking-[0.3em]">登入模式</p>
                                <div className={`flex items-center justify-between p-4 rounded-2xl border ${systemSettings.RegistrationMode === 'roster' ? 'border-indigo-400/40 bg-indigo-950/20' : 'border-emerald-400/40 bg-emerald-950/30'}`}>
                                    <div>
                                        <p className={`font-display font-black text-sm ${systemSettings.RegistrationMode === 'roster' ? 'text-indigo-200' : 'text-emerald-200'}`}>
                                            {systemSettings.RegistrationMode === 'roster' ? '名單驗證模式' : '自由註冊模式'}
                                        </p>
                                        <p className="text-[10px] text-emerald-200/50 mt-0.5">
                                            {systemSettings.RegistrationMode === 'roster' ? '僅限名冊內信箱登入，新生需由管理員預先匯入' : '任何人可自行填表註冊'}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => updateGlobalSetting('RegistrationMode', systemSettings.RegistrationMode === 'roster' ? 'open' : 'roster')}
                                        className={`px-4 py-2.5 rounded-xl text-[11px] font-black transition-all min-h-[44px] ${systemSettings.RegistrationMode === 'roster' ? 'bg-emerald-500 text-emerald-50 hover:bg-emerald-400' : 'bg-indigo-500 text-indigo-50 hover:bg-indigo-400'}`}
                                    >
                                        切換為{systemSettings.RegistrationMode === 'roster' ? '自由' : '名單'}
                                    </button>
                                </div>
                            </div>
                            <div className="h-px brass-rule opacity-30" />
                            <form onSubmit={handleImportSubmit} className="space-y-4">
                                <p className="text-xs text-emerald-200/60 leading-relaxed">
                                    請貼上 CSV 格式資料（含表頭行將自動略過）<br />
                                    格式：<span className="text-[#F5C842] font-mono text-[10px]">email, 姓名, 生日, 大隊, 小隊, is_captain, is_commandant</span>
                                </p>
                                <textarea
                                    value={csvInput}
                                    onChange={(e) => setCsvInput(e.target.value)}
                                    placeholder={`user1@gmail.com,王小明,1960-03-15,第一大隊,第一小隊,true,false\nuser2@gmail.com,李大華,1985-07-22,第一大隊,第一小隊,false,false`}
                                    className="w-full h-36 bg-[#061410] border border-[#F5C842]/15 rounded-2xl p-4 text-emerald-100 font-mono text-xs outline-none focus:border-[#F5C842]/50 resize-none placeholder:text-emerald-200/20"
                                />
                                <button disabled={isImporting || !csvInput} className="w-full p-4 rounded-2xl bg-gradient-to-b from-[#F5C842] to-[#d4a726] text-[#1A2A1A] font-display font-black tracking-widest shadow-[0_8px_24px_-8px_rgba(245,200,66,0.5)] hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                                    {isImporting ? '匯入中…' : '批量匯入名冊'}
                                </button>
                            </form>
                        </div>
                    </section>
                    <section className="space-y-5">
                        <SectionHeading numeral="I.ii" title="成員管理" subtitle="Member Registry" accent="emerald" icon={<UserCog size={16} />} />
                        <MemberManagementSection />
                    </section>
                </div>
                )}

                {/* ── Tab: 任務 ── */}
                {activeAdminTab === 'quests' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <section className="space-y-6 md:col-span-2">
                        <div className="flex items-center gap-2 text-emerald-400 font-black text-sm uppercase tracking-widest"><Sliders size={16} /> 定課分值 & 啟停管理</div>
                        <div className="bg-slate-900 border-2 border-slate-800 p-8 rounded-4xl space-y-4 shadow-xl">
                            <p className="text-xs text-slate-400">調整各定課基礎分數（留空＝使用預設值），或停用不需要的定課。</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[420px] overflow-y-auto pr-1">
                                {ALL_QUESTS.map(q => {
                                    const isDisabled = disabledSet.has(q.id);
                                    return (
                                        <div key={q.id} className={`flex items-center gap-2 p-3 rounded-xl border transition-colors ${isDisabled ? 'bg-slate-950 border-slate-800 opacity-50' : 'bg-slate-950/50 border-slate-700/50'}`}>
                                            <input
                                                type="checkbox"
                                                checked={!isDisabled}
                                                onChange={() => {
                                                    setDisabledQuests(prev =>
                                                        prev.includes(q.id) ? prev.filter(id => id !== q.id) : [...prev, q.id]
                                                    );
                                                    setQuestSettingsSaved(false);
                                                }}
                                                className="accent-emerald-500 w-4 h-4 shrink-0"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <span className="text-xs font-bold text-slate-300 block truncate">{q.id} {q.title}</span>
                                            </div>
                                            <input
                                                type="number"
                                                min={0}
                                                step={100}
                                                placeholder={String(q.defaultReward)}
                                                value={rewardOverrides[q.id] ?? ''}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    setRewardOverrides(prev => {
                                                        const next = { ...prev };
                                                        if (val === '' || Number(val) === q.defaultReward) {
                                                            delete next[q.id];
                                                        } else {
                                                            next[q.id] = Number(val);
                                                        }
                                                        return next;
                                                    });
                                                    setQuestSettingsSaved(false);
                                                }}
                                                disabled={isDisabled}
                                                className="w-20 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-xs font-bold text-right outline-none focus:border-emerald-500 disabled:opacity-30 placeholder:text-slate-600"
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                            <button
                                onClick={() => {
                                    updateGlobalSetting('QuestRewardOverrides', JSON.stringify(rewardOverrides));
                                    updateGlobalSetting('DisabledQuests', JSON.stringify(disabledQuests));
                                    setQuestSettingsSaved(true);
                                }}
                                className="w-full bg-emerald-700 p-4 rounded-2xl text-white font-black shadow-lg hover:bg-emerald-600 transition-colors"
                            >
                                <Save size={18} className="inline mr-2" />
                                儲存定課設定
                            </button>
                            {questSettingsSaved && <p className="text-xs text-emerald-400 font-bold text-center mt-2">定課設定已更新</p>}
                        </div>
                    </section>

                    <section className="space-y-6">
                        <div className="flex items-center gap-2 text-orange-500 font-black text-sm uppercase tracking-widest"><Settings size={16} /> 臨時加分任務管理</div>
                        <div className="bg-slate-900 border-2 border-slate-800 p-8 rounded-4xl space-y-6 shadow-xl">
                            <form onSubmit={(e) => {
                                e.preventDefault();
                                const fd = new FormData(e.currentTarget);
                                const title = fd.get('title') as string;
                                const sub = fd.get('sub') as string;
                                const desc = fd.get('desc') as string;
                                const reward = parseInt(fd.get('reward') as string, 10);
                                if (title && reward) {
                                    onAddTempQuest(title, sub, desc, reward);
                                    e.currentTarget.reset();
                                }
                            }} className="space-y-4">
                                <div className="grid grid-cols-1 gap-3">
                                    <input name="title" required placeholder="主標題（固定顯示：特別任務）" className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:border-orange-500" />
                                    <input name="sub" required placeholder="任務名稱（例：跟父母三道菜）" className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:border-orange-500" />
                                    <input name="desc" placeholder="任務說明（例：面對面或是視訊）" className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:border-orange-500" />
                                </div>
                                <div className="flex gap-4 items-center">
                                    <input name="reward" type="number" required defaultValue={500} placeholder="加分額度" className="w-32 bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-bold text-center outline-none focus:border-orange-500" />
                                    <button type="submit" className="flex-1 bg-orange-600 p-4 rounded-2xl text-white font-black shadow-lg hover:bg-orange-500 transition-colors">➕ 新增臨時任務</button>
                                </div>
                            </form>
                            <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                                {temporaryQuests.map(tq => (
                                    <div key={tq.id} className="flex justify-between items-center bg-slate-950 p-4 rounded-2xl border border-slate-800">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <h4 className="font-bold text-slate-200">{tq.title}</h4>
                                                <span className="text-[10px] font-black text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-lg">+{tq.reward}</span>
                                            </div>
                                            {tq.sub && <p className="text-xs text-orange-400 font-bold mt-1">{tq.sub}</p>}
                                            {tq.desc && <p className="text-xs text-slate-500 mt-0.5">{tq.desc}</p>}
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={() => onToggleTempQuest(tq.id, !tq.active)}
                                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${tq.active ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/50' : 'bg-slate-800 text-slate-400'}`}
                                            >
                                                {tq.active ? '🟢 啟用中' : '🔴 已暫停'}
                                            </button>
                                            <button
                                                onClick={() => onDeleteTempQuest(tq.id)}
                                                className="p-2 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500/20 transition-colors"
                                            >
                                                <X size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>
                </div>
                )}

                {/* ── Tab: 審核 ── */}
                {activeAdminTab === 'review' && (
                <div className="space-y-8">
                    <section className="space-y-6">
                        <div className="flex items-center gap-2 text-pink-500 font-black text-sm uppercase tracking-widest">❤️ 待終審申請（傳愛 & 加分任務）</div>
                        <div className="bg-slate-900 border-2 border-pink-500/20 p-8 rounded-4xl shadow-xl space-y-4">
                            {pendingFinalReviewApps.length === 0 ? (
                                <p className="text-sm text-slate-500 text-center py-4">目前無待終審申請</p>
                            ) : (
                                pendingFinalReviewApps.map(app => {
                                    const ONE_TIME_LABELS: Record<string, string> = {
                                        o1: '超越巔峰',
                                        o3: '聯誼會（1年）',
                                        o4: '聯誼會（2年）',
                                        o5: '報高階（訂金）',
                                        o6: '報高階（完款）',
                                        o7: '傳愛',
                                    };
                                    const questLabel = ONE_TIME_LABELS[app.quest_id] || app.quest_id;
                                    return (
                                    <div key={app.id} className="bg-slate-800 rounded-2xl p-5 space-y-3">
                                        <div className="flex justify-between items-start flex-wrap gap-2">
                                            <div>
                                                <p className="font-black text-white">{app.user_name}</p>
                                                <p className="text-xs text-slate-400">
                                                    {app.squad_name} · <span className="text-amber-300 font-bold">{questLabel}</span>
                                                    {app.interview_target && ` · ${app.interview_target}`} · {app.interview_date}
                                                </p>
                                                {app.squad_review_notes && <p className="text-xs text-indigo-400 mt-1">隊長備註：{app.squad_review_notes}</p>}
                                            </div>
                                            <span className="text-[10px] font-black px-2 py-1 rounded-lg text-blue-400 bg-blue-400/10">待終審</span>
                                        </div>
                                        {app.description && <p className="text-xs text-slate-400 italic">{app.description}</p>}
                                        <textarea
                                            placeholder="終審備註（選填）"
                                            value={w4Notes[app.id] || ''}
                                            onChange={e => setW4Notes(prev => ({ ...prev, [app.id]: e.target.value }))}
                                            rows={2}
                                            className="w-full bg-slate-700 border border-slate-600 rounded-xl p-3 text-white text-xs outline-none focus:border-pink-500 resize-none"
                                        />
                                        <div className="flex gap-3">
                                            <button
                                                disabled={reviewingW4Id === app.id}
                                                onClick={() => handleW4Review(app.id, false)}
                                                className="flex-1 py-2 bg-red-600/20 text-red-400 font-black rounded-xl text-sm border border-red-600/30 active:scale-95 transition-all disabled:opacity-50"
                                            >
                                                ❌ 駁回
                                            </button>
                                            <button
                                                disabled={reviewingW4Id === app.id}
                                                onClick={() => handleW4Review(app.id, true)}
                                                className="flex-2 py-2 bg-emerald-600 text-white font-black rounded-xl text-sm shadow-lg active:scale-95 transition-all disabled:opacity-50"
                                            >
                                                ✅ 核准入帳
                                            </button>
                                        </div>
                                    </div>
                                    );
                                })
                            )}
                        </div>
                    </section>

                    <section className="space-y-6">
                        <div className="flex items-center gap-2 text-teal-500 font-black text-sm uppercase tracking-widest"><QrCode size={16} /> 志工掃碼授權</div>
                        <div className="bg-slate-900 border-2 border-teal-500/20 p-8 rounded-4xl space-y-5 shadow-xl">
                            <p className="text-xs text-slate-400">設定志工專屬密碼，讓報到志工可在主頁「課程」分頁輸入密碼後開啟掃碼介面，無需管理員帳號。</p>
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                <span>目前狀態：</span>
                                {systemSettings.VolunteerPassword
                                    ? <span className="text-teal-400 font-black">✅ 已設定</span>
                                    : <span className="text-slate-500 font-black">⚠️ 尚未設定</span>
                                }
                            </div>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={volunteerPwd}
                                    onChange={e => { setVolunteerPwd(e.target.value); setVolPwdSaved(false); }}
                                    placeholder="輸入新的志工密碼"
                                    className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:border-teal-500"
                                />
                                <button
                                    onClick={() => {
                                        if (!volunteerPwd.trim()) return;
                                        updateGlobalSetting('VolunteerPassword', volunteerPwd.trim());
                                        setVolPwdSaved(true);
                                    }}
                                    disabled={!volunteerPwd.trim()}
                                    className="bg-teal-600 px-6 rounded-2xl text-white font-black hover:bg-teal-500 transition-colors disabled:opacity-40"
                                >
                                    <Save size={18} />
                                </button>
                            </div>
                            {volPwdSaved && <p className="text-xs text-teal-400 font-bold text-center">✅ 志工密碼已儲存</p>}
                        </div>
                    </section>
                </div>
                )}

                {/* ── Tab: 系統 ── */}
                {activeAdminTab === 'system' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <section className="space-y-6">
                        <div className="flex items-center gap-2 text-orange-500 font-black text-sm uppercase tracking-widest"><Users size={16} /> 旅人榜預覽</div>
                        <div className="bg-slate-900 border-2 border-slate-800 rounded-4xl overflow-hidden divide-y divide-slate-800 shadow-xl max-h-[400px] overflow-y-auto">
                            {leaderboard.map((p, i) => (
                                <div key={p.UserID} className="flex items-center gap-4 p-4 hover:bg-white/5 transition-colors">
                                    <span className="text-xs font-black text-slate-600 w-4 text-center">{i + 1}</span>
                                    <div className="flex-1 text-left">
                                        <p className="font-bold text-white text-sm">{p.Name}</p>
                                        <p className="text-[10px] text-slate-500 italic">{p.SquadName || '—'}{p.SquadRole ? ` · ${p.SquadRole}` : ''}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs font-black text-orange-500">{(p.Score ?? 0).toLocaleString()} 分</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="space-y-6">
                        <div className="flex items-center gap-2 text-orange-500 font-black text-sm uppercase tracking-widest"><BarChart3 size={16} /> 管理操作日誌</div>
                        <div className="bg-slate-900 border-2 border-slate-800 rounded-4xl overflow-hidden shadow-xl max-h-[400px] overflow-y-auto divide-y divide-slate-800">
                            {adminLogs.length === 0 ? (
                                <p className="text-sm text-slate-500 text-center py-8">尚無操作記錄</p>
                            ) : adminLogs.map(log => (
                                <div key={log.id} className={`p-4 hover:bg-white/5 transition-colors ${log.result === 'error' ? 'bg-red-950/20' : ''}`}>
                                    <div className="flex justify-between items-start gap-2">
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-xs font-black ${log.result === 'error' ? 'text-red-400' : 'text-slate-200'}`}>
                                                {ACTION_LABELS[log.action] || log.action}
                                            </p>
                                            {log.target_name && <p className="text-[10px] text-slate-500 truncate">對象：{log.target_name}</p>}
                                            {log.details && (
                                                <p className="text-[10px] text-slate-600 truncate">
                                                    {Object.entries(log.details).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                                                </p>
                                            )}
                                        </div>
                                        <div className="text-right shrink-0">
                                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${log.result === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/10 text-emerald-500'}`}>
                                                {log.result === 'error' ? '失敗' : '成功'}
                                            </span>
                                            <p className="text-[10px] text-slate-600 mt-1">{new Date(log.created_at).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
                )}

                {/* ── Tab: 九宮格公版 ── */}
                {activeAdminTab === 'ninegrid' && (
                <div className="space-y-6">
                    <div className="flex items-center gap-2 text-amber-400 font-black text-sm uppercase tracking-widest">
                        <Grid3X3 size={16} /> 九宮格公版模板管理
                    </div>
                    <div className="bg-slate-900 border-2 border-slate-800 p-6 md:p-8 rounded-4xl shadow-xl">
                        <NineGridTemplateEditor adminName="admin" />
                    </div>
                </div>
                )}

                {/* ── Tab: 課程場次 ── */}
                {activeAdminTab === 'course' && (
                <div className="space-y-6 animate-fade-up">
                    <SectionHeading numeral="VI" title="課程場次管理" subtitle="Course Events" accent="teal" icon={<Calendar size={16} />} />

                    {/* 現有場次列表 */}
                    <div className="space-y-3">
                        {courseEvents.map(ev => {
                            const isEditing = editingEventId === ev.id;
                            return (
                                <div key={ev.id} className="bg-[#0d241b] border border-[#F5C842]/15 p-4 rounded-3xl flex flex-col gap-3 brass-ring">
                                    {/* 頂列：ID + 操作按鈕 */}
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="text-[10px] text-emerald-400/40 font-mono">ID: {ev.id}</p>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <button
                                                onClick={() => setCourseEvents(prev => prev.map(e => e.id === ev.id ? { ...e, enabled: !e.enabled } : e))}
                                                className={`flex items-center gap-1 text-xs font-black px-2 py-1 rounded-xl border transition-all ${ev.enabled ? 'bg-emerald-950/40 border-emerald-400/30 text-emerald-300' : 'bg-slate-800/40 border-slate-600/30 text-slate-400'}`}
                                            >
                                                {ev.enabled ? <><ToggleRight size={14} /> 開放</> : <><ToggleLeft size={14} /> 截止</>}
                                            </button>
                                            <button
                                                onClick={() => setEditingEventId(isEditing ? null : ev.id)}
                                                className={`p-1.5 rounded-xl border transition-all ${isEditing ? 'text-teal-300 bg-teal-900/30 border-teal-500/40' : 'text-emerald-400/60 hover:text-emerald-200 border-transparent hover:border-emerald-700/50 hover:bg-emerald-900/30'}`}
                                            >
                                                {isEditing ? <Check size={14} /> : <Pencil size={14} />}
                                            </button>
                                            <button
                                                onClick={() => { if (window.confirm(`確定刪除「${ev.name}」場次？`)) setCourseEvents(prev => prev.filter(e => e.id !== ev.id)); }}
                                                className="p-1.5 rounded-xl text-[#E07A6E]/60 hover:text-[#E07A6E] hover:bg-[#E07A6E]/10 border border-transparent hover:border-[#E07A6E]/30 transition-all"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* 閱讀模式 */}
                                    {!isEditing && (
                                        <div>
                                            <p className="font-black text-emerald-100 text-sm">{ev.name || '（未命名）'}</p>
                                            <p className="text-xs text-emerald-400/60 mt-0.5">{ev.dateDisplay} {ev.time}</p>
                                            <p className="text-xs text-emerald-400/50">{ev.location}</p>
                                        </div>
                                    )}

                                    {/* 編輯模式 */}
                                    {isEditing && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {([
                                                { key: 'name',        label: '場次名稱',       placeholder: '大師覺醒講座' },
                                                { key: 'date',        label: '日期 YYYY-MM-DD', placeholder: '2026-06-23' },
                                                { key: 'dateDisplay', label: '顯示日期文字',    placeholder: '2026年6月23日（二）' },
                                                { key: 'time',        label: '時間',            placeholder: '19:00–21:40' },
                                                { key: 'location',    label: '地點',            placeholder: 'Ticc 國際會議中心' },
                                            ] as { key: keyof CourseEvent; label: string; placeholder: string }[]).map(({ key, label, placeholder }) => (
                                                <div key={key} className="space-y-1">
                                                    <label className="text-[10px] text-emerald-400/50 font-black uppercase tracking-wider">{label}</label>
                                                    <input
                                                        className="w-full bg-[#081812] border border-emerald-900/60 rounded-xl px-3 py-2 text-sm text-emerald-100 placeholder-emerald-900 focus:border-teal-500/50 focus:outline-none transition-colors"
                                                        placeholder={placeholder}
                                                        value={String(ev[key] ?? '')}
                                                        onChange={e => setCourseEvents(prev => prev.map(ce => ce.id === ev.id ? { ...ce, [key]: e.target.value } : ce))}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {courseEvents.length === 0 && (
                            <p className="text-sm text-emerald-400/40 text-center py-6">尚無場次，請在下方新增</p>
                        )}
                    </div>

                    {/* 新增場次表單 */}
                    <div className="bg-[#0d241b] border border-teal-400/20 p-5 rounded-3xl space-y-3">
                        <p className="text-[10px] font-black text-teal-400/60 uppercase tracking-[0.3em]">新增場次</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {([
                                { key: 'id',          label: 'ID（英文唯一識別碼）', placeholder: 'class_d' },
                                { key: 'name',        label: '場次名稱',             placeholder: '大師覺醒講座' },
                                { key: 'date',        label: '日期 YYYY-MM-DD',      placeholder: '2026-06-23' },
                                { key: 'dateDisplay', label: '顯示日期文字',          placeholder: '2026年6月23日（二）' },
                                { key: 'time',        label: '時間',                 placeholder: '19:00–21:40' },
                                { key: 'location',    label: '地點',                 placeholder: 'Ticc 國際會議中心' },
                            ] as { key: keyof CourseEvent; label: string; placeholder: string }[]).map(({ key, label, placeholder }) => (
                                <div key={key} className="space-y-1">
                                    <label className="text-[10px] text-emerald-400/60 font-black uppercase tracking-wider">{label}</label>
                                    <input
                                        className="w-full bg-[#081812] border border-emerald-900/60 rounded-xl px-3 py-2 text-sm text-emerald-100 placeholder-emerald-900 focus:border-teal-500/50 focus:outline-none transition-colors"
                                        placeholder={placeholder}
                                        value={String(newEvent[key] ?? '')}
                                        onChange={e => setNewEvent(prev => ({ ...prev, [key]: e.target.value }))}
                                    />
                                </div>
                            ))}
                        </div>
                        <button
                            onClick={() => {
                                if (!newEvent.id || !newEvent.name) return;
                                if (courseEvents.some(e => e.id === newEvent.id)) {
                                    alert('此 ID 已存在，請使用不同的唯一識別碼');
                                    return;
                                }
                                setCourseEvents(prev => [...prev, { ...newEvent, enabled: true }]);
                                setNewEvent(blankEvent());
                            }}
                            className="flex items-center gap-2 px-4 py-2 bg-teal-700/40 border border-teal-500/40 text-teal-300 rounded-2xl text-xs font-black hover:bg-teal-700/60 transition-all active:scale-95"
                        >
                            <Plus size={14} /> 新增場次
                        </button>
                    </div>

                    {/* 儲存按鈕 */}
                    <div className="flex justify-end">
                        <button
                            onClick={() => {
                                updateGlobalSetting('CourseEvents', JSON.stringify(courseEvents));
                                setCourseEventsSaved(true);
                                setTimeout(() => setCourseEventsSaved(false), 2000);
                            }}
                            className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-black transition-all active:scale-95 ${
                                courseEventsSaved
                                    ? 'bg-teal-600 text-white border border-teal-400'
                                    : 'bg-[#0d241b] border border-teal-400/30 text-teal-300 hover:bg-teal-900/30'
                            }`}
                        >
                            <Save size={15} /> {courseEventsSaved ? '已儲存！' : '儲存場次設定'}
                        </button>
                    </div>
                </div>
                )}
            </div>
        </div>
    );
}
