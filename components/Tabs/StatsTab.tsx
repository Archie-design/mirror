import React from 'react';
import { Skull, Wand2, Sparkles, Shield, Heart, Brain, Zap, Trophy } from 'lucide-react';
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
}

export function StatsTab({ userData, roleTrait }: StatsTabProps) {
    if (!roleTrait) return null;

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

            <div className="bg-gradient-to-br from-red-950/40 to-slate-900 border-2 border-white/5 p-8 rounded-4xl shadow-2xl text-center mx-auto">
                <span className="text-6xl font-black text-white mb-2 block">NT$ {userData.TotalFines}</span>
                <p className="text-xs text-slate-500 font-black uppercase tracking-[0.2em]">累世罰金餘額</p>
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
