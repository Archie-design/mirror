import { useState } from 'react';
import { ACHIEVEMENTS, ACHIEVEMENT_MAP, RARITY_STYLE, TOTAL_ACHIEVEMENTS, type AchievementDef } from '@/lib/achievements';
import type { AchievementRecord, CharacterStats } from '@/types';

interface AchievementsTabProps {
    achievements: AchievementRecord[];
    userData: CharacterStats;
}

type RarityFilter = 'all' | 'common' | 'rare' | 'epic' | 'legendary';

const FILTER_LABELS: { key: RarityFilter; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'common', label: '常見' },
    { key: 'rare', label: '罕見' },
    { key: 'epic', label: '稀有' },
    { key: 'legendary', label: '傳說' },
];

function AchievementCard({ def, unlocked_at, isOwner }: {
    def: AchievementDef;
    unlocked_at?: string;
    isOwner: boolean; // true = player's own role matches roleExclusive
}) {
    if (unlocked_at) {
        // Unlocked card
        const style = RARITY_STYLE[def.rarity];
        const date = unlocked_at.slice(0, 10);
        return (
            <div className={`relative min-h-[100px] p-4 rounded-2xl border-2 ${style.border} ${style.bg} shadow-lg ${style.glow} flex flex-col gap-1`}>
                <div className="flex items-center gap-2">
                    <span className="text-2xl">{def.icon}</span>
                    <span className={`font-black text-sm leading-tight ${style.text}`}>{def.name}</span>
                </div>
                <div className={`text-[10px] font-bold uppercase tracking-widest ${style.text} opacity-70`}>
                    {RARITY_STYLE[def.rarity].label}
                </div>
                <p className="text-xs text-slate-300 leading-snug mt-1">{def.description}</p>
                <p className="text-[9px] text-slate-500 mt-auto pt-1">{date} 解鎖</p>
            </div>
        );
    }

    if (def.roleExclusive && !isOwner) {
        // Wrong role — sealed card
        return (
            <div className="relative min-h-[100px] p-4 rounded-2xl border-2 border-slate-800 bg-slate-900/30 flex flex-col items-center justify-center opacity-40 gap-1">
                <span className="text-xl">🚫</span>
                <p className="text-[10px] text-slate-500 text-center leading-tight">此成就與你的<br />職業無緣</p>
            </div>
        );
    }

    // Locked mystery card
    return (
        <div className="relative min-h-[100px] p-4 rounded-2xl border-2 border-slate-800 bg-slate-900/20 flex flex-col gap-1">
            <div className="flex items-center gap-2">
                <span className="text-xl opacity-50">🔒</span>
                <span className="font-black text-sm text-slate-600">???</span>
            </div>
            <p className="text-[10px] text-slate-600 italic leading-snug mt-1">{def.hint}</p>
        </div>
    );
}

export function AchievementsTab({ achievements, userData }: AchievementsTabProps) {
    const [filter, setFilter] = useState<RarityFilter>('all');

    const unlockedMap = new Map(achievements.map(a => [a.achievement_id, a.unlocked_at]));
    const unlockedCount = achievements.length;
    const progressPct = Math.round((unlockedCount / TOTAL_ACHIEVEMENTS) * 100);

    const filtered = filter === 'all' ? ACHIEVEMENTS : ACHIEVEMENTS.filter(a => a.rarity === filter);

    return (
        <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="bg-slate-900 border-2 border-amber-500/30 rounded-3xl p-5 text-center">
                <p className="text-xs font-black text-amber-400 uppercase tracking-widest mb-1">成就殿堂</p>
                <p className="text-2xl font-black text-white">
                    {unlockedCount} <span className="text-slate-500 text-lg">/ {TOTAL_ACHIEVEMENTS}</span>
                </p>
                <div className="mt-3 w-full bg-slate-800 rounded-full h-2">
                    <div
                        className="h-2 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-500"
                        style={{ width: `${progressPct}%` }}
                    />
                </div>
                <p className="text-[10px] text-slate-500 mt-1">{progressPct}% 完成</p>
            </div>

            {/* Rarity filter tabs */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {FILTER_LABELS.map(({ key, label }) => (
                    <button
                        key={key}
                        onClick={() => setFilter(key)}
                        className={`shrink-0 px-4 py-2 rounded-xl text-xs font-black transition-all ${
                            filter === key
                                ? 'bg-amber-600 text-white shadow-lg shadow-amber-600/20'
                                : 'bg-slate-900 text-slate-400'
                        }`}
                    >
                        {label}
                        {key !== 'all' && (
                            <span className="ml-1 opacity-60">
                                ({achievements.filter(a => ACHIEVEMENT_MAP.get(a.achievement_id)?.rarity === key).length})
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Achievement grid */}
            <div className="grid grid-cols-2 gap-3">
                {filtered.map(def => (
                    <AchievementCard
                        key={def.id}
                        def={def}
                        unlocked_at={unlockedMap.get(def.id)}
                        isOwner={!def.roleExclusive || def.roleExclusive === userData.Role}
                    />
                ))}
            </div>
        </div>
    );
}
