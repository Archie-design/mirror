import React from 'react';
import { Crown } from 'lucide-react';
import { CharacterStats } from '@/types';

export function RankTab({ leaderboard }: { leaderboard: CharacterStats[] }) {
    return (
        <div className="bg-slate-900 border-2 border-white/5 rounded-4xl overflow-hidden divide-y divide-white/5 shadow-2xl animate-in fade-in mx-auto text-center justify-center">
            <div className="p-4 bg-slate-950/50 flex items-center gap-2 text-yellow-500 font-black text-xs uppercase tracking-widest justify-center text-center">
                <Crown size={14} /> 修為排行榜
            </div>
            {leaderboard.length === 0 ? (
                <div className="p-10 text-slate-500 italic">修行數據感應中...</div>
            ) : (
                leaderboard.map((p, i) => (
                    <div key={p.UserID} className={`flex items-center gap-4 p-5 ${i < 3 ? 'bg-white/5' : ''} text-center mx-auto`}>
                        <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-black ${i === 0 ? 'bg-yellow-500 text-slate-950' :
                                i === 1 ? 'bg-slate-300 text-slate-950' :
                                    i === 2 ? 'bg-orange-400 text-slate-950' :
                                        'text-slate-500'
                            }`}>{i + 1}</div>
                        <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center font-bold text-white shadow-md mx-auto">{p.Name?.[0]}</div>
                        <div className="flex-1 text-left"><p className="font-bold text-sm text-white">{p.Name}</p><p className="text-[10px] text-slate-500 italic uppercase tracking-widest">{p.Role}</p></div>
                        <div className="text-right text-orange-500 font-black text-sm">{p.Exp} <span className="text-[8px] text-slate-600 uppercase tracking-widest ml-1">修為</span></div>
                    </div>
                ))
            )}
        </div>
    );
}
