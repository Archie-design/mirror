import React from 'react';
import { Settings, X, BarChart3, Save, Users, Lock } from 'lucide-react';
import { SystemSettings, CharacterStats, TopicHistory } from '@/types';
import { DAILY_QUEST_CONFIG } from '@/lib/constants';

interface AdminDashboardProps {
    adminAuth: boolean;
    onAuth: (e: React.FormEvent<HTMLFormElement>) => void;
    systemSettings: SystemSettings;
    updateGlobalSetting: (key: string, value: string) => void;
    leaderboard: CharacterStats[];
    topicHistory: TopicHistory[];
    onClose: () => void;
}

export function AdminDashboard({ adminAuth, onAuth, systemSettings, updateGlobalSetting, leaderboard, topicHistory, onClose }: AdminDashboardProps) {
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
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-orange-600 rounded-2xl text-white shadow-lg"><Settings size={24} /></div>
                        <h1 className="text-3xl font-black text-white text-center mx-auto">大會管理後台</h1>
                    </div>
                    <button onClick={onClose} className="p-3 bg-slate-900 rounded-2xl text-slate-500 border border-slate-800 hover:text-red-400"><X size={20} /></button>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <section className="space-y-6">
                        <div className="flex items-center gap-2 text-orange-500 font-black text-sm uppercase tracking-widest"><BarChart3 size={16} /> 全域修行設定</div>
                        <div className="bg-slate-900 border-2 border-slate-800 p-8 rounded-4xl space-y-8 shadow-xl">
                            <div className="space-y-4">
                                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">本週指定必修項目</label>
                                <select value={systemSettings.MandatoryQuestId} onChange={(e) => updateGlobalSetting('MandatoryQuestId', e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:border-orange-500 cursor-pointer text-center">
                                    {DAILY_QUEST_CONFIG.map(q => <option key={q.id} value={q.id}>{q.title}</option>)}
                                </select>
                            </div>
                            <div className="space-y-4">
                                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">雙週加分主題名稱</label>
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

                    <section className="space-y-6">
                        <div className="flex items-center gap-2 text-orange-500 font-black text-sm uppercase tracking-widest"><Users size={16} /> 修行者修為榜預覽</div>
                        <div className="bg-slate-900 border-2 border-slate-800 rounded-4xl overflow-hidden divide-y divide-slate-800 shadow-xl max-h-[400px] overflow-y-auto">
                            {leaderboard.map((p, i) => (
                                <div key={p.UserID} className="flex items-center gap-4 p-4 hover:bg-white/5 transition-colors">
                                    <span className="text-xs font-black text-slate-600 w-4 text-center">{i + 1}</span>
                                    <div className="flex-1 text-left">
                                        <p className="font-bold text-white text-sm">{p.Name}</p>
                                        <p className="text-[10px] text-slate-500 italic">{p.Role}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs font-black text-orange-500">{p.Exp} 修為</p>
                                        <p className="text-[10px] text-red-500">罰金 NT${p.TotalFines}</p>
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
