'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Crown, Users, User, Building2, Calendar, Loader2 } from 'lucide-react';
import { CharacterStats } from '@/types';
import { getCurrentWeekLeaderboard, PersonalRankEntry } from '@/app/actions/rank';

interface RankTabProps {
    leaderboard: CharacterStats[];
    currentUserId?: string;
    currentUser?: CharacterStats;  // 當前使用者完整資料（用於 RBAC 細項展開判斷）
}

type Scope = 'personal' | 'squad' | 'battalion';

const RANK_BADGE: Record<number, string> = {
    0: 'bg-yellow-500 text-slate-950',
    1: 'bg-slate-300 text-slate-950',
    2: 'bg-orange-400 text-slate-950',
};

const AVATAR_COLORS = ['bg-orange-600', 'bg-violet-600', 'bg-blue-600', 'bg-emerald-600', 'bg-rose-600', 'bg-amber-600'];
function avatarColor(name?: string | null) {
    return AVATAR_COLORS[((name?.charCodeAt(0)) ?? 0) % AVATAR_COLORS.length];
}

// 學員端旅人榜：只顯示「本週」個人 / 小隊 / 大隊三種排行。
// 累積、月榜、過往等查詢全部移到大法師密室「旅人榜」子區塊。
// 小隊平均：大隊長個人分數計入本大隊每個小隊的分母（與業務認知一致）。
export function RankTab({ leaderboard, currentUserId, currentUser }: RankTabProps) {
    const [scope, setScope] = useState<Scope>('personal');
    const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

    const [weekEntries, setWeekEntries] = useState<PersonalRankEntry[]>([]);
    const [weekAnchor, setWeekAnchor] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(null);
            const r = await getCurrentWeekLeaderboard();
            if (cancelled) return;
            if (r.success && r.entries) {
                setWeekEntries(r.entries);
                setWeekAnchor(r.weekMonday ?? null);
            } else {
                setError(r.error || '載入失敗');
            }
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, []);

    const weekRangeLabel = useMemo<string>(() => {
        if (!weekAnchor) return '';
        // weekAnchor = 本賽季週起算日（W1 為 5/10，其他週為當週週一）
        const [y, m, d] = weekAnchor.split('-').map(n => parseInt(n, 10));
        const start = new Date(Date.UTC(y, m - 1, d));
        const end = new Date(start);
        // W1 8 天：5/10 ~ 5/17；其他週 7 天
        const days = weekAnchor === '2026-05-10' ? 7 : 6;
        end.setUTCDate(start.getUTCDate() + days);
        const fmt = (dt: Date) => `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}`;
        return `${y} 年 ${fmt(start)} ~ ${fmt(end)}`;
    }, [weekAnchor]);

    // 個人榜：只列出本週有得分的人
    const personalEntries = useMemo<PersonalRankEntry[]>(
        () => weekEntries.map(e => ({ ...e, isCurrentUser: e.userId === currentUserId })),
        [weekEntries, currentUserId]
    );

    // 小隊聚合：以 CharacterStats（leaderboard）為主軸，attach 本週分數
    // 大隊長計入所屬大隊每個小隊（業務需求：小隊平均含大隊長）
    interface SquadRow {
        rowKey: string;
        teamName: string;
        squadName: string | null;
        totalScore: number;
        memberCount: number;
        members: PersonalRankEntry[];
        topMember: PersonalRankEntry;
    }

    const squadRank = useMemo<SquadRow[]>(() => {
        const weekScoreMap = new Map<string, number>(weekEntries.map(e => [e.userId, e.periodScore]));
        const toEntry = (p: CharacterStats): PersonalRankEntry => ({
            userId: p.UserID,
            userName: p.Name,
            teamName: p.TeamName ?? null,
            squadName: p.SquadName ?? null,
            periodScore: weekScoreMap.get(p.UserID) ?? 0,
            cumulativeScore: p.Score ?? 0,
            isCurrentUser: p.UserID === currentUserId,
        });

        const map = new Map<string, SquadRow>();
        const commandants: { entry: PersonalRankEntry; squadName: string | null }[] = [];
        for (const p of leaderboard) {
            const entry = toEntry(p);
            if (p.IsCommandant) { commandants.push({ entry, squadName: p.SquadName ?? null }); continue; }
            if (!p.SquadName || !p.TeamName) continue;
            const key = p.TeamName;
            if (!map.has(key)) {
                map.set(key, {
                    rowKey: key, teamName: p.TeamName, squadName: p.SquadName,
                    totalScore: 0, memberCount: 0, members: [], topMember: entry,
                });
            }
            const row = map.get(key)!;
            row.totalScore += entry.periodScore;
            row.memberCount += 1;
            row.members.push(entry);
            if (entry.periodScore > row.topMember.periodScore) row.topMember = entry;
        }
        // 大隊長計入所屬大隊每個小隊
        for (const cmd of commandants) {
            if (!cmd.squadName) continue;
            for (const row of map.values()) {
                if (row.squadName !== cmd.squadName) continue;
                row.totalScore += cmd.entry.periodScore;
                row.memberCount += 1;
                row.members.push(cmd.entry);
                if (cmd.entry.periodScore > row.topMember.periodScore) row.topMember = cmd.entry;
            }
        }
        return [...map.values()]
            .filter(e => e.memberCount > 0)
            .sort((a, b) => (b.totalScore / b.memberCount) - (a.totalScore / a.memberCount));
    }, [weekEntries, leaderboard, currentUserId]);

    // 大隊聚合：所有大隊都列，含大隊長
    interface BattalionRow {
        squadName: string;
        totalScore: number;
        memberCount: number;
        teamCount: number;
        avgScore: number;
    }
    const battalionRank = useMemo<BattalionRow[]>(() => {
        const weekScoreMap = new Map<string, number>(weekEntries.map(e => [e.userId, e.periodScore]));
        const map = new Map<string, BattalionRow>();
        const teamsByBat = new Map<string, Set<string>>();
        for (const p of leaderboard) {
            if (!p.SquadName) continue;
            if (!map.has(p.SquadName)) {
                map.set(p.SquadName, { squadName: p.SquadName, totalScore: 0, memberCount: 0, teamCount: 0, avgScore: 0 });
            }
            const row = map.get(p.SquadName)!;
            row.totalScore += weekScoreMap.get(p.UserID) ?? 0;
            row.memberCount += 1;
            if (p.TeamName) {
                if (!teamsByBat.has(p.SquadName)) teamsByBat.set(p.SquadName, new Set());
                teamsByBat.get(p.SquadName)!.add(p.TeamName);
            }
        }
        for (const [name, teams] of teamsByBat) {
            const e = map.get(name);
            if (e) e.teamCount = teams.size;
        }
        return [...map.values()].map(e => ({
            ...e, avgScore: e.memberCount > 0 ? Math.round(e.totalScore / e.memberCount) : 0,
        })).sort((a, b) => b.avgScore - a.avgScore);
    }, [weekEntries, leaderboard]);

    // RBAC：可展開細項
    const teamSquadMap = useMemo(() => {
        const m = new Map<string, string | null>();
        for (const p of leaderboard) {
            if (p.TeamName) m.set(p.TeamName, p.SquadName ?? null);
        }
        return m;
    }, [leaderboard]);

    const canExpandSquad = (teamName: string) => {
        if (currentUser?.IsGM) return true;
        if (currentUser?.IsCommandant) return teamSquadMap.get(teamName) === currentUser.SquadName;
        if (currentUser?.IsCaptain) return currentUser.TeamName === teamName;
        return false;
    };

    return (
        <div className="space-y-4 animate-in fade-in mx-auto">
            {/* 區間提示 */}
            <div className="bg-[#F5FAF7] border border-[#B2DFC0] rounded-2xl p-3 flex flex-wrap items-center justify-center gap-2 text-xs font-bold text-[#1A6B4A]">
                <Calendar size={14} />
                本週統計區間：{weekRangeLabel || '載入中…'}
                <span className="text-gray-400 ml-2">每週一 12:30 重新計算</span>
            </div>

            {/* 範圍切換 */}
            <div className="flex gap-2 bg-white border border-[#B2DFC0] rounded-2xl p-1.5">
                {(['personal', 'squad', 'battalion'] as const).map(s => {
                    const labels: Record<Scope, string> = { personal: '個人', squad: '小隊', battalion: '大隊' };
                    const colors: Record<Scope, string> = {
                        personal: 'bg-[#C0392B] text-white',
                        squad: 'bg-[#F5C842] text-black',
                        battalion: 'bg-indigo-600 text-white',
                    };
                    return (
                        <button
                            key={s}
                            onClick={() => setScope(s)}
                            className={`flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl font-black text-sm transition-all ${
                                scope === s ? colors[s] + ' shadow-md' : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            {s === 'personal' && <User size={13} />}
                            {s === 'squad' && <Users size={13} />}
                            {s === 'battalion' && <Building2 size={13} />}
                            {labels[s]}
                        </button>
                    );
                })}
            </div>

            {loading && (
                <div className="bg-white border border-[#B2DFC0] rounded-2xl p-10 text-center text-gray-400 italic flex items-center justify-center gap-2">
                    <Loader2 size={16} className="animate-spin" /> 載入中…
                </div>
            )}
            {error && (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-sm text-rose-700">{error}</div>
            )}

            {/* 個人榜 */}
            {!loading && scope === 'personal' && (
                <div className="bg-white border border-[#B2DFC0] rounded-[2.5rem] overflow-hidden divide-y divide-[#B2DFC0] shadow-md">
                    <div className="p-4 bg-[#F5FAF7] flex items-center gap-2 text-[#1A6B4A] font-black text-sm uppercase tracking-widest justify-center">
                        <Crown size={14} /> 個人週榜
                    </div>
                    {personalEntries.length === 0 ? (
                        <div className="p-10 text-gray-400 italic text-center">本週尚無紀錄</div>
                    ) : (
                        personalEntries.slice(0, 100).map((p, i) => {
                            const isSelf = p.isCurrentUser;
                            return (
                                <div key={p.userId}
                                     className={`flex items-center gap-4 p-4 ${i < 3 ? 'bg-[#1A6B4A]/5' : ''} ${isSelf ? 'ring-1 ring-inset ring-[#C0392B]/40 bg-[#C0392B]/5' : ''}`}>
                                    <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-black ${RANK_BADGE[i] ?? 'text-gray-400'}`}>{i + 1}</div>
                                    <div className={`w-10 h-10 rounded-xl shadow-md shrink-0 flex items-center justify-center text-white font-black text-sm ${avatarColor(p.userName)}`}>{p.userName?.[0]}</div>
                                    <div className="flex-1 text-left min-w-0">
                                        <p className={`font-bold text-base truncate ${isSelf ? 'text-[#C0392B]' : 'text-[#1A2A1A]'}`}>{p.userName}{isSelf && ' 👣'}</p>
                                        <p className="text-xs text-gray-400 italic uppercase tracking-widest truncate">{p.teamName || p.squadName || ''}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="text-[#C0392B] font-black text-base">
                                            {p.periodScore.toLocaleString()}
                                            <span className="text-sm text-gray-400 uppercase tracking-widest ml-1">分</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* 小隊榜 */}
            {!loading && scope === 'squad' && (
                <div className="bg-white border border-[#B2DFC0] rounded-[2.5rem] overflow-hidden divide-y divide-[#B2DFC0] shadow-md">
                    <div className="p-4 bg-[#F5FAF7] flex items-center gap-2 text-[#1A6B4A] font-black text-sm uppercase tracking-widest justify-center">
                        <Users size={14} /> 小隊週榜（人數平均 · 含大隊長）
                    </div>
                    {squadRank.length === 0 ? (
                        <div className="p-10 text-gray-400 italic text-center">本週尚無紀錄</div>
                    ) : squadRank.map((sq, i) => {
                        const avg = Math.round(sq.totalScore / sq.memberCount);
                        const expandable = canExpandSquad(sq.teamName);
                        const expanded = expandedTeam === sq.rowKey;
                        return (
                            <div key={sq.rowKey} className={`p-4 ${i < 3 ? 'bg-[#1A6B4A]/5' : ''}`}>
                                <div className="flex items-center gap-4">
                                    <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-black ${RANK_BADGE[i] ?? 'text-gray-400'}`}>{i + 1}</div>
                                    <div className={`w-10 h-10 rounded-xl shadow-md shrink-0 flex items-center justify-center text-white font-black text-sm ${avatarColor(sq.topMember.userName)}`}>{sq.topMember.userName?.[0]}</div>
                                    <div className="flex-1 text-left min-w-0">
                                        <p className="font-black text-base text-[#1A2A1A] truncate">{sq.teamName}</p>
                                        <p className="text-xs text-gray-400 italic tracking-widest truncate">
                                            {sq.memberCount} 人 · 均 {avg.toLocaleString()} 分
                                            {sq.squadName ? ` · ${sq.squadName}` : ''}
                                        </p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="text-[#F5C842] font-black text-base">
                                            {avg.toLocaleString()}
                                            <span className="text-sm text-gray-400 uppercase tracking-widest ml-1">均</span>
                                        </div>
                                        <div className="text-xs text-gray-400">總 {sq.totalScore.toLocaleString()}</div>
                                    </div>
                                </div>
                                {expandable && (
                                    <button
                                        onClick={() => setExpandedTeam(expanded ? null : sq.rowKey)}
                                        className="ml-12 mt-2 text-xs text-indigo-600 font-bold hover:underline"
                                    >
                                        {expanded ? '收合成員' : '查看成員細項 →'}
                                    </button>
                                )}
                                {expandable && expanded && (
                                    <div className="mt-3 ml-12 flex flex-wrap gap-2">
                                        {[...sq.members].sort((a, b) => b.periodScore - a.periodScore).map(m => {
                                            const cs = leaderboard.find(l => l.UserID === m.userId);
                                            return (
                                                <div key={m.userId}
                                                     className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs ${cs?.IsCommandant ? 'bg-[#F5C842]/10 border border-[#F5C842]/30' : 'bg-gray-100'}`}>
                                                    <div className={`w-4 h-4 rounded-sm flex items-center justify-center text-white font-black text-[10px] ${avatarColor(m.userName)}`}>{m.userName?.[0]}</div>
                                                    <span className="text-gray-600 font-bold">{m.userName}</span>
                                                    {cs?.IsCommandant && <span className="text-[#F5C842] font-black">大隊長</span>}
                                                    {cs?.IsCaptain && !cs?.IsCommandant && <span className="text-indigo-500 font-black">隊長</span>}
                                                    <span className="text-gray-400">{m.periodScore.toLocaleString()}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* 大隊榜 */}
            {!loading && scope === 'battalion' && (
                <div className="bg-white border border-[#B2DFC0] rounded-[2.5rem] overflow-hidden divide-y divide-[#B2DFC0] shadow-md">
                    <div className="p-4 bg-[#F5FAF7] flex items-center gap-2 text-[#1A6B4A] font-black text-sm uppercase tracking-widest justify-center">
                        <Building2 size={14} /> 大隊週榜
                    </div>
                    {battalionRank.length === 0 ? (
                        <div className="p-10 text-gray-400 italic text-center">本週尚無紀錄</div>
                    ) : battalionRank.map((b, i) => (
                        <div key={b.squadName} className={`flex items-center gap-4 p-4 ${i < 3 ? 'bg-[#1A6B4A]/5' : ''}`}>
                            <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-black ${RANK_BADGE[i] ?? 'text-gray-400'}`}>{i + 1}</div>
                            <div className="w-10 h-10 rounded-xl shadow-md shrink-0 flex items-center justify-center bg-indigo-600 text-white">
                                <Building2 size={18} />
                            </div>
                            <div className="flex-1 text-left min-w-0">
                                <p className="font-black text-base text-[#1A2A1A] truncate">{b.squadName}</p>
                                <p className="text-xs text-gray-400 italic tracking-widest">
                                    {b.teamCount} 個小隊 · {b.memberCount} 人 · 均 {b.avgScore.toLocaleString()} 分
                                </p>
                            </div>
                            <div className="text-right shrink-0">
                                <div className="text-indigo-600 font-black text-base">
                                    {b.avgScore.toLocaleString()}
                                    <span className="text-sm text-gray-400 uppercase tracking-widest ml-1">均</span>
                                </div>
                                <div className="text-xs text-gray-400">總 {b.totalScore.toLocaleString()}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
