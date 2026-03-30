import React from 'react';
import { Settings, X, BarChart3, Save, Users, Lock, QrCode, AlertTriangle, Clapperboard } from 'lucide-react';
import { SystemSettings, CharacterStats, TopicHistory, TemporaryQuest, W4Application, AdminLog, Testimony, AngelCallPairingsData } from '@/types';

import { ADMIN_PASSWORD, DAILY_QUEST_CONFIG, WEEKLY_QUEST_CONFIG } from '@/lib/constants';

function LineRichMenuSection() {
    const [status, setStatus] = React.useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
    const [msg, setMsg] = React.useState('');

    const handleSetup = async () => {
        setStatus('loading');
        setMsg('');
        try {
            const res = await fetch(`/api/admin/setup-richmenu?key=${encodeURIComponent(ADMIN_PASSWORD)}`);
            const data = await res.json();
            if (data.success) {
                setStatus('ok');
                setMsg(`選單已設定完成（ID: ${data.richMenuId}）`);
            } else {
                setStatus('error');
                setMsg(data.error ?? '未知錯誤');
            }
        } catch (e: unknown) {
            setStatus('error');
            setMsg(e instanceof Error ? e.message : '連線失敗');
        }
    };

    return (
        <section className="space-y-6">
            <div className="flex items-center gap-2 text-orange-500 font-black text-sm uppercase tracking-widest">
                <Settings size={16} /> LINE 機器人選單設定
            </div>
            <div className="bg-slate-900 border-2 border-slate-800 p-8 rounded-4xl space-y-4 shadow-xl">
                {status === 'ok' ? (
                    <p className="text-xs text-center font-bold text-green-400">{msg}</p>
                ) : (
                    <>
                        <p className="text-xs text-slate-400">點擊後將自動產生選單圖片並透過 LINE API 設為預設選單，需要約 10–20 秒。</p>
                        <button
                            onClick={handleSetup}
                            disabled={status === 'loading'}
                            className="w-full bg-green-700 p-4 rounded-2xl text-white font-black shadow-lg hover:bg-green-600 transition-colors disabled:opacity-50"
                        >
                            {status === 'loading' ? '⏳ 設定中…' : '📱 設定 LINE 通告選單'}
                        </button>
                        {status === 'error' && msg && (
                            <p className="text-xs text-center font-bold text-red-400">{msg}</p>
                        )}
                    </>
                )}
            </div>
        </section>
    );
}

const ACTION_LABELS: Record<string, string> = {
    temp_quest_add: '新增臨時任務',
    temp_quest_toggle: '切換臨時任務狀態',
    temp_quest_delete: '刪除臨時任務',
    roster_import: '匯入名冊',
    auto_assign_squads: '自動分配大劇組',
    auto_draw_quests: '全服自動抽籤',
    angel_call_pairing: '天使通話配對抽籤',
    weekly_snapshot: '每週業力結算',
    w3_compliance: 'w3 週罰款結算',
    fine_compliance: '定課罰款結算',
    w4_final_approve: 'w4/加分終審核准',
    w4_final_reject: 'w4/加分終審駁回',
    topic_title_update: '更新主題名稱',
};

interface AdminDashboardProps {
    adminAuth: boolean;
    onAuth: (e: { preventDefault: () => void; currentTarget: HTMLFormElement }) => void;
    systemSettings: SystemSettings;
    updateGlobalSetting: (key: string, value: string) => void;
    leaderboard: CharacterStats[];
    topicHistory: TopicHistory[];
    temporaryQuests: TemporaryQuest[];
    squadApprovedW4Apps: W4Application[];
    adminLogs: AdminLog[];
    testimonies: Testimony[];
    angelCallPairings: AngelCallPairingsData | null;
    onAddTempQuest: (title: string, sub: string, desc: string, reward: number) => void;
    onToggleTempQuest: (id: string, active: boolean) => void;
    onDeleteTempQuest: (id: string) => void;
    onAutoDrawAllSquads: () => void;
    onRunAngelCallPairing: () => Promise<void>;
    onImportRoster: (csvData: string) => Promise<void>;
    onFinalReviewW4: (appId: string, approve: boolean, notes: string) => Promise<void>;
    onClose: () => void;
}

export function AdminDashboard({
    adminAuth, onAuth, systemSettings, updateGlobalSetting,
    leaderboard, topicHistory, temporaryQuests,
    squadApprovedW4Apps, adminLogs, testimonies,
    angelCallPairings,
    onAddTempQuest, onToggleTempQuest, onDeleteTempQuest,
    onAutoDrawAllSquads,
    onRunAngelCallPairing,
    onImportRoster, onFinalReviewW4, onClose
}: AdminDashboardProps) {
    const [csvInput, setCsvInput] = React.useState("");
    const [isImporting, setIsImporting] = React.useState(false);
    const [w4Notes, setW4Notes] = React.useState<Record<string, string>>({});
    const [reviewingW4Id, setReviewingW4Id] = React.useState<string | null>(null);
    const [volunteerPwd, setVolunteerPwd] = React.useState('');
    const [volPwdSaved, setVolPwdSaved] = React.useState(false);
    const [isRunningPairing, setIsRunningPairing] = React.useState(false);

    // Fine Settings State
    const [fineSettingsForm, setFineSettingsForm] = React.useState(
        systemSettings.FineSettings || {
            enabled: false,
            amount: 200,
            items: ['w3'],
            periodStart: '',
            periodEnd: ''
        }
    );
    const [fineSettingsSaved, setFineSettingsSaved] = React.useState(false);

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
        await onFinalReviewW4(appId, approve, w4Notes[appId] || '');
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

    return (
        <div className="min-h-screen bg-slate-950 text-slate-200 p-8 animate-in fade-in">
            <div className="max-w-6xl mx-auto space-y-12 pb-20">
                <header className="flex justify-between items-center text-center mx-auto">
                    <div className="flex items-center gap-4">
                        <div className="p-4 bg-gradient-to-br from-orange-500 to-red-600 rounded-3xl text-white shadow-2xl shadow-orange-950/20 ring-4 ring-orange-500/10"><Clapperboard size={32} /></div>
                        <div className="text-left">
                            <h1 className="text-4xl font-black text-white italic tracking-tighter">方圓影展・片場監製中心</h1>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.3em] mt-1 ml-1 opacity-50">Studio Executive Dashboard</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-4 bg-slate-900/50 backdrop-blur-md rounded-2xl text-slate-500 border border-white/5 hover:text-red-400 hover:bg-slate-800 transition-all hover:rotate-90"><X size={20} /></button>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <section className="space-y-6">
                        <div className="flex items-center gap-2 text-orange-500 font-black text-sm uppercase tracking-widest"><BarChart3 size={16} /> 片場調度設定</div>
                        <div className="bg-slate-900 border-2 border-slate-800 p-8 rounded-4xl space-y-8 shadow-xl">
                            <div className="space-y-4">
                                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">當期主打電影名稱</label>
                                <div className="flex gap-2 text-center mx-auto">
                                    <input defaultValue={systemSettings.TopicQuestTitle} onBlur={(e) => updateGlobalSetting('TopicQuestTitle', e.target.value)} className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:border-orange-500 text-center" />
                                    <button className="bg-orange-600 p-4 rounded-2xl text-white font-black"><Save size={20} /></button>
                                </div>
                                {topicHistory.length > 0 && (
                                    <div className="mt-4 bg-slate-950/50 rounded-2xl border border-white/5 overflow-hidden">
                                        <div className="p-3 bg-slate-900 border-b border-white/5 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">歷史主題紀錄</div>
                                        <div className="max-h-32 overflow-y-auto divide-y divide-white/5">
                                            {topicHistory.map(h => (
                                                <div key={h.id} className="p-3 text-sm flex justify-between items-center text-slate-300">
                                                    <span>{h.TopicTitle}</span>
                                                    <span className="text-[10px] text-slate-600">{new Date(h.created_at).toLocaleDateString('zh-TW')}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                    {/* 片場違規與扣款設定 */}
                    <section className="space-y-6">
                        <div className="flex items-center gap-2 text-red-500 font-black text-sm uppercase tracking-widest"><AlertTriangle size={16} /> 片場違規與扣款設定</div>
                        <div className="bg-slate-900 border-2 border-red-500/20 p-8 rounded-4xl space-y-6 shadow-xl relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 blur-3xl -mr-16 -mt-16 group-hover:bg-red-500/10 transition-colors" />
                            <div className="flex items-center justify-between relative z-10">
                                <div>
                                    <p className="font-black text-white text-base">啟用全自動違規結算</p>
                                    <p className="text-[10px] text-slate-500 mt-1">劇組長執行結算時，系統將自動比對拍攝進度並產生違規票房扣款。</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" className="sr-only peer" checked={fineSettingsForm.enabled} onChange={e => {
                                        setFineSettingsForm(prev => ({ ...prev, enabled: e.target.checked }));
                                        setFineSettingsSaved(false);
                                    }} />
                                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                                </label>
                            </div>

                            <div className="grid grid-cols-2 gap-4 relative z-10">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">違規處罰金額 (NT$)</label>
                                    <input type="number" min={0} value={fineSettingsForm.amount} onChange={e => { setFineSettingsForm(prev => ({ ...prev, amount: Number(e.target.value) })); setFineSettingsSaved(false); }} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:border-red-500 placeholder:text-slate-700 shadow-inner" placeholder="0" />
                                </div>
                            </div>
                            
                            <div className="space-y-2 relative z-10">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">必修監測項目 (不符即扣款)</label>
                                <div className="max-h-56 overflow-y-auto bg-slate-950 border border-slate-800 rounded-3xl p-5 shadow-inner grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-3 custom-scrollbar">
                                    {[...DAILY_QUEST_CONFIG, ...WEEKLY_QUEST_CONFIG, { id: 't3', title: '沉澱週分享', reward: 0 } as any].map(q => (
                                        <label key={q.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-900 p-2 rounded-xl transition-colors">
                                            <input
                                                type="checkbox"
                                                className="accent-red-500 w-4 h-4"
                                                checked={fineSettingsForm.items.includes(q.id)}
                                                onChange={e => {
                                                    const newItems = e.target.checked
                                                        ? [...fineSettingsForm.items, q.id]
                                                        : fineSettingsForm.items.filter(id => id !== q.id);
                                                    setFineSettingsForm(prev => ({ ...prev, items: newItems }));
                                                    setFineSettingsSaved(false);
                                                }}
                                            />
                                            <span className="text-xs font-bold text-slate-300 flex-1 truncate" title={q.title}>
                                                <span className="text-slate-500 mr-1">[{q.id}]</span>
                                                {q.title}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase">結算開始期間</label>
                                    <input 
                                        type="date" 
                                        value={fineSettingsForm.periodStart} 
                                        onChange={e => { setFineSettingsForm(prev => ({ ...prev, periodStart: e.target.value })); setFineSettingsSaved(false); }} 
                                        className="w-full bg-slate-800 border-2 border-slate-700 rounded-2xl p-3 text-white font-bold outline-none focus:border-red-500 hover:border-slate-500 transition-all cursor-pointer invert-[0.1] contrast-[1.2]" 
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-500 uppercase">結算結束期間</label>
                                    <input 
                                        type="date" 
                                        value={fineSettingsForm.periodEnd} 
                                        onChange={e => { setFineSettingsForm(prev => ({ ...prev, periodEnd: e.target.value })); setFineSettingsSaved(false); }} 
                                        className="w-full bg-slate-800 border-2 border-slate-700 rounded-2xl p-3 text-white font-bold outline-none focus:border-red-500 hover:border-slate-500 transition-all cursor-pointer invert-[0.1] contrast-[1.2]" 
                                    />
                                </div>
                            </div>

                            <button
                                onClick={() => {
                                    updateGlobalSetting('FineSettings', JSON.stringify(fineSettingsForm));
                                    setFineSettingsSaved(true);
                                }}
                                className="w-full bg-red-600 p-3 rounded-2xl text-white font-black hover:bg-red-500 active:scale-95 transition-all mt-4"
                            >
                                <Save size={18} className="inline mr-2" />
                                儲存罰款設定
                            </button>
                            {fineSettingsSaved && <p className="text-xs text-red-400 font-bold text-center mt-2">✅ 罰款設定已更新</p>}
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

                    {/* ── 天使通話配對抽籤 ── */}
                    <section className="space-y-6">
                        <div className="flex items-center gap-2 text-sky-400 font-black text-sm uppercase tracking-widest">👼 天使通話配對抽籤</div>
                        <div className="bg-slate-900 border-2 border-sky-500/20 p-8 rounded-4xl space-y-5 shadow-xl">
                            <p className="text-xs text-slate-400">一鍵為全體學員依小隊隨機配對本週天使通話夥伴，奇數人組成三人小組。</p>
                            <button
                                disabled={isRunningPairing}
                                onClick={async () => {
                                    setIsRunningPairing(true);
                                    await onRunAngelCallPairing();
                                    setIsRunningPairing(false);
                                }}
                                className="w-full bg-sky-700 p-4 rounded-2xl text-white font-black shadow-lg hover:bg-sky-600 transition-colors disabled:opacity-50"
                            >
                                {isRunningPairing ? '⏳ 抽籤中…' : '🎲 執行全服天使通話配對'}
                            </button>

                            {angelCallPairings && (
                                <div className="space-y-3">
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                        本週配對結果（週一 {angelCallPairings.weekOf}）
                                    </p>
                                    <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                                        {(() => {
                                            // Group pairings by team
                                            const byTeam = new Map<string, typeof angelCallPairings.pairings>();
                                            for (const p of angelCallPairings.pairings) {
                                                if (!byTeam.has(p.teamName)) byTeam.set(p.teamName, []);
                                                byTeam.get(p.teamName)!.push(p);
                                            }
                                            return [...byTeam.entries()].map(([teamName, pairs]) => (
                                                <div key={teamName} className="bg-slate-800 rounded-2xl p-4 space-y-2">
                                                    <p className="text-xs font-black text-sky-400">{teamName}</p>
                                                    {pairs.map((pair, i) => (
                                                        <div key={i} className="flex items-center gap-2 text-xs text-slate-300">
                                                            <span className="text-sky-600">👼</span>
                                                            {pair.group.map((m, j) => (
                                                                <span key={m.id}>
                                                                    <span className="font-bold">{m.name}</span>
                                                                    {j < pair.group.length - 1 && <span className="text-slate-600 mx-1">↔</span>}
                                                                </span>
                                                            ))}
                                                            {pair.group.length === 3 && <span className="text-[9px] text-amber-400 font-black ml-1">三人組</span>}
                                                        </div>
                                                    ))}
                                                </div>
                                            ));
                                        })()}
                                    </div>
                                </div>
                            )}
                        </div>
                    </section>

                    <section className="space-y-6">
                        <div className="flex items-center gap-2 text-orange-500 font-black text-sm uppercase tracking-widest"><Users size={16} /> 戰隊名冊管理</div>
                        <div className="bg-slate-900 border-2 border-slate-800 p-8 rounded-4xl space-y-6 shadow-xl">
                            {/* 登入模式開關 */}
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

                {/* ❤️ 待終審申請（傳愛 + b3-b7 加分）*/}
                <section className="space-y-6">
                    <div className="flex items-center gap-2 text-pink-500 font-black text-sm uppercase tracking-widest">❤️ 待終審申請（傳愛 & 加分任務）</div>
                    <div className="bg-slate-900 border-2 border-pink-500/20 p-8 rounded-4xl shadow-xl space-y-4">
                        {squadApprovedW4Apps.length === 0 ? (
                            <p className="text-sm text-slate-500 text-center py-4">目前無待終審申請</p>
                        ) : (
                            squadApprovedW4Apps.map(app => {
                                const questBase = app.quest_id.split('|')[0];
                                const isBonusApp = ['b3', 'b4', 'b5', 'b6', 'b7'].includes(questBase);
                                const BONUS_LABELS: Record<string, string> = {
                                    b3: '續報高階/五運班 +5000',
                                    b4: '成為小天使 +5000',
                                    b5: '報名聯誼會（1年）+3000',
                                    b6: '報名聯誼會（2年）+5000',
                                    b7: '參加實體課程 +1000',
                                };
                                return (
                                <div key={app.id} className="bg-slate-800 rounded-2xl p-5 space-y-3">
                                    <div className="flex justify-between items-start flex-wrap gap-2">
                                        <div>
                                            <p className="font-black text-white">{app.user_name}</p>
                                            <p className="text-xs text-slate-400">
                                                {app.squad_name} · {isBonusApp ? BONUS_LABELS[questBase] : '傳愛'}
                                                {' · '}{app.interview_target} · {app.interview_date}
                                            </p>
                                            {app.squad_review_notes && <p className="text-xs text-indigo-400 mt-1">劇組長備註：{app.squad_review_notes}</p>}
                                        </div>
                                        <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${isBonusApp ? 'text-amber-400 bg-amber-400/10' : 'text-blue-400 bg-blue-400/10'}`}>
                                            {isBonusApp ? '加分申請' : '傳愛'} 待終審
                                        </span>
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

                {/* 志工掃碼授權 */}
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

                {/* LINE 選單設定 */}
                <LineRichMenuSection />

                {/* 親證故事列表 */}
                <section className="space-y-6">
                    <div className="flex items-center gap-2 text-orange-500 font-black text-sm uppercase tracking-widest"><BarChart3 size={16} /> 親證故事存檔（{testimonies.length} 筆）</div>
                    <div className="bg-slate-900 border-2 border-slate-800 rounded-4xl overflow-hidden shadow-xl max-h-[500px] overflow-y-auto divide-y divide-slate-800">
                        {testimonies.length === 0 ? (
                            <p className="text-sm text-slate-500 text-center py-8">尚無親證故事記錄</p>
                        ) : testimonies.map(t => (
                            <div key={t.id} className="p-4 hover:bg-white/5 transition-colors space-y-1">
                                <div className="flex justify-between items-start gap-2">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-black text-white">
                                            {t.parsed_name ?? t.display_name ?? '未知'}
                                            {t.parsed_category && <span className="ml-2 text-[10px] font-normal bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-lg">{t.parsed_category}</span>}
                                        </p>
                                        <p className="text-xs text-slate-400 mt-1 leading-relaxed line-clamp-3">{t.content}</p>
                                    </div>
                                    <div className="text-right shrink-0 text-[10px] text-slate-500 space-y-1">
                                        <p>{t.parsed_date ?? '日期未填'}</p>
                                        <p>{new Date(t.created_at).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

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
                                        <p className="text-xs font-black text-orange-500">{p.Exp} 票房</p>
                                        <p className="text-[10px] text-red-500">罰金 NT${p.TotalFines}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* 操作日誌 */}
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
            </div>
        </div>
    );
}
