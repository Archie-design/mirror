'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Crown, Users, User, Building2, Calendar, TrendingUp, Loader2 } from 'lucide-react';
import { CharacterStats } from '@/types';
import {
    getCurrentWeekLeaderboard,
    getPastWeekLeaderboard,
    getCurrentMonthLeaderboard,
    getPastMonthLeaderboard,
    listAvailableWeeks,
    listAvailableMonths,
    PersonalRankEntry,
} from '@/app/actions/rank';

interface RankTabProps {
    leaderboard: CharacterStats[];
    currentUserId?: string;
    currentUser?: CharacterStats;  // 當前使用者完整資料（用於 RBAC 細項展開判斷）
}

type Period = 'week' | 'month' | 'cumulative';
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

export function RankTab({ leaderboard, currentUserId, currentUser }: RankTabProps) {
    const [period, setPeriod] = useState<Period>('cumulative');
    const [scope, setScope] = useState<Scope>('personal');
    const [periodOffset, setPeriodOffset] = useState(0);
    const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

    // 期間資料（週/月榜，從 server 載入；cumulative 直接用 props.leaderboard）
    const [periodEntries, setPeriodEntries] = useState<PersonalRankEntry[]>([]);
    const [periodLoading, setPeriodLoading] = useState(false);
    const [periodError, setPeriodError] = useState<string | null>(null);
    const [availableWeeks, setAvailableWeeks] = useState<string[]>([]);
    const [availableMonths, setAvailableMonths] = useState<string[]>([]);
    // 當前顯示期間的具體起算日（YYYY-MM-DD）；累積榜時為 null
    const [displayedAnchor, setDisplayedAnchor] = useState<string | null>(null);

    // 期間切換時：拉資料
    useEffect(() => {
        if (period === 'cumulative') { setDisplayedAnchor(null); return; }
        let cancelled = false;
        (async () => {
            setPeriodLoading(true);
            setPeriodError(null);
            try {
                if (period === 'week') {
                    if (periodOffset === 0) {
                        const r = await getCurrentWeekLeaderboard();
                        if (!cancelled) {
                            if (r.success && r.entries) {
                                setPeriodEntries(r.entries);
                                setDisplayedAnchor(r.weekMonday ?? null);
                            } else setPeriodError(r.error || '載入失敗');
                        }
                    } else {
                        const target = availableWeeks[periodOffset - 1];
                        if (!target) { if (!cancelled) { setPeriodEntries([]); setDisplayedAnchor(null); } return; }
                        const r = await getPastWeekLeaderboard(target);
                        if (!cancelled) {
                            if (r.success && r.entries) {
                                setPeriodEntries(r.entries);
                                setDisplayedAnchor(target);
                            } else setPeriodError(r.error || '載入失敗');
                        }
                    }
                } else if (period === 'month') {
                    if (periodOffset === 0) {
                        const r = await getCurrentMonthLeaderboard();
                        if (!cancelled) {
                            if (r.success && r.entries) {
                                setPeriodEntries(r.entries);
                                setDisplayedAnchor(r.monthStart ?? null);
                            } else setPeriodError(r.error || '載入失敗');
                        }
                    } else {
                        const target = availableMonths[periodOffset - 1];
                        if (!target) { if (!cancelled) { setPeriodEntries([]); setDisplayedAnchor(null); } return; }
                        const r = await getPastMonthLeaderboard(target);
                        if (!cancelled) {
                            if (r.success && r.entries) {
                                setPeriodEntries(r.entries);
                                setDisplayedAnchor(target);
                            } else setPeriodError(r.error || '載入失敗');
                        }
                    }
                }
            } finally {
                if (!cancelled) setPeriodLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [period, periodOffset, availableWeeks, availableMonths]);

    // ── 顯示用區間 label ──────────────────────────────────────────────────────
    const periodRangeLabel = useMemo<string>(() => {
        if (period === 'cumulative') return '活動全期';
        if (!displayedAnchor) return '';
        if (period === 'month') {
            const [y, m] = displayedAnchor.split('-');
            return `${y} 年 ${parseInt(m, 10)} 月`;
        }
        // week：顯示週一 ~ 週日
        const [y, m, d] = displayedAnchor.split('-').map(n => parseInt(n, 10));
        const start = new Date(Date.UTC(y, m - 1, d));
        const end = new Date(start);
        end.setUTCDate(start.getUTCDate() + 6);
        const fmt = (dt: Date) => `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}`;
        return `${y} 年 ${fmt(start)} ~ ${fmt(end)}`;
    }, [period, displayedAnchor]);

    // 載入歷史週/月清單（一次）
    useEffect(() => {
        (async () => {
            const w = await listAvailableWeeks(12);
            if (w.success && w.weeks) setAvailableWeeks(w.weeks);
            const m = await listAvailableMonths(12);
            if (m.success && m.months) setAvailableMonths(m.months);
        })();
    }, []);

    // ── 切換期間時重置 offset ────────────────────────────────────────────────
    useEffect(() => { setPeriodOffset(0); }, [period]);

    // ── 顯示用統一資料結構 ────────────────────────────────────────────────────
    const displayEntries = useMemo<PersonalRankEntry[]>(() => {
        if (period === 'cumulative') {
            return [...leaderboard]
                .sort((a, b) => b.Score - a.Score)
                .map(p => ({
                    userId: p.UserID,
                    userName: p.Name,
                    teamName: p.TeamName ?? null,
                    squadName: p.SquadName ?? null,
                    periodScore: p.Score,
                    cumulativeScore: p.Score,
                    isCurrentUser: p.UserID === currentUserId,
                }));
        }
        return periodEntries;
    }, [period, leaderboard, periodEntries, currentUserId]);

    // ── 小隊聚合 ────────────────────────────────────────────────────────────
    interface SquadRow {
        rowKey: string;             // React key 用，保證唯一（可能是 teamName 或 __solo_<userId>）
        teamName: string;           // 顯示用，無 team 時 fallback 為使用者名
        squadName: string | null;
        totalScore: number;
        memberCount: number;
        members: PersonalRankEntry[];
        topMember: PersonalRankEntry;
    }

    // 累積榜的小隊聚合：保留現有「大隊長計入大隊內每個小隊」邏輯
    const cumulativeSquadRank = useMemo<SquadRow[]>(() => {
        const map = new Map<string, SquadRow>();
        const commandants: PersonalRankEntry[] = [];
        for (const p of displayEntries) {
            const cs = leaderboard.find(l => l.UserID === p.userId);
            if (cs?.IsCommandant) { commandants.push(p); continue; }
            const key = p.teamName || `__solo_${p.userId}`;
            if (!map.has(key)) {
                map.set(key, {
                    rowKey: key,
                    teamName: p.teamName || p.userName || '',
                    squadName: p.squadName,
                    totalScore: 0, memberCount: 0, members: [], topMember: p,
                });
            }
            const entry = map.get(key)!;
            entry.totalScore += p.periodScore;
            entry.memberCount += 1;
            entry.members.push(p);
            if (p.periodScore > entry.topMember.periodScore) entry.topMember = p;
        }
        // 大隊長計入所屬大隊每個小隊
        const squadsByBattalion = new Map<string, SquadRow[]>();
        for (const e of map.values()) {
            if (!e.squadName) continue;
            const list = squadsByBattalion.get(e.squadName) ?? [];
            list.push(e); squadsByBattalion.set(e.squadName, list);
        }
        for (const cmd of commandants) {
            if (!cmd.squadName) continue;
            const squads = squadsByBattalion.get(cmd.squadName);
            if (!squads) continue;
            for (const sq of squads) {
                sq.totalScore += cmd.periodScore;
                sq.memberCount += 1;
                sq.members.push(cmd);
                if (cmd.periodScore > sq.topMember.periodScore) sq.topMember = cmd;
            }
        }
        return [...map.values()]
            .filter(e => e.memberCount > 0)
            .sort((a, b) => (b.totalScore / b.memberCount) - (a.totalScore / a.memberCount));
    }, [displayEntries, leaderboard]);

    // 週/月榜的小隊聚合：簡化版（不複製大隊長）
    const periodSquadRank = useMemo<SquadRow[]>(() => {
        const map = new Map<string, SquadRow>();
        for (const p of displayEntries) {
            const key = p.teamName || `__solo_${p.userId}`;
            if (!map.has(key)) {
                map.set(key, {
                    rowKey: key,
                    teamName: p.teamName || p.userName || '',
                    squadName: p.squadName,
                    totalScore: 0, memberCount: 0, members: [], topMember: p,
                });
            }
            const entry = map.get(key)!;
            entry.totalScore += p.periodScore;
            entry.memberCount += 1;
            entry.members.push(p);
            if (p.periodScore > entry.topMember.periodScore) entry.topMember = p;
        }
        return [...map.values()]
            .filter(e => e.memberCount > 0)
            .sort((a, b) => (b.totalScore / b.memberCount) - (a.totalScore / a.memberCount));
    }, [displayEntries]);

    const squadRank = period === 'cumulative' ? cumulativeSquadRank : periodSquadRank;

    // ── 大隊聚合 ────────────────────────────────────────────────────────────
    interface BattalionRow {
        squadName: string;
        totalScore: number;
        memberCount: number;
        teamCount: number;
        avgScore: number;
    }
    const battalionRank = useMemo<BattalionRow[]>(() => {
        const map = new Map<string, BattalionRow>();
        const teamsByBat = new Map<string, Set<string>>();
        for (const p of displayEntries) {
            if (!p.squadName) continue;
            if (!map.has(p.squadName)) {
                map.set(p.squadName, { squadName: p.squadName, totalScore: 0, memberCount: 0, teamCount: 0, avgScore: 0 });
            }
            const entry = map.get(p.squadName)!;
            entry.totalScore += p.periodScore;
            entry.memberCount += 1;
            if (p.teamName) {
                if (!teamsByBat.has(p.squadName)) teamsByBat.set(p.squadName, new Set());
                teamsByBat.get(p.squadName)!.add(p.teamName);
            }
        }
        for (const [name, teams] of teamsByBat) {
            const e = map.get(name);
            if (e) e.teamCount = teams.size;
        }
        return [...map.values()].map(e => ({
            ...e, avgScore: e.memberCount > 0 ? Math.round(e.totalScore / e.memberCount) : 0,
        })).sort((a, b) => b.avgScore - a.avgScore);
    }, [displayEntries]);

    // teamName → squadName 映射，從 leaderboard prop（CharacterStats 陣列）建立，
    // 保證即使該小隊在當期零得分仍能正確查到大隊歸屬
    const teamSquadMap = useMemo(() => {
        const m = new Map<string, string | null>();
        for (const p of leaderboard) {
            if (p.TeamName) m.set(p.TeamName, p.SquadName ?? null);
        }
        return m;
    }, [leaderboard]);

    // ── RBAC：可展開細項的條件 ──────────────────────────────────────────────
    const canExpandSquad = (teamName: string) => {
        if (currentUser?.IsGM) return true;
        if (currentUser?.IsCommandant) {
            // 大隊長：用靜態 leaderboard map，不依賴當期是否有得分記錄
            return teamSquadMap.get(teamName) === currentUser.SquadName;
        }
        if (currentUser?.IsCaptain) {
            return currentUser.TeamName === teamName;
        }
        return false;
    };

    // ── 期間選單 + 區間 label ────────────────────────────────────────────────
    const renderPeriodSelector = () => {
        if (period === 'cumulative') {
            return (
                <div className="flex items-center justify-center gap-2 px-1 text-xs text-gray-500 font-bold">
                    <Calendar size={14} className="text-gray-400" />
                    統計區間：{periodRangeLabel}
                </div>
            );
        }
        const list = period === 'week' ? availableWeeks : availableMonths;
        const label = period === 'week' ? '週' : '月';
        return (
            <div className="flex flex-wrap items-center gap-2 px-1">
                <Calendar size={14} className="text-gray-400" />
                <select
                    value={periodOffset}
                    onChange={e => setPeriodOffset(parseInt(e.target.value, 10))}
                    className="text-sm bg-white border border-[#B2DFC0] rounded-lg px-2 py-1 font-bold"
                >
                    <option value={0}>本{label}</option>
                    {list.map((d, i) => (
                        <option key={d} value={i + 1}>{d}（{i === 0 ? '上' + label : d}）</option>
                    ))}
                </select>
                {periodRangeLabel && (
                    <span className="text-xs text-gray-500 font-bold">統計區間：{periodRangeLabel}</span>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-4 animate-in fade-in mx-auto">
            {/* 期間切換 */}
            <div className="flex gap-2 bg-white border border-[#B2DFC0] rounded-2xl p-1.5">
                {(['week', 'month', 'cumulative'] as const).map(p => {
                    const labels: Record<Period, string> = { week: '週榜', month: '月榜', cumulative: '累積' };
                    return (
                        <button
                            key={p}
                            onClick={() => setPeriod(p)}
                            className={`flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl font-black text-sm transition-all ${
                                period === p ? 'bg-[#1A6B4A] text-white shadow-md' : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            {p === 'week' && <TrendingUp size={13} />}
                            {p === 'month' && <Calendar size={13} />}
                            {p === 'cumulative' && <Crown size={13} />}
                            {labels[p]}
                        </button>
                    );
                })}
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

            {/* 期間下拉選單（週/月榜） */}
            {renderPeriodSelector()}

            {/* 載入中 / 錯誤狀態 */}
            {period !== 'cumulative' && periodLoading && (
                <div className="bg-white border border-[#B2DFC0] rounded-2xl p-10 text-center text-gray-400 italic flex items-center justify-center gap-2">
                    <Loader2 size={16} className="animate-spin" /> 載入中…
                </div>
            )}
            {periodError && (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-sm text-rose-700">{periodError}</div>
            )}

            {/* 個人榜 */}
            {!periodLoading && scope === 'personal' && (
                <div className="bg-white border border-[#B2DFC0] rounded-[2.5rem] overflow-hidden divide-y divide-[#B2DFC0] shadow-md">
                    <div className="p-4 bg-[#F5FAF7] flex items-center gap-2 text-[#1A6B4A] font-black text-sm uppercase tracking-widest justify-center">
                        <Crown size={14} /> {period === 'cumulative' ? '個人累積榜' : period === 'week' ? '個人週榜' : '個人月榜'}
                    </div>
                    {displayEntries.length === 0 ? (
                        <div className="p-10 text-gray-400 italic text-center">尚無資料</div>
                    ) : (
                        displayEntries.slice(0, 100).map((p, i) => {
                            const isSelf = p.isCurrentUser;
                            const cs = leaderboard.find(l => l.UserID === p.userId);
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
                                        {period === 'cumulative' && cs && cs.Streak > 0 && (
                                            <div className="text-sm text-orange-400 font-bold mt-0.5">🔥 {cs.Streak} 天</div>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* 小隊榜 */}
            {!periodLoading && scope === 'squad' && (
                <div className="bg-white border border-[#B2DFC0] rounded-[2.5rem] overflow-hidden divide-y divide-[#B2DFC0] shadow-md">
                    <div className="p-4 bg-[#F5FAF7] flex items-center gap-2 text-[#1A6B4A] font-black text-sm uppercase tracking-widest justify-center">
                        <Users size={14} /> 小隊榜（人數平均制）
                    </div>
                    {squadRank.length === 0 ? (
                        <div className="p-10 text-gray-400 italic text-center">尚無資料</div>
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
            {!periodLoading && scope === 'battalion' && (
                <div className="bg-white border border-[#B2DFC0] rounded-[2.5rem] overflow-hidden divide-y divide-[#B2DFC0] shadow-md">
                    <div className="p-4 bg-[#F5FAF7] flex items-center gap-2 text-[#1A6B4A] font-black text-sm uppercase tracking-widest justify-center">
                        <Building2 size={14} /> 大隊榜
                    </div>
                    {battalionRank.length === 0 ? (
                        <div className="p-10 text-gray-400 italic text-center">尚無資料</div>
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
