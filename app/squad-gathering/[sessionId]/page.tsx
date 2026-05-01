'use client';

import { useState, useEffect, useCallback, Suspense, use } from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2, Users, AlertTriangle, Crown } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import {
    scanGatheringQR,
    getTeamGatheringContext,
    type TeamGatheringContext,
} from '@/app/actions/squad-gathering';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

type UiState =
    | { kind: 'loading' }
    | { kind: 'need-login' }
    | { kind: 'ready'; userId: string; context: TeamGatheringContext }
    | { kind: 'scanning' }
    | { kind: 'done'; alreadyIn: boolean; context: TeamGatheringContext }
    | { kind: 'error'; message: string };

function SquadGatheringContent({ sessionId }: { sessionId: string }) {
    const [state, setState] = useState<UiState>({ kind: 'loading' });

    const loadContext = useCallback(async (uid: string) => {
        const res = await getTeamGatheringContext(uid);
        if (!res.success || !res.context) {
            setState({ kind: 'error', message: res.error ?? '無法讀取凝聚資料' });
            return null;
        }
        if (!res.context.session || res.context.session.id !== sessionId) {
            // fetch session directly (用戶可能非本隊但為大隊長)
            const { data: s } = await supabase
                .from('SquadGatheringSessions')
                .select('id, team_name, gathering_date, status')
                .eq('id', sessionId)
                .maybeSingle();
            if (!s) {
                setState({ kind: 'error', message: '找不到此凝聚紀錄' });
                return null;
            }
        }
        return res.context;
    }, [sessionId]);

    useEffect(() => {
        (async () => {
            const uid = typeof window !== 'undefined' ? window.localStorage.getItem('session_uid') : null;
            if (!uid) {
                setState({ kind: 'need-login' });
                return;
            }
            const shouldAutoCheckin = typeof window !== 'undefined'
                && new URLSearchParams(window.location.search).get('autoCheckin') === '1';
            const ctx = await loadContext(uid);
            if (!ctx) return;
            if (shouldAutoCheckin) {
                setState({ kind: 'scanning' });
                const res = await scanGatheringQR(uid, sessionId);
                if (!res.success) {
                    setState({ kind: 'error', message: res.error ?? '報到失敗' });
                    return;
                }
                const ctx2 = await loadContext(uid);
                if (ctx2) setState({ kind: 'done', alreadyIn: !!res.alreadyCheckedIn, context: ctx2 });
            } else {
                setState({ kind: 'ready', userId: uid, context: ctx });
            }
        })();
    }, [loadContext, sessionId]);

    const handleScan = async () => {
        if (state.kind !== 'ready') return;
        setState({ kind: 'scanning' });
        const res = await scanGatheringQR(state.userId, sessionId);
        if (!res.success) {
            setState({ kind: 'error', message: res.error ?? '報到失敗' });
            return;
        }
        const ctx = await loadContext(state.userId);
        if (ctx) setState({ kind: 'done', alreadyIn: !!res.alreadyCheckedIn, context: ctx });
    };

    if (state.kind === 'loading') {
        return (
            <div className="min-h-screen bg-[#16213E] flex items-center justify-center">
                <Loader2 size={32} className="animate-spin text-[#F5C842]" />
            </div>
        );
    }

    if (state.kind === 'need-login') {
        const returnTo = encodeURIComponent(`/squad-gathering/${sessionId}?autoCheckin=1`);
        return (
            <div className="min-h-screen bg-[#16213E] flex items-center justify-center p-6">
                <div className="w-full max-w-sm bg-[#1B2A4A] border border-[#253A5C] rounded-3xl p-6 text-center space-y-4">
                    <div className="text-4xl">🔐</div>
                    <h1 className="text-xl font-black text-[#F5C842]">請先登入</h1>
                    <p className="text-sm text-gray-400">登入後即可完成實體凝聚報到</p>
                    <Link
                        href={`/?returnTo=${returnTo}`}
                        className="block w-full py-3 bg-[#F5C842] text-[#16213E] font-black rounded-2xl"
                    >
                        前往登入
                    </Link>
                </div>
            </div>
        );
    }

    if (state.kind === 'error') {
        return (
            <div className="min-h-screen bg-[#16213E] flex items-center justify-center p-6">
                <div className="w-full max-w-sm bg-red-900/30 border border-red-500/30 rounded-3xl p-6 text-center space-y-3">
                    <AlertTriangle size={40} className="mx-auto text-red-400" />
                    <p className="font-bold text-white">{state.message}</p>
                    <Link
                        href="/"
                        className="inline-block px-6 py-2 bg-[#253A5C] text-white rounded-xl font-bold text-sm"
                    >
                        返回主頁
                    </Link>
                </div>
            </div>
        );
    }

    const ctx = state.kind === 'done' ? state.context : state.kind === 'ready' ? state.context : null;
    const session = ctx?.session;
    const attendees = ctx?.attendees ?? [];
    const teamCount = ctx?.teamMemberCount ?? 0;
    const hasCommandant = attendees.some(a => a.isCommandant);

    return (
        <div className="min-h-screen bg-[#16213E] flex flex-col items-center justify-center p-6">
            <div className="w-full max-w-sm space-y-5">
                {/* Session Info */}
                <div className="bg-[#1B2A4A] border border-[#253A5C] rounded-3xl p-6 text-center space-y-2">
                    <div className="text-4xl">🤝</div>
                    <h1 className="text-xl font-black text-[#F5C842]">小組凝聚（實體）</h1>
                    {session && (
                        <p className="text-sm text-gray-400">{session.teamName} · {session.gatheringDate}</p>
                    )}
                </div>

                {/* Scan Action / Done State */}
                {state.kind === 'done' ? (
                    <div className={`rounded-3xl p-6 text-center space-y-3 ${state.alreadyIn ? 'bg-blue-900/30 border border-blue-500/30' : 'bg-emerald-900/30 border border-emerald-500/30'}`}>
                        <CheckCircle2 size={48} className={`mx-auto ${state.alreadyIn ? 'text-blue-400' : 'text-emerald-400'}`} />
                        <p className="font-black text-white text-lg">
                            {state.alreadyIn ? '您已完成報到！' : '報到成功！'}
                        </p>
                        <p className="text-xs text-gray-400">
                            小隊長送出審核 → 大隊長核准後自動入帳
                        </p>
                    </div>
                ) : state.kind === 'scanning' ? (
                    <div className="bg-[#1B2A4A] border border-[#253A5C] rounded-3xl p-6 text-center">
                        <Loader2 size={32} className="mx-auto animate-spin text-[#F5C842]" />
                        <p className="mt-3 text-sm text-gray-400">報到中…</p>
                    </div>
                ) : (
                    <button
                        onClick={handleScan}
                        disabled={session?.status !== 'scheduled'}
                        className="w-full py-4 bg-[#F5C842] text-[#16213E] font-black rounded-2xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {session?.status === 'scheduled' ? '✓ 確認到場' : '此凝聚已結束'}
                    </button>
                )}

                {/* Progress */}
                {session && (
                    <div className="bg-[#1B2A4A] border border-[#253A5C] rounded-2xl p-4 space-y-3">
                        <div className="flex items-center gap-2 text-[#F5C842] font-black text-sm">
                            <Users size={16} />
                            出席進度 {attendees.length} / {teamCount}
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                            <Crown size={14} className={hasCommandant ? 'text-[#F5C842]' : 'text-gray-600'} />
                            <span className={hasCommandant ? 'text-[#F5C842] font-bold' : 'text-gray-500'}>
                                {hasCommandant ? '大隊長已到場（每人 +100）' : '等待大隊長出席'}
                            </span>
                        </div>
                        {attendees.length > 0 && (
                            <div className="pt-2 border-t border-[#253A5C] space-y-1">
                                {attendees.map(a => (
                                    <div key={a.userId} className="flex items-center gap-2 text-xs text-gray-300">
                                        <CheckCircle2 size={12} className="text-emerald-400" />
                                        <span>{a.userName ?? a.userId}</span>
                                        {a.isCommandant && <Crown size={10} className="text-[#F5C842]" />}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default function SquadGatheringPage({
    params,
}: {
    params: Promise<{ sessionId: string }>;
}) {
    const { sessionId } = use(params);
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-[#16213E] flex items-center justify-center">
                <Loader2 size={32} className="animate-spin text-[#F5C842]" />
            </div>
        }>
            <SquadGatheringContent sessionId={sessionId} />
        </Suspense>
    );
}
