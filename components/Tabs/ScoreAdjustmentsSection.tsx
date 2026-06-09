'use client';

import { useEffect, useState } from 'react';
import { Loader2, Wrench } from 'lucide-react';
import { getMyScoreAdjustments, type ScoreAdjustment } from '@/app/actions/team';

interface Props {
    userId: string;
}

// 學員端：顯示自己的後台調整紀錄（admin_adjust）。
// 無資料時整段（含標題）不顯示，避免孤兒標題。
export function ScoreAdjustmentsSection({ userId }: Props) {
    const [items, setItems] = useState<ScoreAdjustment[] | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const res = await getMyScoreAdjustments(userId);
            if (cancelled) return;
            if (res.success) setItems(res.items ?? []);
            else setItems([]);
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, [userId]);

    // 載入中或無資料 → 整段不顯示
    if (loading || !items || items.length === 0) return null;

    return (
        <section className="space-y-3 text-left">
            <h2 className="text-sm font-black text-gray-500 uppercase tracking-widest px-1 text-center">
                🛠️ 後台調整紀錄
            </h2>
            <div className="space-y-2">
                {items.map(it => {
                    const positive = it.points >= 0;
                    return (
                        <div key={it.id} className="bg-white border-2 border-[#B2DFC0] rounded-3xl p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                    <p className="font-black text-[#1A2A1A] text-sm flex items-center gap-1.5">
                                        <Wrench size={12} className="text-gray-400 shrink-0" />
                                        {it.date}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-0.5 break-words">{it.reason}</p>
                                </div>
                                <span className={`shrink-0 text-sm font-black whitespace-nowrap ${positive ? 'text-emerald-600' : 'text-red-500'}`}>
                                    {positive ? '+' : '−'}{Math.abs(it.points).toLocaleString()}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
