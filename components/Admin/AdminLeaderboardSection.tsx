'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Crown, Users, User, Building2, Calendar, TrendingUp, Loader2 } from 'lucide-react';
import { CharacterStats } from '@/types';
import {
    getCurrentWeekLeaderboard,
    getPreviousWeekLeaderboard,
    getPastWeekLeaderboard,
    getCurrentMonthLeaderboard,
    getPreviousMonthLeaderboard,
    getPastMonthLeaderboard,
    listAvailableWeeks,
    listAvailableMonths,
    PersonalRankEntry,
} from '@/app/actions/rank';

// 大法師密室「旅人榜」子區塊：完整時段（累積/週/月/過往）+ 範圍（個人/小隊/大隊）。
// 學員端 RankTab 已精簡為「本週 only」，所有歷史與累積查詢都集中在此供 admin 確認。
// 與 RankTab 視覺風格保持一致；不需要 RBAC 限制（admin 可看全部）。

interface Props {
    leaderboard: CharacterStats[];
}

type Period = 'week' | 'month' | 'cumulative';
type Scope = 'personal' | 'squad' | 'battalion';

const AVATAR_COLORS = ['bg-orange-600', 'bg-violet-600', 'bg-blue-600', 'bg-emerald-600', 'bg-rose-600', 'bg-amber-600'];
function avatarColor(name?: string | null) {
    return AVATAR_COLORS[((name?.charCodeAt(0)) ?? 0) % AVATAR_COLORS.length];
}

const RANK_BADGE: Record<number, string> = {
    0: 'bg-yellow-500 text-slate-950',
    1: 'bg-slate-300 text-slate-950',
    2: 'bg-orange-400 text-slate-950',
};

export function AdminLeaderboardSection({ leaderboard }: Props) {
    const [period, setPeriod] = useState<Period>('cumulative');
    const [scope, setScope] = useState<Scope>('personal');
    const [periodOffset, setPeriodOffset] = useState(0);
    const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

    const [periodEntries, setPeriodEntries] = useState<PersonalRankEntry[]>([]);
    const [periodLoading, setPeriodLoading] = useState(false);
    const [periodError, setPeriodError] = useState<string | null>(null);
    const [availableWeeks, setAvailableWeeks] = useState<string[]>([]);
    const [availableMonths, setAvailableMonths] = useState<string[]>([]);
    const [displayedAnchor, setDisplayedAnchor] = useState<string | null>(null);

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
                            if (r.success && r.entries) { setPeriodEntries(r.entries); setDisplayedAnchor(r.weekMonday ?? null); }
                            else setPeriodError(r.error || '載入失敗');
                        }
                    } else if (periodOffset === -1) {
                        const r = await getPreviousWeekLeaderboard();
                        if (!cancelled) {
                            if (r.success && r.entries) { setPeriodEntries(r.entries); setDisplayedAnchor(r.weekMonday ?? null); }
                            else setPeriodError(r.error || '載入失敗');
                        }
                    } else {
                        const target = availableWeeks[periodOffset - 1];
                        if (!target) { if (!cancelled) { setPeriodEntries([]); setDisplayedAnchor(null); } return; }
                        const r = await getPastWeekLeaderboard(target);
                        if (!cancelled) {
                            if (r.success && r.entries) { setPeriodEntries(r.entries); setDisplayedAnchor(target); }
                            else setPeriodError(r.error || '載入失敗');
                        }
                    }
                } else if (period === 'month') {
                    if (periodOffset === 0) {
                        const r = await getCurrentMonthLeaderboard();
                        if (!cancelled) {
                            if (r.success && r.entries) { setPeriodEntries(r.entries); setDisplayedAnchor(r.monthStart ?? null); }
                            else setPeriodError(r.error || '載入失敗');
                        }
                    } else if (periodOffset === -1) {
                        const r = await getPreviousMonthLeaderboard();
                        if (!cancelled) {
                            if (r.success && r.entries) { setPeriodEntries(r.entries); setDisplayedAnchor(r.monthStart ?? null); }
                            else setPeriodError(r.error || '載入失敗');
                        }
                    } else {
                        const target = availableMonths[periodOffset - 1];
                        if (!target) { if (!cancelled) { setPeriodEntries([]); setDisplayedAnchor(null); } return; }
                        const r = await getPastMonthLeaderboard(target);
                        if (!cancelled) {
                            if (r.success && r.entries) { setPeriodEntries(r.entries); setDisplayedAnchor(target); }
                            else setPeriodError(r.error || '載入失敗');
                        }
                    }
                }
            } finally {
                if (!cancelled) setPeriodLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [period, periodOffset, availableWeeks, availableMonths]);

    useEffect(() => {
        (async () => {
            const w = await listAvailableWeeks(24);
            if (w.success && w.weeks) setAvailableWeeks(w.weeks);
            const m = await listAvailableMonths(12);
            if (m.success && m.months) setAvailableMonths(m.months);
        })();
    }, []);

    useEffect(() => { setPeriodOffset(0); }, [period]);

    const periodRangeLabel = useMemo<string>(() => {
        if (period === 'cumulative') return '活動全期';
        if (!displayedAnchor) return '';
        if (period === 'month') {
            const [y, m] = displayedAnchor.split('-');
            return `${y} 年 ${parseInt(m, 10)} 月`;
        }
        const [y, m, d] = displayedAnchor.split('-').map(n => parseInt(n, 10));
        const start = new Date(Date.UTC(y, m - 1, d));
        const end = new Date(start);
        // W1 8 天特例：5/10 ~ 5/17；其他週 7 天
        const days = displayedAnchor === '2026-05-10' ? 7 : 6;
        end.setUTCDate(start.getUTCDate() + days);
        const fmt = (dt: Date) => `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}`;
        return `${y} 年 ${fmt(start)} ~ ${fmt(end)}`;
    }, [period, displayedAnchor]);

    // 顯示用資料
    const displayEntries = useMemo<PersonalRankEntry[]>(() => {
        if (period === 'cumulative') {
            return [...leaderboard]
                .sort((a, b) => b.Score - a.Score)
                .map(p => ({
                    userId: p.UserID, userName: p.Name,
                    teamName: p.TeamName ?? null, squadName: p.SquadName ?? null,
                    periodScore: p.Score, cumulativeScore: p.Score,
                }));
        }
        return periodEntries;
    }, [period, leaderboard, periodEntries]);

    // 小隊聚合：大隊長計入該大隊每個小隊
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
        const scoreMap = new Map<string, number>(displayEntries.map(e => [e.userId, e.periodScore]));
        const map = new Map<string, SquadRow>();
        const commandants: { entry: PersonalRankEntry; squadName: string | null }[] = [];
        for (const p of leaderboard) {
            const entry: PersonalRankEntry = {
                userId: p.UserID, userName: p.Name,
                teamName: p.TeamName ?? null, squadName: p.SquadName ?? null,
                periodScore: scoreMap.get(p.UserID) ?? 0,
                cumulativeScore: p.Score ?? 0,
            };
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
    }, [displayEntries, leaderboard]);

    interface BattalionRow {
        squadName: string; totalScore: number; memberCount: number; teamCount: number; avgScore: number;
    }
    const battalionRank = useMemo<BattalionRow[]>(() => {
        const scoreMap = new Map<string, number>(displayEntries.map(e => [e.userId, e.periodScore]));
        const map = new Map<string, BattalionRow>();
        const teamsByBat = new Map<string, Set<string>>();
        for (const p of leaderboard) {
            if (!p.SquadName) continue;
            if (!map.has(p.SquadName)) {
                map.set(p.SquadName, { squadName: p.SquadName, totalScore: 0, memberCount: 0, teamCount: 0, avgScore: 0 });
            }
            const row = map.get(p.SquadName)!;
            row.totalScore += scoreMap.get(p.UserID) ?? 0;
            row.memberCount += 1;
            if (p.TeamName) {
                if (!teamsByBat.has(p.SquadName)) teamsByBat.set(p.SquadName, new Set());
                teamsByBat.get(p.SquadName)!.add(p.TeamName);
            }
        }
        for (const [name, teams] of teamsByBat) {
            const e = map.get(name); if (e) e.teamCount = teams.size;
        }
        return [...map.values()].map(e => ({
            ...e, avgScore: e.memberCount > 0 ? Math.round(e.totalScore / e.memberCount) : 0,
        })).sort((a, b) => b.avgScore - a.avgScore);
    }, [displayEntries, leaderboard]);

    const renderPeriodSelector = () => {
        if (period === 'cumulative') {
            return (
                <div className="flex items-center justify-center gap-2 px-1 text-xs text-emerald-200/70 font-bold">
                    <Calendar size={14} />
                    統計區間：{periodRangeLabel}
                </div>
            );
        }
        const list = period === 'week' ? availableWeeks : availableMonths;
        const label = period === 'week' ? '週' : '月';
        return (
            <div className="flex flex-wrap items-center gap-2 px-1">
                <Calendar size={14} className="text-emerald-200/70" />
                <select
                    value={periodOffset}
                    onChange={e => setPeriodOffset(parseInt(e.target.value, 10))}
                    className="text-sm bg-[#061410] border border-amber-400/30 text-amber-200 rounded-lg px-2 py-1 font-bold"
                >
                    <option value={0}>本{label}</option>
                    {list.length === 0 && <option value={-1}>上{label}</option>}
                    {list.map((d, i) => (
                        <option key={d} value={i + 1}>{d}（{i === 0 ? '上' + label : d}）</option>
                    ))}
                </select>
                {periodRangeLabel && (
                    <span className="text-xs text-emerald-200/70 font-bold">統計區間：{periodRangeLabel}</span>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-sm font-black text-amber-300 uppercase tracking-widest flex items-center gap-2">
                    <Crown size={14} /> 旅人榜（admin 完整查詢）
                </h3>
                <span className="text-[10px] text-emerald-200/40">學員端僅顯示本週；此處可切換累積 / 週 / 月 / 歷史</span>
            </div>

            {/* 期間切換 */}
            <div className="flex gap-2 bg-[#061410] border border-amber-400/20 rounded-2xl p-1.5">
                {(['week', 'month', 'cumulative'] as const).map(p => {
                    const labels: Record<Period, string> = { week: '週榜', month: '月榜', cumulative: '累積' };
                    return (
                        <button
                            key={p}
                            onClick={() => setPeriod(p)}
                            className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-xl font-black text-xs transition-all ${
                                period === p ? 'bg-amber-500 text-slate-950 shadow' : 'text-emerald-200/50 hover:text-emerald-200'
                            }`}
                        >
                            {p === 'week' && <TrendingUp size={12} />}
                            {p === 'month' && <Calendar size={12} />}
                            {p === 'cumulative' && <Crown size={12} />}
                            {labels[p]}
                        </button>
                    );
                })}
            </div>

            {/* 範圍切換 */}
            <div className="flex gap-2 bg-[#061410] border border-amber-400/20 rounded-2xl p-1.5">
                {(['personal', 'squad', 'battalion'] as const).map(s => {
                    const labels: Record<Scope, string> = { personal: '個人', squad: '小隊', battalion: '大隊' };
                    return (
                        <button
                            key={s}
                            onClick={() => setScope(s)}
                            className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-xl font-black text-xs transition-all ${
                                scope === s ? 'bg-emerald-500/80 text-slate-950 shadow' : 'text-emerald-200/50 hover:text-emerald-200'
                            }`}
                        >
                            {s === 'personal' && <User size={12} />}
                            {s === 'squad' && <Users size={12} />}
                            {s === 'battalion' && <Building2 size={12} />}
                            {labels[s]}
                        </button>
                    );
                })}
            </div>

            {renderPeriodSelector()}

            {period !== 'cumulative' && periodLoading && (
                <div className="bg-[#061410] border border-amber-400/20 rounded-2xl p-6 text-center text-emerald-200/40 italic flex items-center justify-center gap-2">
                    <Loader2 size={14} className="animate-spin" /> 載入中…
                </div>
            )}
            {periodError && (
                <div className="bg-rose-900/30 border border-rose-400/40 rounded-2xl p-3 text-xs text-rose-300">{periodError}</div>
            )}

            {/* 個人榜 */}
            {!periodLoading && scope === 'personal' && (
                <div className="bg-[#061410] border border-amber-400/20 rounded-2xl overflow-hidden divide-y divide-emerald-900/30">
                    <div className="p-3 bg-amber-400/5 text-amber-300 font-black text-xs uppercase tracking-widest text-center">
                        個人榜（前 100）
                    </div>
                    {displayEntries.length === 0 ? (
                        <div className="p-6 text-emerald-200/40 italic text-center text-xs">尚無資料</div>
                    ) : displayEntries.slice(0, 100).map((p, i) => (
                        <div key={p.userId} className="flex items-center gap-3 p-3 text-xs">
                            <div className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[10px] font-black ${RANK_BADGE[i] ?? 'text-emerald-200/40'}`}>{i + 1}</div>
                            <div className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-white font-black text-xs ${avatarColor(p.userName)}`}>{p.userName?.[0]}</div>
                            <div className="flex-1 text-left min-w-0">
                                <p className="font-bold text-emerald-100 truncate">{p.userName}</p>
                                <p className="text-[10px] text-emerald-200/40 truncate">{p.teamName || p.squadName || ''}</p>
                            </div>
                            <div className="text-right shrink-0">
                                <div className="text-amber-300 font-black text-sm">{p.periodScore.toLocaleString()}</div>
                                {period !== 'cumulative' && (
                                    <div className="text-[10px] text-emerald-200/40">累積 {p.cumulativeScore.toLocaleString()}</div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* 小隊榜 */}
            {!periodLoading && scope === 'squad' && (
                <div className="bg-[#061410] border border-amber-400/20 rounded-2xl overflow-hidden divide-y divide-emerald-900/30">
                    <div className="p-3 bg-amber-400/5 text-amber-300 font-black text-xs uppercase tracking-widest text-center">
                        小隊榜（人數平均 · 含大隊長）
                    </div>
                    {squadRank.length === 0 ? (
                        <div className="p-6 text-emerald-200/40 italic text-center text-xs">尚無資料</div>
                    ) : squadRank.map((sq, i) => {
                        const avg = Math.round(sq.totalScore / sq.memberCount);
                        const expanded = expandedTeam === sq.rowKey;
                        return (
                            <div key={sq.rowKey} className="p-3 text-xs">
                                <div className="flex items-center gap-3">
                                    <div className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[10px] font-black ${RANK_BADGE[i] ?? 'text-emerald-200/40'}`}>{i + 1}</div>
                                    <div className="flex-1 text-left min-w-0">
                                        <p className="font-black text-emerald-100 truncate">{sq.teamName}</p>
                                        <p className="text-[10px] text-emerald-200/40 truncate">
                                            {sq.memberCount} 人 · 均 {avg.toLocaleString()} · {sq.squadName ?? ''}
                                        </p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="text-amber-300 font-black text-sm">{avg.toLocaleString()}</div>
                                        <div className="text-[10px] text-emerald-200/40">總 {sq.totalScore.toLocaleString()}</div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setExpandedTeam(expanded ? null : sq.rowKey)}
                                    className="ml-9 mt-1 text-[10px] text-indigo-400 font-bold hover:underline"
                                >
                                    {expanded ? '收合' : '展開成員'}
                                </button>
                                {expanded && (
                                    <div className="mt-2 ml-9 flex flex-wrap gap-1">
                                        {[...sq.members].sort((a, b) => b.periodScore - a.periodScore).map(m => {
                                            const cs = leaderboard.find(l => l.UserID === m.userId);
                                            return (
                                                <div key={m.userId} className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ${cs?.IsCommandant ? 'bg-amber-500/10 border border-amber-400/30' : 'bg-emerald-900/20 border border-emerald-900/40'}`}>
                                                    <span className="text-emerald-100 font-bold">{m.userName}</span>
                                                    {cs?.IsCommandant && <span className="text-amber-300 font-black">大</span>}
                                                    {cs?.IsCaptain && !cs?.IsCommandant && <span className="text-indigo-300 font-black">隊</span>}
                                                    <span className="text-emerald-200/50">{m.periodScore.toLocaleString()}</span>
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
                <div className="bg-[#061410] border border-amber-400/20 rounded-2xl overflow-hidden divide-y divide-emerald-900/30">
                    <div className="p-3 bg-amber-400/5 text-amber-300 font-black text-xs uppercase tracking-widest text-center">大隊榜</div>
                    {battalionRank.length === 0 ? (
                        <div className="p-6 text-emerald-200/40 italic text-center text-xs">尚無資料</div>
                    ) : battalionRank.map((b, i) => (
                        <div key={b.squadName} className="flex items-center gap-3 p-3 text-xs">
                            <div className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[10px] font-black ${RANK_BADGE[i] ?? 'text-emerald-200/40'}`}>{i + 1}</div>
                            <div className="flex-1 text-left min-w-0">
                                <p className="font-black text-emerald-100 truncate">{b.squadName}</p>
                                <p className="text-[10px] text-emerald-200/40">
                                    {b.teamCount} 小隊 · {b.memberCount} 人 · 均 {b.avgScore.toLocaleString()}
                                </p>
                            </div>
                            <div className="text-right shrink-0">
                                <div className="text-amber-300 font-black text-sm">{b.avgScore.toLocaleString()}</div>
                                <div className="text-[10px] text-emerald-200/40">總 {b.totalScore.toLocaleString()}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
