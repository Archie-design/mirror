'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2, Users, AlertTriangle } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { checkInToGathering } from '@/app/actions/squad-gathering';
import { SQUAD_THEME_CONFIG } from '@/lib/constants';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// gathering_id 格式：{themeId}|{teamName}|{YYYY-MM-DD}
function parseGatheringId(gid: string) {
    const parts = gid.split('|');
    return {
        themeId: parts[0] ?? '',
        teamName: parts[1] ?? '',
        date: parts[2] ?? '',
    };
}

function SquadCheckinContent() {
    const searchParams = useSearchParams();
    const gatheringId = searchParams.get('g') ?? '';
    const { themeId, teamName, date } = parseGatheringId(gatheringId);
    const theme = SQUAD_THEME_CONFIG.find(t => t.id === themeId);

    const [name, setName] = useState('');
    const [phoneSuffix, setPhoneSuffix] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
    const [message, setMessage] = useState('');
    const [alreadyIn, setAlreadyIn] = useState(false);

    const autoCheckin = async (userId: string) => {
        setStatus('loading');
        const { data: user } = await supabase
            .from('CharacterStats')
            .select('Name, TeamName')
            .eq('UserID', userId)
            .maybeSingle();
        if (!user) {
            setStatus('error');
            setMessage('查無此帳號，請確認是否已登入正確帳號。');
            return;
        }
        const res = await checkInToGathering(gatheringId, userId, user.Name);
        if (res.success) {
            setAlreadyIn(!!res.alreadyCheckedIn);
            setStatus('done');
            setMessage(res.alreadyCheckedIn ? '您已完成報到！' : `${user.Name} 報到成功！`);
        } else {
            setStatus('error');
            setMessage(res.error ?? '報到失敗');
        }
    };

    useEffect(() => {
        if (!gatheringId) return;
        // 若 URL 帶了 uid（從 LINE login 跳回），直接嘗試報到
        const params = new URLSearchParams(window.location.search);
        const uid = params.get('uid');
        if (uid) autoCheckin(uid);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gatheringId]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || phoneSuffix.length !== 3) return;
        setStatus('loading');

        const { data: allUsers } = await supabase
            .from('CharacterStats')
            .select('UserID, Name, TeamName');

        const match = (allUsers ?? []).find(
            (u: { UserID: string; Name: string; TeamName?: string }) =>
                u.Name === name.trim() && u.UserID.endsWith(phoneSuffix)
        );

        if (!match) {
            setStatus('error');
            setMessage('查無此成員，請確認姓名與手機末3碼是否正確。');
            return;
        }

        const res = await checkInToGathering(gatheringId, match.UserID, match.Name);
        if (res.success) {
            setAlreadyIn(!!res.alreadyCheckedIn);
            setStatus('done');
            setMessage(res.alreadyCheckedIn ? '您已完成報到！' : `${match.Name} 報到成功！`);
        } else {
            setStatus('error');
            setMessage(res.error ?? '報到失敗');
        }
    };

    if (!gatheringId || !theme) {
        return (
            <div className="min-h-screen bg-[#16213E] flex items-center justify-center p-6">
                <div className="text-center text-gray-400 space-y-2">
                    <AlertTriangle size={40} className="mx-auto text-yellow-500" />
                    <p className="font-bold text-white">無效的定聚連結</p>
                    <p className="text-sm">請向小隊長重新取得 QR Code。</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#16213E] flex flex-col items-center justify-center p-6">
            <div className="w-full max-w-sm space-y-6">
                {/* 定聚資訊 */}
                <div className="bg-[#1B2A4A] border border-[#253A5C] rounded-3xl p-6 text-center space-y-2">
                    <div className="text-4xl">{theme.icon}</div>
                    <h1 className="text-xl font-black text-[#F5C842]">{theme.title} 主題定聚</h1>
                    <p className="text-sm text-gray-400">{teamName} · {date}</p>
                    <p className="text-xs text-gray-500">{theme.attr}</p>
                </div>

                {status === 'done' ? (
                    <div className={`rounded-3xl p-8 text-center space-y-3 ${alreadyIn ? 'bg-blue-900/30 border border-blue-500/30' : 'bg-emerald-900/30 border border-emerald-500/30'}`}>
                        <CheckCircle2 size={48} className={`mx-auto ${alreadyIn ? 'text-blue-400' : 'text-emerald-400'}`} />
                        <p className="font-black text-white text-lg">{message}</p>
                        <p className="text-sm text-gray-400">小隊長可在導演報表查看到場名單。</p>
                    </div>
                ) : status === 'error' ? (
                    <div className="bg-red-900/30 border border-red-500/30 rounded-3xl p-6 text-center space-y-3">
                        <AlertTriangle size={40} className="mx-auto text-red-400" />
                        <p className="font-bold text-white">{message}</p>
                        <button
                            onClick={() => setStatus('idle')}
                            className="px-6 py-2 bg-[#253A5C] text-white rounded-xl font-bold text-sm"
                        >
                            重試
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="bg-[#1B2A4A] border border-[#253A5C] rounded-3xl p-6 space-y-4">
                        <div className="flex items-center gap-2 text-[#F5C842] font-black text-sm mb-2">
                            <Users size={16} />
                            掃碼報到
                        </div>
                        <div className="space-y-3">
                            <input
                                type="text"
                                required
                                placeholder="姓名"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                className="w-full bg-[#16213E] border border-[#253A5C] rounded-xl px-4 py-3 text-white font-bold outline-none focus:border-[#F5C842] placeholder:text-gray-600"
                            />
                            <input
                                type="tel"
                                required
                                maxLength={3}
                                placeholder="手機末3碼"
                                value={phoneSuffix}
                                onChange={e => setPhoneSuffix(e.target.value.replace(/\D/g, '').slice(0, 3))}
                                className="w-full bg-[#16213E] border border-[#253A5C] rounded-xl px-4 py-3 text-white font-bold outline-none focus:border-[#F5C842] placeholder:text-gray-600"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={status === 'loading' || name.trim().length === 0 || phoneSuffix.length !== 3}
                            className="w-full py-3.5 bg-[#F5C842] text-[#16213E] font-black rounded-2xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {status === 'loading' ? <Loader2 size={18} className="animate-spin" /> : null}
                            我到了，報到！
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}

export default function SquadCheckinPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-[#16213E] flex items-center justify-center">
                <Loader2 size={32} className="animate-spin text-[#F5C842]" />
            </div>
        }>
            <SquadCheckinContent />
        </Suspense>
    );
}
