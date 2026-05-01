'use client';

import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Loader2 } from 'lucide-react';
import { getSquadGrowthChart, SquadGrowthDatum } from '@/app/actions/rank';

interface Props {
    weeks?: number;
}

const LINE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16'];

export function SquadGrowthChart({ weeks = 8 }: Props) {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<SquadGrowthDatum[]>([]);
    const [teamNames, setTeamNames] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            const res = await getSquadGrowthChart(weeks);
            if (cancelled) return;
            if (!res.success) {
                setError(res.error || '載入失敗');
            } else {
                setData(res.data || []);
                setTeamNames(res.teamNames || []);
                setError(null);
            }
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, [weeks]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64 bg-white border border-[#B2DFC0] rounded-2xl">
                <Loader2 size={20} className="animate-spin text-emerald-700" />
            </div>
        );
    }
    if (error) {
        return <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-sm text-rose-700">{error}</div>;
    }
    if (data.length === 0 || teamNames.length === 0) {
        return (
            <div className="p-6 bg-white border border-[#B2DFC0] rounded-2xl text-sm text-gray-500 text-center">
                尚無歷史資料（成長曲線需至少一週的快照）
            </div>
        );
    }

    // 將 SquadGrowthDatum[] 攤平成 recharts 期望的格式：每筆 datum 是一個物件
    const chartData = data.map(d => ({
        week: d.weekMonday.slice(5), // MM-DD 顯示更精簡
        ...d.teamScores,
    }));

    return (
        <div className="bg-white border border-[#B2DFC0] rounded-2xl p-3 md:p-4">
            <h3 className="text-sm font-black text-[#1A2A1A] mb-2 px-1">小組成長曲線（最近 {data.length} 週）</h3>
            <div className="h-72 md:h-80">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 10, bottom: 5, left: -10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip
                            contentStyle={{ fontSize: '12px', borderRadius: '8px', border: '1px solid #B2DFC0' }}
                            labelFormatter={(v) => `週: ${v}`}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                        {teamNames.map((tn, i) => (
                            <Line
                                key={tn}
                                type="monotone"
                                dataKey={tn}
                                stroke={LINE_COLORS[i % LINE_COLORS.length]}
                                strokeWidth={2}
                                dot={{ r: 3 }}
                                activeDot={{ r: 5 }}
                            />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
