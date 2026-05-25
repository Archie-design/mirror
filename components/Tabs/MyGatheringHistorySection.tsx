'use client';

import { useEffect, useState } from 'react';
import { Loader2, Crown, Image as ImageIcon } from 'lucide-react';
import { getMyGatheringHistory, type MyGatheringHistoryEntry } from '@/app/actions/squad-gathering';

interface Props {
    userId: string;
}

export function MyGatheringHistorySection({ userId }: Props) {
    const [entries, setEntries] = useState<MyGatheringHistoryEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const res = await getMyGatheringHistory(userId);
            if (cancelled) return;
            if (res.success) setEntries(res.entries ?? []);
            else setErr(res.error ?? '載入失敗');
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, [userId]);

    if (loading) {
        return (
            <div className="p-5 rounded-3xl bg-white border-2 border-[#B2DFC0] flex justify-center">
                <Loader2 size={18} className="animate-spin text-[#1A6B4A]" />
            </div>
        );
    }

    if (err) {
        return (
            <div className="p-5 rounded-3xl bg-red-50 border border-red-200 text-sm text-red-600 text-center">
                {err}
            </div>
        );
    }

    if (entries.length === 0) {
        return (
            <div className="p-5 rounded-3xl bg-white border-2 border-[#B2DFC0] text-center">
                <p className="text-sm text-gray-400">尚無實體凝聚紀錄</p>
            </div>
        );
    }

    return (
        <div className="space-y-2 text-left">
            {entries.map(e => (
                <div key={e.sessionId} className="bg-white border-2 border-[#B2DFC0] rounded-3xl p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                            <p className="font-black text-[#1A2A1A] text-sm">{e.gatheringDate} · {e.teamName}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                                {e.attendeeCount != null && e.memberCount != null && (
                                    <span>{e.attendeeCount}/{e.memberCount} 人到場</span>
                                )}
                                {e.hasCommandant && (
                                    <span className="text-amber-600 ml-1"><Crown size={10} className="inline" /> 大隊長到場</span>
                                )}
                            </p>
                            {e.backfilled && (
                                <p className="text-[10px] text-amber-700 mt-1 bg-amber-50 border border-amber-200 inline-block px-2 py-0.5 rounded-full">
                                    補報紀錄
                                </p>
                            )}
                            {e.notes && (
                                <p className="text-[10px] text-gray-400 mt-1 break-words">備註:{e.notes}</p>
                            )}
                        </div>
                        <div className="shrink-0 text-right">
                            <p className="text-emerald-600 font-black text-base">+{(e.rewardPerPerson ?? 0).toLocaleString()}</p>
                            <p className="text-[9px] text-gray-400">分/人</p>
                        </div>
                    </div>
                    {e.evidenceScreenshotUrl && (
                        <a
                            href={e.evidenceScreenshotUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700 font-bold"
                        >
                            <ImageIcon size={11} /> 查看截圖佐證
                        </a>
                    )}
                </div>
            ))}
        </div>
    );
}
