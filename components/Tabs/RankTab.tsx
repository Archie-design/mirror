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

const AVATAR_COLORS = [
    'bg-orange-600', 'bg-violet-600', 'bg-blue-600',
    'bg-emerald-600', 'bg-rose-600', 'bg-amber-600',
];
function avatarColor(name: string) {
    return AVATAR_COLORS[(name.charCodeAt(0) ?? 0) % AVATAR_COLORS.length];
}

export function RankTab({ leaderboard, currentUserId }: RankTabProps) {
    const [tab, setTab] = useState<'personal' | 'squad'>('personal');

    // ── 個人排名 ─────────────────────────────────────────────
    const personalRank = useMemo(
        () => [...leaderboard].sort((a, b) => b.Exp - a.Exp),
        [leaderboard]
    );

    // ── 小隊排名（人數平均制：小隊分數 = 總分 ÷ 人數）────────────────────
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
        // 規格書 §5.1：小隊分數 = 小隊全員分數總和 ÷ 小隊現有人數
        return [...map.values()]
            .filter(e => e.memberCount > 0)
            .sort((a, b) => (b.totalExp / b.memberCount) - (a.totalExp / a.memberCount));
    }, [leaderboard]);

    return (
        <div className="space-y-4 animate-in fade-in mx-auto text-center">
            {/* Tab 切換 */}
            <div className="flex gap-2 bg-[#111] border border-[#333] rounded-2xl p-1.5">
                <button
                    onClick={() => setTab('personal')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm transition-all ${
                        tab === 'personal'
                            ? 'bg-[#E50914] text-white shadow-lg shadow-[0_0_15px_rgba(229,9,20,0.4)]'
                            : 'text-gray-500 hover:text-gray-300'
                    }`}
                >
                    <User size={14} /> 個人總票房
                </button>
                <button
                    onClick={() => setTab('squad')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm transition-all ${
                        tab === 'squad'
                            ? 'bg-[#D4AF37] text-black shadow-lg shadow-[0_0_15px_rgba(212,175,55,0.4)]'
                            : 'text-gray-500 hover:text-gray-300'
                    }`}
                >
                    <Users size={14} /> 劇組總票房
                </button>
            </div>

            {/* 個人排行 */}
            {tab === 'personal' && (
                <div className="bg-[#111] border border-[#333] rounded-[2.5rem] overflow-hidden divide-y divide-[#333] shadow-2xl">
                    <div className="p-4 bg-black/50 flex items-center gap-2 text-[#D4AF37] font-black text-xs uppercase tracking-widest justify-center">
                        <Crown size={14} /> 個人票房榜
                    </div>
                    {personalRank.length === 0 ? (
                        <div className="p-10 text-gray-500 italic">票房數據統計中...</div>
                    ) : (
                        personalRank.map((p, i) => {
                            const isSelf = p.UserID === currentUserId;
                            return (
                                <div
                                    key={p.UserID}
                                    className={`flex items-center gap-4 p-5 ${i < 3 ? 'bg-white/5' : ''} ${isSelf ? 'ring-1 ring-inset ring-[#E50914]/40 bg-[#E50914]/5' : ''}`}
                                >
                                    {/* 名次 */}
                                    <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-black ${RANK_BADGE[i] ?? 'text-gray-500'}`}>
                                        {i + 1}
                                    </div>
                                    {/* 頭像 */}
                                    <div className={`w-10 h-10 rounded-xl shadow-md shrink-0 flex items-center justify-center text-white font-black text-sm ${avatarColor(p.Name)}`}>
                                        {p.Name?.[0]}
                                    </div>
                                    {/* 名字 */}
                                    <div className="flex-1 text-left">
                                        <p className={`font-bold text-sm ${isSelf ? 'text-[#E50914]' : 'text-white'}`}>
                                            {p.Name}{isSelf && ' 🍿'}
                                        </p>
                                        <p className="text-[10px] text-gray-500 italic uppercase tracking-widest">
                                            {p.TeamName || p.SquadName || ''}
                                        </p>
                                    </div>
                                    {/* 積分 & 連續打卡 */}
                                    <div className="text-right">
                                        <div className="text-[#E50914] font-black text-sm">
                                            {p.Exp.toLocaleString()}
                                            <span className="text-[8px] text-gray-600 uppercase tracking-widest ml-1">票房</span>
                                        </div>
                                        {p.Streak > 0 && (
                                            <div className="text-[10px] text-orange-400 font-bold mt-0.5">
                                                🔥 {p.Streak} 天
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* 劇組排行 */}
            {tab === 'squad' && (
                <div className="bg-[#111] border border-[#333] rounded-[2.5rem] overflow-hidden divide-y divide-[#333] shadow-2xl">
                    <div className="p-4 bg-black/50 flex items-center gap-2 text-[#D4AF37] font-black text-xs uppercase tracking-widest justify-center">
                        <Users size={14} /> 小隊榜（人數平均制）
                    </div>
                    {squadRank.length === 0 ? (
                        <div className="p-10 text-gray-500 italic">劇組數據統計中...</div>
                    ) : (
                        squadRank.map((sq, i) => {
                            const avgExp = Math.round(sq.totalExp / sq.memberCount);
                            return (
                                <div key={sq.squadName} className={`p-5 ${i < 3 ? 'bg-white/5' : ''}`}>
                                    <div className="flex items-center gap-4">
                                        {/* 名次 */}
                                        <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-black ${RANK_BADGE[i] ?? 'text-gray-500'}`}>
                                            {i + 1}
                                        </div>
                                        {/* 隊長頭像（最高積分成員） */}
                                        <div className={`w-10 h-10 rounded-xl shadow-md shrink-0 flex items-center justify-center text-white font-black text-sm ${avatarColor(sq.topMember.Name)}`}>
                                            {sq.topMember.Name?.[0]}
                                        </div>
                                        {/* 劇組名稱 */}
                                        <div className="flex-1 text-left">
                                            <p className="font-black text-sm text-white">{sq.squadName}</p>
                                            <p className="text-[10px] text-gray-500 italic tracking-widest">
                                                {sq.memberCount} 人 · 均 {avgExp.toLocaleString()} 積分
                                                {sq.teamName ? ` · ${sq.teamName}` : ''}
                                            </p>
                                        </div>
                                        {/* 平均積分（排序依據）*/}
                                        <div className="text-right">
                                            <div className="text-[#D4AF37] font-black text-sm">
                                                {avgExp.toLocaleString()}
                                                <span className="text-[8px] text-gray-600 uppercase tracking-widest ml-1">均分</span>
                                            </div>
                                            <div className="text-[10px] text-gray-500">
                                                總 {sq.totalExp.toLocaleString()}
                                            </div>
                                        </div>
                                    </div>
                                    {/* 成員列表 */}
                                    <div className="mt-3 ml-12 flex flex-wrap gap-2">
                                        {sq.members
                                            .sort((a, b) => b.Exp - a.Exp)
                                            .map(m => (
                                                <div key={m.UserID} className="flex items-center gap-1 bg-[#222]/60 rounded-lg px-2 py-1 text-[10px]">
                                                    <div className={`w-4 h-4 rounded-sm flex items-center justify-center text-white font-black text-[8px] shrink-0 ${avatarColor(m.Name)}`}>{m.Name?.[0]}</div>
                                                    <span className="text-gray-300 font-bold">{m.Name}</span>
                                                    <span className="text-gray-500">{m.Exp.toLocaleString()}</span>
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
