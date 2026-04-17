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
    totalScore: number;
    memberCount: number;
    members: CharacterStats[];
    topMember: CharacterStats;
    commandantBonus?: number;   // 大隊長貢獻的 Exp（顯示用）
    commandantName?: string;
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
        () => [...leaderboard].sort((a, b) => b.Score - a.Score),
        [leaderboard]
    );

    // ── 小隊排名（人數平均制：小隊分數 = 總分 ÷ 人數）────────────────────
    // 大隊長計入所屬大隊每個小隊：各隊 totalScore += 大隊長全額 Exp，memberCount += 1
    const squadRank = useMemo<SquadRankEntry[]>(() => {
        const map = new Map<string, SquadRankEntry>();
        const commandants: CharacterStats[] = [];

        for (const p of leaderboard) {
            // 大隊長另外處理，不歸入任何單一小隊
            if (p.IsCommandant) { commandants.push(p); continue; }

            const key = p.TeamName || `__solo_${p.UserID}`;
            if (!map.has(key)) {
                map.set(key, {
                    squadName: p.TeamName || p.Name,
                    teamName: p.SquadName,
                    totalScore: 0,
                    memberCount: 0,
                    members: [],
                    topMember: p,
                });
            }
            const entry = map.get(key)!;
            entry.totalScore += p.Score;
            entry.memberCount += 1;
            entry.members.push(p);
            if (p.Score > (entry.topMember.Score ?? 0)) entry.topMember = p;
        }

        // 大隊長納入所屬大隊的每個小隊，等同多一位隊員
        for (const cmd of commandants) {
            if (!cmd.SquadName) continue;
            const battalionSquads = [...map.values()].filter(e => e.teamName === cmd.SquadName);
            for (const squad of battalionSquads) {
                squad.totalScore += cmd.Score;
                squad.memberCount += 1;
                squad.members.push(cmd);
                squad.commandantBonus = cmd.Score;
                squad.commandantName = cmd.Name;
                if (cmd.Score > (squad.topMember.Score ?? 0)) squad.topMember = cmd;
            }
        }

        // 規格書 §5.1：小隊分數 = 小隊全員分數總和 ÷ 小隊現有人數（含大隊長）
        return [...map.values()]
            .filter(e => e.memberCount > 0)
            .sort((a, b) => (b.totalScore / b.memberCount) - (a.totalScore / a.memberCount));
    }, [leaderboard]);

    return (
        <div className="space-y-4 animate-in fade-in mx-auto text-center">
            {/* Tab 切換 */}
            <div className="flex gap-2 bg-white border border-[#B2DFC0] rounded-2xl p-1.5">
                <button
                    onClick={() => setTab('personal')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-base transition-all ${
                        tab === 'personal'
                            ? 'bg-[#C0392B] text-white shadow-lg shadow-[0_0_15px_rgba(229,9,20,0.4)]'
                            : 'text-gray-500 hover:text-gray-600'
                    }`}
                >
                    <User size={14} /> 個人總積分
                </button>
                <button
                    onClick={() => setTab('squad')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-base transition-all ${
                        tab === 'squad'
                            ? 'bg-[#F5C842] text-black shadow-lg shadow-[0_0_15px_rgba(212,175,55,0.4)]'
                            : 'text-gray-500 hover:text-gray-600'
                    }`}
                >
                    <Users size={14} /> 小隊總積分
                </button>
            </div>

            {/* 個人排行 */}
            {tab === 'personal' && (
                <div className="bg-white border border-[#B2DFC0] rounded-[2.5rem] overflow-hidden divide-y divide-[#B2DFC0] shadow-md">
                    <div className="p-4 bg-[#F5FAF7] flex items-center gap-2 text-[#1A6B4A] font-black text-sm uppercase tracking-widest justify-center">
                        <Crown size={14} /> 個人積分榜
                    </div>
                    {personalRank.length === 0 ? (
                        <div className="p-10 text-gray-400 italic">積分數據統計中...</div>
                    ) : (
                        personalRank.map((p, i) => {
                            const isSelf = p.UserID === currentUserId;
                            return (
                                <div
                                    key={p.UserID}
                                    className={`flex items-center gap-4 p-5 ${i < 3 ? 'bg-[#1A6B4A]/5' : ''} ${isSelf ? 'ring-1 ring-inset ring-[#C0392B]/40 bg-[#C0392B]/5' : ''}`}
                                >
                                    {/* 名次 */}
                                    <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-black ${RANK_BADGE[i] ?? 'text-gray-400'}`}>
                                        {i + 1}
                                    </div>
                                    {/* 頭像 */}
                                    <div className={`w-10 h-10 rounded-xl shadow-md shrink-0 flex items-center justify-center text-white font-black text-sm ${avatarColor(p.Name)}`}>
                                        {p.Name?.[0]}
                                    </div>
                                    {/* 名字 */}
                                    <div className="flex-1 text-left">
                                        <p className={`font-bold text-base ${isSelf ? 'text-[#C0392B]' : 'text-[#1A2A1A]'}`}>
                                            {p.Name}{isSelf && ' 🍿'}
                                        </p>
                                        <p className="text-sm text-gray-400 italic uppercase tracking-widest">
                                            {p.TeamName || p.SquadName || ''}
                                        </p>
                                    </div>
                                    {/* 積分 & 連續打卡 */}
                                    <div className="text-right">
                                        <div className="text-[#C0392B] font-black text-base">
                                            {p.Score.toLocaleString()}
                                            <span className="text-sm text-gray-400 uppercase tracking-widest ml-1">分</span>
                                        </div>
                                        {p.Streak > 0 && (
                                            <div className="text-base text-orange-400 font-bold mt-0.5">
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
                <div className="bg-white border border-[#B2DFC0] rounded-[2.5rem] overflow-hidden divide-y divide-[#B2DFC0] shadow-md">
                    <div className="p-4 bg-[#F5FAF7] flex items-center gap-2 text-[#1A6B4A] font-black text-sm uppercase tracking-widest justify-center">
                        <Users size={14} /> 小隊榜（人數平均制）
                    </div>
                    {squadRank.length === 0 ? (
                        <div className="p-10 text-gray-400 italic">劇組數據統計中...</div>
                    ) : (
                        squadRank.map((sq, i) => {
                            const avgExp = Math.round(sq.totalScore / sq.memberCount);
                            return (
                                <div key={sq.squadName} className={`p-5 ${i < 3 ? 'bg-[#1A6B4A]/5' : ''}`}>
                                    <div className="flex items-center gap-4">
                                        {/* 名次 */}
                                        <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-black ${RANK_BADGE[i] ?? 'text-gray-400'}`}>
                                            {i + 1}
                                        </div>
                                        {/* 隊長頭像（最高積分成員） */}
                                        <div className={`w-10 h-10 rounded-xl shadow-md shrink-0 flex items-center justify-center text-white font-black text-sm ${avatarColor(sq.topMember.Name)}`}>
                                            {sq.topMember.Name?.[0]}
                                        </div>
                                        {/* 劇組名稱 */}
                                        <div className="flex-1 text-left">
                                            <p className="font-black text-base text-[#1A2A1A]">{sq.squadName}</p>
                                            <p className="text-sm text-gray-400 italic tracking-widest">
                                                {sq.memberCount} 人（含大隊長） · 均 {avgExp.toLocaleString()} 積分
                                                {sq.teamName ? ` · ${sq.teamName}` : ''}
                                            </p>
                                            {sq.commandantName && sq.commandantBonus != null && (
                                                <p className="text-sm text-[#1A6B4A] mt-0.5">
                                                    ★ 大隊長 {sq.commandantName} +{sq.commandantBonus.toLocaleString()}
                                                </p>
                                            )}
                                        </div>
                                        {/* 平均積分（排序依據）*/}
                                        <div className="text-right">
                                            <div className="text-[#F5C842] font-black text-base">
                                                {avgExp.toLocaleString()}
                                                <span className="text-sm text-gray-400 uppercase tracking-widest ml-1">均分</span>
                                            </div>
                                            <div className="text-sm text-gray-400">
                                                總 {sq.totalScore.toLocaleString()}
                                            </div>
                                        </div>
                                    </div>
                                    {/* 成員列表 */}
                                    <div className="mt-3 ml-12 flex flex-wrap gap-2">
                                        {sq.members
                                            .sort((a, b) => b.Score - a.Score)
                                            .map(m => (
                                                <div key={m.UserID} className={`flex items-center gap-1 rounded-lg px-2 py-1 text-sm ${m.IsCommandant ? 'bg-[#F5C842]/10 border border-[#F5C842]/30' : 'bg-gray-100'}`}>
                                                    <div className={`w-4 h-4 rounded-sm flex items-center justify-center text-white font-black text-sm shrink-0 ${avatarColor(m.Name)}`}>{m.Name?.[0]}</div>
                                                    <span className="text-gray-600 font-bold">{m.Name}</span>
                                                    {m.IsCommandant && <span className="text-[#F5C842] font-black text-base">大隊長</span>}
                                                    {m.IsCaptain && !m.IsCommandant && <span className="text-indigo-500 font-black text-sm">隊長</span>}
                                                    <span className="text-gray-400">{m.Score.toLocaleString()}</span>
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
