import React, { useState, useMemo } from 'react';
import { Crown, Users, User } from 'lucide-react';
import { CharacterStats } from '@/types';

interface RankTabProps {
    leaderboard: CharacterStats[];
    currentUserId?: string;
}

interface SquadRankEntry {
    squadName: string;
    teamName?: string;
    totalExp: number;
    memberCount: number;
    members: CharacterStats[];
    topMember: CharacterStats;
}

const RANK_BADGE: Record<number, string> = {
    0: 'bg-yellow-500 text-slate-950',
    1: 'bg-slate-300 text-slate-950',
    2: 'bg-orange-400 text-slate-950',
};

export function RankTab({ leaderboard, currentUserId }: RankTabProps) {
    const [tab, setTab] = useState<'personal' | 'squad'>('personal');

    // ── 個人排名 ─────────────────────────────────────────────
    const personalRank = useMemo(
        () => [...leaderboard].sort((a, b) => b.Exp - a.Exp),
        [leaderboard]
    );

    // ── 小隊排名 ─────────────────────────────────────────────
    const squadRank = useMemo<SquadRankEntry[]>(() => {
        const map = new Map<string, SquadRankEntry>();
        for (const p of leaderboard) {
            const key = p.TeamName || `__solo_${p.UserID}`;
            if (!map.has(key)) {
                map.set(key, {
                    squadName: p.TeamName || p.Name,
                    teamName: p.SquadName,
                    totalExp: 0,
                    memberCount: 0,
                    members: [],
                    topMember: p,
                });
            }
            const entry = map.get(key)!;
            entry.totalExp += p.Exp;
            entry.memberCount += 1;
            entry.members.push(p);
            if (p.Exp > entry.topMember.Exp) entry.topMember = p;
        }
        return [...map.values()]
            .filter(e => e.memberCount > 0)
            .sort((a, b) => b.totalExp - a.totalExp);
    }, [leaderboard]);

    return (
        <div className="space-y-4 animate-in fade-in mx-auto text-center">
            {/* Tab 切換 */}
            <div className="flex gap-2 bg-slate-900 border border-white/5 rounded-2xl p-1.5">
                <button
                    onClick={() => setTab('personal')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm transition-all ${
                        tab === 'personal'
                            ? 'bg-orange-600 text-white shadow-lg'
                            : 'text-slate-500 hover:text-slate-300'
                    }`}
                >
                    <User size={14} /> 個人榜
                </button>
                <button
                    onClick={() => setTab('squad')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm transition-all ${
                        tab === 'squad'
                            ? 'bg-blue-600 text-white shadow-lg'
                            : 'text-slate-500 hover:text-slate-300'
                    }`}
                >
                    <Users size={14} /> 小隊榜
                </button>
            </div>

            {/* 個人排行 */}
            {tab === 'personal' && (
                <div className="bg-slate-900 border-2 border-white/5 rounded-4xl overflow-hidden divide-y divide-white/5 shadow-2xl">
                    <div className="p-4 bg-slate-950/50 flex items-center gap-2 text-yellow-500 font-black text-xs uppercase tracking-widest justify-center">
                        <Crown size={14} /> 個人修為榜
                    </div>
                    {personalRank.length === 0 ? (
                        <div className="p-10 text-slate-500 italic">修行數據感應中...</div>
                    ) : (
                        personalRank.map((p, i) => {
                            const isSelf = p.UserID === currentUserId;
                            return (
                                <div
                                    key={p.UserID}
                                    className={`flex items-center gap-4 p-5 ${i < 3 ? 'bg-white/5' : ''} ${isSelf ? 'ring-1 ring-inset ring-orange-500/40 bg-orange-500/5' : ''}`}
                                >
                                    {/* 名次 */}
                                    <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-black ${RANK_BADGE[i] ?? 'text-slate-500'}`}>
                                        {i + 1}
                                    </div>
                                    {/* 頭像 */}
                                    <div className="w-10 h-10 rounded-xl overflow-hidden shadow-md bg-slate-800 shrink-0">
                                        <img src={`/images/avatars/${p.Role}.png`} alt={p.Role} className="w-full h-full object-cover object-top" />
                                    </div>
                                    {/* 名字 */}
                                    <div className="flex-1 text-left">
                                        <p className={`font-bold text-sm ${isSelf ? 'text-orange-400' : 'text-white'}`}>
                                            {p.Name}{isSelf && ' 🔥'}
                                        </p>
                                        <p className="text-[10px] text-slate-500 italic uppercase tracking-widest">
                                            {p.Role}{p.TeamName ? ` · ${p.TeamName}` : (p.SquadName ? ` · ${p.SquadName}` : '')}
                                        </p>
                                    </div>
                                    {/* 修為 */}
                                    <div className="text-right text-orange-500 font-black text-sm">
                                        {p.Exp.toLocaleString()}
                                        <span className="text-[8px] text-slate-600 uppercase tracking-widest ml-1">修為</span>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* 小隊排行 */}
            {tab === 'squad' && (
                <div className="bg-slate-900 border-2 border-white/5 rounded-4xl overflow-hidden divide-y divide-white/5 shadow-2xl">
                    <div className="p-4 bg-slate-950/50 flex items-center gap-2 text-blue-400 font-black text-xs uppercase tracking-widest justify-center">
                        <Users size={14} /> 小隊修為榜（成員總和）
                    </div>
                    {squadRank.length === 0 ? (
                        <div className="p-10 text-slate-500 italic">小隊數據感應中...</div>
                    ) : (
                        squadRank.map((sq, i) => {
                            const avgExp = Math.round(sq.totalExp / sq.memberCount);
                            return (
                                <div key={sq.squadName} className={`p-5 ${i < 3 ? 'bg-white/5' : ''}`}>
                                    <div className="flex items-center gap-4">
                                        {/* 名次 */}
                                        <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-black ${RANK_BADGE[i] ?? 'text-slate-500'}`}>
                                            {i + 1}
                                        </div>
                                        {/* 隊長頭像（最高修為成員） */}
                                        <div className="w-10 h-10 rounded-xl overflow-hidden shadow-md bg-slate-800 shrink-0">
                                            <img src={`/images/avatars/${sq.topMember.Role}.png`} alt={sq.topMember.Role} className="w-full h-full object-cover object-top" />
                                        </div>
                                        {/* 小隊名稱 */}
                                        <div className="flex-1 text-left">
                                            <p className="font-black text-sm text-white">{sq.squadName}</p>
                                            <p className="text-[10px] text-slate-500 italic tracking-widest">
                                                {sq.memberCount} 人 · 均 {avgExp.toLocaleString()} 修為
                                                {sq.teamName ? ` · ${sq.teamName}` : ''}
                                            </p>
                                        </div>
                                        {/* 總修為 */}
                                        <div className="text-right text-blue-400 font-black text-sm">
                                            {sq.totalExp.toLocaleString()}
                                            <span className="text-[8px] text-slate-600 uppercase tracking-widest ml-1">總修為</span>
                                        </div>
                                    </div>
                                    {/* 成員列表 */}
                                    <div className="mt-3 ml-12 flex flex-wrap gap-2">
                                        {sq.members
                                            .sort((a, b) => b.Exp - a.Exp)
                                            .map(m => (
                                                <div key={m.UserID} className="flex items-center gap-1 bg-slate-800/60 rounded-lg px-2 py-1 text-[10px]">
                                                    <img src={`/images/avatars/${m.Role}.png`} alt={m.Role} className="w-4 h-4 rounded-sm object-cover object-top" />
                                                    <span className="text-slate-300 font-bold">{m.Name}</span>
                                                    <span className="text-slate-500">{m.Exp.toLocaleString()}</span>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
}
