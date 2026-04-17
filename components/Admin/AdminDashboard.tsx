import React from 'react';
import { Settings, X, BarChart3, Save, Users, Lock, QrCode, Clapperboard, Sliders, UserCog, Grid3X3 } from 'lucide-react';
import { SystemSettings, CharacterStats, TemporaryQuest, BonusApplication, AdminLog } from '@/types';

import { DAILY_BASIC_CONFIG, DAILY_WEIGHTED_CONFIG, DAWN_QUEST, DIET_QUEST_CONFIG, WEEKLY_QUEST_CONFIG } from '@/lib/constants';
import { listAllMembers, transferMember, setMemberRole } from '@/app/actions/admin';
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

function MemberManagementSection() {
    const [members, setMembers] = React.useState<MemberRow[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [search, setSearch] = React.useState('');
    const [editingId, setEditingId] = React.useState<string | null>(null);
    const [editSquad, setEditSquad] = React.useState('');
    const [editTeam, setEditTeam] = React.useState('');
    const [editRole, setEditRole] = React.useState<'captain' | 'commandant' | 'none'>('none');
    const [saving, setSaving] = React.useState(false);
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
        <section className="space-y-6 md:col-span-2">
            <div className="flex items-center gap-2 text-cyan-400 font-black text-sm uppercase tracking-widest"><UserCog size={16} /> 成員管理</div>
            <div className="bg-slate-900 border-2 border-slate-800 p-6 rounded-4xl space-y-4 shadow-xl">
                <div className="flex gap-2">
                    <input
                        placeholder="搜尋姓名 / 信箱 / 大隊 / 小隊"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs outline-none focus:border-cyan-500"
                    />
                    <button onClick={load} disabled={loading} className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-700 disabled:opacity-50">
                        {loading ? '…' : '重整'}
                    </button>
                </div>
                {msg && <p className="text-xs text-center font-bold text-emerald-400">{msg}</p>}
                <div className="max-h-[400px] overflow-y-auto space-y-1">
                    <datalist id="dl-squads">{squads.map(s => <option key={s} value={s!} />)}</datalist>
                    <datalist id="dl-teams">{teams.map(t => <option key={t} value={t!} />)}</datalist>
                    {filtered.length === 0 && <p className="text-xs text-slate-500 text-center py-4">無符合成員</p>}
                    {filtered.map(m => {
                        const isEditing = editingId === m.UserID;
                        return (
                            <div key={m.UserID} className={`rounded-xl p-3 text-xs ${isEditing ? 'bg-cyan-950/40 border border-cyan-500/30' : 'bg-slate-950/50 border border-transparent hover:border-slate-700'}`}>
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-white w-16 truncate">{m.Name}</span>
                                    <span className="text-slate-500 flex-1 truncate">{m.SquadName || '-'} / {m.TeamName || '-'}</span>
                                    {m.IsCaptain && <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded-full">隊長</span>}
                                    {m.IsCommandant && <span className="text-[10px] text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded-full">大隊長</span>}
                                    <span className="text-slate-600 text-[10px]">{(m.Score ?? 0).toLocaleString()} 分</span>
                                    {!isEditing && (
                                        <button onClick={() => startEdit(m)} className="text-cyan-400 hover:text-cyan-300 text-[10px] font-bold shrink-0">編輯</button>
                                    )}
                                </div>
                                {isEditing && (
                                    <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
                                        <div>
                                            <label className="text-[10px] text-slate-500 block mb-0.5">大隊</label>
                                            <input list="dl-squads" value={editSquad} onChange={e => setEditSquad(e.target.value)}
                                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-xs outline-none focus:border-cyan-500" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-slate-500 block mb-0.5">小隊</label>
                                            <input list="dl-teams" value={editTeam} onChange={e => setEditTeam(e.target.value)}
                                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-xs outline-none focus:border-cyan-500" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-slate-500 block mb-0.5">角色</label>
                                            <select value={editRole} onChange={e => setEditRole(e.target.value as any)}
                                                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white text-xs outline-none focus:border-cyan-500">
                                                <option value="none">一般學員</option>
                                                <option value="captain">小隊長</option>
                                                <option value="commandant">大隊長</option>
                                            </select>
                                        </div>
                                        <div className="flex gap-1">
                                            <button disabled={saving} onClick={() => handleSave(m)}
                                                className="flex-1 py-1.5 bg-cyan-600 text-white rounded-lg font-bold text-[10px] hover:bg-cyan-500 disabled:opacity-50">
                                                {saving ? '…' : '儲存'}
                                            </button>
                                            <button onClick={() => setEditingId(null)}
                                                className="py-1.5 px-2 bg-slate-700 text-slate-300 rounded-lg text-[10px] hover:bg-slate-600">取消</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
                <p className="text-[10px] text-slate-600 text-center">共 {members.length} 人{search && `，篩選結果 ${filtered.length} 人`}</p>
            </div>
        </section>
    );
}


const ACTION_LABELS: Record<string, string> = {
    temp_quest_add: '新增臨時任務',
    temp_quest_toggle: '切換臨時任務狀態',
    temp_quest_delete: '刪除臨時任務',
    roster_import: '匯入名冊',
    auto_assign_squads: '自動分配大隊',
    auto_draw_quests: '全服自動抽籤',
    weekly_snapshot: '每週積分結算',
    bonus_final_approve: '一次性任務終審核准',
    bonus_final_reject: '一次性任務終審駁回',
    drama_training_squad_approve: '戲劇進修初審核准',
    topic_title_update: '更新主題名稱',
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
    onAutoDrawAllSquads: () => void;
    onImportRoster: (csvData: string) => Promise<void>;
    onFinalReviewBonus: (appId: string, approve: boolean, notes: string) => Promise<void>;
    onClose: () => void;
}

export function AdminDashboard({
    adminAuth, onAuth, systemSettings, updateGlobalSetting,
    leaderboard, temporaryQuests,
    pendingFinalReviewApps, adminLogs,
    onAddTempQuest, onToggleTempQuest, onDeleteTempQuest,
    onAutoDrawAllSquads,
    onImportRoster, onFinalReviewBonus, onClose
}: AdminDashboardProps) {
    const [csvInput, setCsvInput] = React.useState("");
    const [isImporting, setIsImporting] = React.useState(false);
    const [w4Notes, setW4Notes] = React.useState<Record<string, string>>({});
    const [reviewingW4Id, setReviewingW4Id] = React.useState<string | null>(null);
    const [volunteerPwd, setVolunteerPwd] = React.useState('');
    const [volPwdSaved, setVolPwdSaved] = React.useState(false);
    const [activeAdminTab, setActiveAdminTab] = React.useState<'members' | 'quests' | 'review' | 'system' | 'ninegrid'>('members');

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
            <div className="min-h-screen bg-slate-950 text-slate-200 p-8 flex flex-col justify-center items-center animate-in fade-in">
                <div className="max-w-sm w-full space-y-8 text-center mx-auto">
                    <div className="w-20 h-20 bg-slate-800 rounded-3xl mx-auto flex items-center justify-center border border-slate-700 text-orange-500"><Lock size={40} /></div>
                    <h1 className="text-3xl font-black text-white text-center mx-auto">大會中樞驗證</h1>
                    <form onSubmit={onAuth} className="space-y-6">
                        <input name="password" type="password" required className="w-full bg-slate-900 border-2 border-slate-800 rounded-2xl p-5 text-white text-center text-xl outline-none focus:border-orange-500 font-bold" placeholder="密令" autoFocus />
                        <div className="flex gap-4">
                            <button type="button" onClick={onClose} className="flex-1 py-4 bg-slate-800 text-slate-400 font-bold rounded-2xl">取消</button>
                            <button className="flex-2 py-4 bg-orange-600 text-white font-black rounded-2xl shadow-lg active:scale-95 transition-all">驗證登入</button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    const TAB_CONFIG = [
        { id: 'members' as const, label: '成員', icon: <Users size={14} /> },
        { id: 'quests' as const, label: '任務', icon: <Sliders size={14} /> },
        { id: 'review' as const, label: '審核', icon: <Settings size={14} /> },
        { id: 'ninegrid' as const, label: '九宮格', icon: <Grid3X3 size={14} /> },
        { id: 'system' as const, label: '系統', icon: <BarChart3 size={14} /> },
    ];

    return (
        <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8 animate-in fade-in">
            <div className="max-w-6xl mx-auto space-y-8 pb-20">
                <header className="flex justify-between items-center">
                    <div className="flex items-center gap-3 md:gap-4">
                        <div className="p-3 md:p-4 bg-gradient-to-br from-orange-500 to-red-600 rounded-3xl text-white shadow-2xl shadow-orange-950/20 ring-4 ring-orange-500/10"><Clapperboard size={28} /></div>
                        <div className="text-left">
                            <h1 className="text-2xl md:text-4xl font-black text-white italic tracking-tighter">方圓影展・片場監製中心</h1>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.3em] mt-1 ml-1 opacity-50 hidden md:block">Studio Executive Dashboard</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-4 bg-slate-900/50 backdrop-blur-md rounded-2xl text-slate-500 border border-white/5 hover:text-red-400 hover:bg-slate-800 transition-all hover:rotate-90"><X size={20} /></button>
                </header>

                {/* Tab navigation */}
                <div className="flex gap-2 bg-slate-900 p-1.5 rounded-2xl border border-slate-800">
                    {TAB_CONFIG.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveAdminTab(tab.id)}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-black transition-all ${
                                activeAdminTab === tab.id
                                    ? 'bg-orange-600 text-white shadow-lg'
                                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                            }`}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* ── Tab: 成員 ── */}
                {activeAdminTab === 'members' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <section className="space-y-6">
                        <div className="flex items-center gap-2 text-orange-500 font-black text-sm uppercase tracking-widest"><Users size={16} /> 戰隊名冊管理</div>
                        <div className="bg-slate-900 border-2 border-slate-800 p-8 rounded-4xl space-y-6 shadow-xl">
                            <div className="space-y-3">
                                <p className="text-xs font-black text-slate-500 uppercase tracking-widest">登入模式</p>
                                <div className={`flex items-center justify-between p-4 rounded-2xl border-2 ${systemSettings.RegistrationMode === 'roster' ? 'border-indigo-500/50 bg-indigo-950/30' : 'border-emerald-500/50 bg-emerald-950/30'}`}>
                                    <div>
                                        <p className={`font-black text-sm ${systemSettings.RegistrationMode === 'roster' ? 'text-indigo-300' : 'text-emerald-300'}`}>
                                            {systemSettings.RegistrationMode === 'roster' ? '🔐 名單驗證模式' : '🌐 自由註冊模式'}
                                        </p>
                                        <p className="text-[10px] text-slate-500 mt-0.5">
                                            {systemSettings.RegistrationMode === 'roster' ? '僅限名冊內信箱登入，新生需由管理員預先匯入' : '任何人可自行填表註冊'}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => updateGlobalSetting('RegistrationMode', systemSettings.RegistrationMode === 'roster' ? 'open' : 'roster')}
                                        className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${systemSettings.RegistrationMode === 'roster' ? 'bg-emerald-600 text-white' : 'bg-indigo-600 text-white'}`}
                                    >
                                        切換為{systemSettings.RegistrationMode === 'roster' ? '自由註冊' : '名單驗證'}
                                    </button>
                                </div>
                            </div>
                            <div className="border-t border-white/5 pt-4" />
                            <form onSubmit={handleImportSubmit} className="space-y-4 text-center">
                                <p className="text-xs text-slate-400 text-left">
                                    請貼上 CSV 格式資料（含表頭行將自動略過）<br />
                                    格式：<span className="text-orange-400 font-mono">email, 姓名, 生日(YYYY-MM-DD), 發行商, 劇組, 是否劇組長, 是否發行商長</span>
                                </p>
                                <textarea
                                    value={csvInput}
                                    onChange={(e) => setCsvInput(e.target.value)}
                                    placeholder={`ex:\nuser1@gmail.com,王小明,1960-03-15,第一發行商,第一劇組,true,false\nuser2@gmail.com,李大華,1985-07-22,第一發行商,第一劇組,false,false`}
                                    className="w-full h-36 bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-mono text-xs outline-none focus:border-orange-500 resize-none"
                                />
                                <button disabled={isImporting || !csvInput} className="w-full bg-emerald-600 p-4 rounded-2xl text-white font-black shadow-lg hover:bg-emerald-500 active:scale-95 transition-all disabled:opacity-50">
                                    {isImporting ? '匯入中...' : '📥 批量匯入名冊'}
                                </button>
                            </form>
                        </div>
                    </section>
                    <MemberManagementSection />
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
                        <div className="flex items-center gap-2 text-orange-500 font-black text-sm uppercase tracking-widest"><Settings size={16} /> 每週任務管理</div>
                        <div className="bg-slate-900 border-2 border-slate-800 p-8 rounded-4xl space-y-6 shadow-xl text-center">
                            <button onClick={onAutoDrawAllSquads} className="w-full bg-indigo-600 p-4 rounded-2xl text-white font-black shadow-lg hover:bg-indigo-500 transition-colors">
                                🎲 全服自動抽籤（為未抽劇組代選本週通告）
                            </button>
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
                        <div className="flex items-center gap-2 text-orange-500 font-black text-sm uppercase tracking-widest"><Users size={16} /> 修行者票房榜預覽</div>
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
            </div>
        </div>
    );
}
