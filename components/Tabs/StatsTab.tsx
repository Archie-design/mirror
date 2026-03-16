import React, { useState } from 'react';
import { Skull, Wand2, Sparkles, Shield, Heart, Brain, Zap, Trophy, Coins, Cake } from 'lucide-react';
import { CharacterStats } from '@/types';

interface StatCardProps {
    label: string;
    value: number;
    icon: React.ReactNode;
    color: string;
}

export const StatCard = ({ label, value, icon, color }: StatCardProps) => (
    <div className="bg-slate-900 border-2 border-slate-800 p-5 rounded-4xl shadow-xl text-left">
        <div className="flex items-center gap-2 mb-2">
            {icon}
            <span className="text-[10px] font-black text-slate-500 tracking-widest uppercase ml-1">{label}</span>
        </div>
        <div className="flex items-center gap-4">
            <span className="text-4xl font-black text-white">{value || 0}</span>
            <div className="h-2.5 flex-1 bg-slate-800 rounded-full overflow-hidden shadow-inner">
                <div
                    className={`h-full ${color} opacity-70 transition-all duration-1000`}
                    style={{ width: `${Math.min(100, ((value || 0) / 50) * 100)}%` }}
                ></div>
            </div>
        </div>
    </div>
);

interface StatsTabProps {
    userData: CharacterStats;
    roleTrait: { isCursed: boolean; curseName: string; curseEffect: string; talent: string } | null;
    onSaveBirthday: (birthday: string) => Promise<{ success: boolean; error?: string }>;
}

export function StatsTab({ userData, roleTrait, onSaveBirthday }: StatsTabProps) {
    const [editingBirthday, setEditingBirthday] = useState(false);
    const [birthdayInput, setBirthdayInput] = useState(userData.Birthday || '');
    const [saving, setSaving] = useState(false);
    const [birthdayMsg, setBirthdayMsg] = useState('');

    if (!roleTrait) return null;

    const handleSaveBirthday = async () => {
        setSaving(true);
        setBirthdayMsg('');
        const res = await onSaveBirthday(birthdayInput);
        setSaving(false);
        if (res.success) {
            setEditingBirthday(false);
            setBirthdayMsg('');
        } else {
            setBirthdayMsg(res.error || '儲存失敗');
        }
    };

    const displayAge = userData.Birthday
        ? Math.floor((Date.now() - new Date(userData.Birthday).getTime()) / (365.25 * 24 * 3600 * 1000))
        : null;

    return (
        <div className="space-y-8 animate-in zoom-in-95 duration-500 mx-auto text-center">
            <div className={`p-8 rounded-4xl border-2 shadow-2xl relative overflow-hidden transition-all ${roleTrait.isCursed ? 'bg-red-950/30 border-red-500/50' : 'bg-emerald-950/30 border-emerald-500/50'}`}>
                <div className="flex items-center justify-between mb-4 text-center">
                    <div className="flex items-center gap-2">
                        {roleTrait.isCursed ? <Skull className="text-red-500" size={20} /> : <Wand2 className="text-emerald-400" size={20} />}
                        <span className={`text-sm font-black uppercase tracking-widest ${roleTrait.isCursed ? 'text-red-400' : 'text-emerald-400'}`}>
                            {roleTrait.isCursed ? roleTrait.curseName : '天命覺醒：' + userData.Role}
                        </span>
                    </div>
                </div>
                <p className="text-xs text-white leading-relaxed text-left">{roleTrait.isCursed ? roleTrait.curseEffect : roleTrait.talent}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="bg-gradient-to-br from-yellow-900/40 to-slate-900 border-2 border-yellow-500/20 p-6 rounded-4xl shadow-2xl text-center flex flex-col items-center justify-center">
                    <Coins className="text-yellow-500 mb-2" size={24} />
                    <span className="text-4xl font-black text-yellow-500 mb-1">{userData.Coins || 0}</span>
                    <p className="text-[10px] text-yellow-500/70 font-black uppercase tracking-[0.2em]">天庭金幣餘額</p>
                </div>

                <div className="bg-gradient-to-br from-red-950/40 to-slate-900 border-2 border-white/5 p-6 rounded-4xl shadow-2xl text-center flex flex-col items-center justify-center">
                    <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center mb-2 mx-auto"><Skull className="text-red-500" size={16} /></div>
                    <span className="text-4xl font-black text-white mb-1">{userData.TotalFines}</span>
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">累世罰金餘額</p>
                </div>
            </div>

            {/* Birthday card */}
            <div className="bg-slate-900 border-2 border-slate-800 p-5 rounded-4xl shadow-xl text-left">
                <div className="flex items-center gap-2 mb-3">
                    <Cake size={16} className="text-pink-400" />
                    <span className="text-[10px] font-black text-slate-500 tracking-widest uppercase ml-1">生日（金剛杖資格驗證）</span>
                </div>
                {!editingBirthday ? (
                    <div className="flex items-center justify-between">
                        <span className="text-white font-bold">
                            {userData.Birthday
                                ? `${userData.Birthday}（${displayAge} 歲）`
                                : <span className="text-slate-500">尚未設定</span>}
                        </span>
                        <button onClick={() => { setEditingBirthday(true); setBirthdayInput(userData.Birthday || ''); }}
                            className="text-xs text-orange-400 font-bold border border-orange-400/30 px-3 py-1 rounded-xl hover:bg-orange-400/10 transition-all">
                            {userData.Birthday ? '修改' : '設定'}
                        </button>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <input
                            type="date"
                            value={birthdayInput}
                            onChange={e => setBirthdayInput(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-600 text-white rounded-xl px-3 py-2 text-sm"
                        />
                        {birthdayMsg && <p className="text-xs text-red-400">{birthdayMsg}</p>}
                        <div className="flex gap-2">
                            <button onClick={handleSaveBirthday} disabled={saving || !birthdayInput}
                                className="flex-1 bg-orange-500 text-white font-bold text-sm py-2 rounded-xl disabled:opacity-40 transition-all">
                                {saving ? '儲存中…' : '儲存'}
                            </button>
                            <button onClick={() => setEditingBirthday(false)}
                                className="px-4 text-sm text-slate-400 border border-slate-700 rounded-xl hover:bg-slate-800 transition-all">
                                取消
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 gap-5 text-center mx-auto">
                <StatCard label="神識 (Spirit)" value={userData.Spirit} icon={<Sparkles size={16} className="text-purple-400" />} color="bg-purple-500" />
                <StatCard label="根骨 (Physique)" value={userData.Physique} icon={<Shield size={16} className="text-red-400" />} color="bg-red-500" />
                <StatCard label="魅力 (Charisma)" value={userData.Charisma} icon={<Heart size={16} className="text-pink-400" />} color="bg-pink-500" />
                <StatCard label="悟性 (Savvy)" value={userData.Savvy} icon={<Brain size={16} className="text-blue-400" />} color="bg-blue-500" />
                <StatCard label="機緣 (Luck)" value={userData.Luck} icon={<Zap size={16} className="text-emerald-400" />} color="bg-emerald-500" />
                <StatCard label="潛力 (Potential)" value={userData.Potential} icon={<Trophy size={16} className="text-yellow-400" />} color="bg-yellow-500" />
            </div>
        </div>
    );
}
