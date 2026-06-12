'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, Star } from 'lucide-react';
import { listSecretMissions } from '@/app/actions/temp-quest-application';
import { MissionReviewTab } from '@/components/Admin/MissionReviewTab';

// 啟用「參獎篩選（全組完成 / ≥5 人完成）」的任務 id。未來要哪個任務啟用，加 id 即可。
const AWARD_MISSION_IDS = new Set<string>(['temp_1780288200701']); // 秘密任務2

interface Mission { id: string; title: string; active: boolean; startDate: string | null; endDate: string | null; }

export function SecretMissionsTab({ onShowMessage }: {
    onShowMessage: (msg: string, type: 'success' | 'error' | 'info') => void;
}) {
    const [missions, setMissions] = useState<Mission[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const res = await listSecretMissions();
            if (cancelled) return;
            if (res.success) {
                setMissions(res.missions);
                // 預設選「進行中且最新」；無進行中則選最後一個
                const active = [...res.missions].reverse().find(m => m.active);
                setSelectedId(active?.id ?? res.missions[res.missions.length - 1]?.id ?? null);
            } else {
                onShowMessage(res.error ?? '載入失敗', 'error');
            }
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, [onShowMessage]);

    if (loading) return <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-amber-400" /></div>;
    if (missions.length === 0) return <p className="text-center text-slate-500 py-12 text-sm">尚無「秘密任務」系列任務</p>;

    return (
        <div className="space-y-5">
            {/* 任務切換器 */}
            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black text-slate-400 flex items-center gap-1"><Star size={13} className="text-amber-400" /> 選擇任務</span>
                {missions.map(m => (
                    <button key={m.id} onClick={() => setSelectedId(m.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                            selectedId === m.id ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
                        }`}
                    >
                        {m.title}
                        {!m.active && <span className="ml-1 text-[10px] opacity-60">（已下架）</span>}
                    </button>
                ))}
            </div>

            {selectedId && (
                <MissionReviewTab
                    key={selectedId}
                    questId={selectedId}
                    showTeamAwards={AWARD_MISSION_IDS.has(selectedId)}
                    onShowMessage={onShowMessage}
                />
            )}
        </div>
    );
}
