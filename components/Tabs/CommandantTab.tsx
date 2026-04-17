'use client';

import React, { useState } from 'react';
import { CheckCircle2, XCircle, RefreshCw, Sword, Users, ChevronDown, ChevronUp, ScrollText } from 'lucide-react';
import { CharacterStats, BonusApplication, SquadMemberStats } from '@/types';
import { reviewBonusByAdmin } from '@/app/actions/bonus';

const ONE_TIME_QUEST_LABELS: Record<string, string> = {
    o1: '超越巔峰',
    o2_1: '戲劇進修－生命數字',
    o2_2: '戲劇進修－生命蛻變',
    o2_3: '戲劇進修－複訓大堂課',
    o2_4: '戲劇進修－告別負債&貧窮',
    o3: '聯誼會（1年）',
    o4: '聯誼會（2年）',
    o5: '報高階（訂金）',
    o6: '報高階（完款）',
    o7: '傳愛',
};

interface CommandantTabProps {
    userData: CharacterStats;
    apps: BonusApplication[];
    onRefresh: () => void;
    onShowMessage: (msg: string, type: 'success' | 'error' | 'info') => void;
    battalionMembers?: Record<string, SquadMemberStats[]>;
}

function isActive(lastCheckIn?: string): boolean {
    if (!lastCheckIn) return false;
    const nowTW = new Date(Date.now() + 8 * 3600 * 1000);
    const todayStr = nowTW.toISOString().slice(0, 10);
    const yest = new Date(nowTW);
    yest.setUTCDate(yest.getUTCDate() - 1);
    return lastCheckIn === todayStr || lastCheckIn === yest.toISOString().slice(0, 10);
}


export function CommandantTab({ userData, apps, onRefresh, onShowMessage, battalionMembers = {} }: CommandantTabProps) {
    const [reviewingId, setReviewingId] = useState<string | null>(null);
    const [notes, setNotes] = useState<Record<string, string>>({});
    const [expandedSquads, setExpandedSquads] = useState<Record<string, boolean>>({});

    const toggleSquad = (name: string) => setExpandedSquads(prev => ({ ...prev, [name]: !prev[name] }));
    const squadEntries = Object.entries(battalionMembers);

    const handleReview = async (appId: string, action: 'approve' | 'reject') => {
        setReviewingId(appId);
        try {
            const res = await reviewBonusByAdmin(appId, action, notes[appId] || '', userData.Name);
            if (res.success) {
                onShowMessage(
                    action === 'approve' ? '✅ 已核准入帳，積分已發放！' : '已駁回此申請。',
                    action === 'approve' ? 'success' : 'info'
                );
                onRefresh();
            } else {
                onShowMessage(res.error || '操作失敗', 'error');
            }
            if (res.warning) onShowMessage(res.warning, 'info');
        } catch (e: any) {
            onShowMessage('系統異常：' + e.message, 'error');
        } finally {
            setReviewingId(null);
        }
    };

    return (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="bg-gradient-to-br from-rose-50 to-white border-2 border-rose-200 rounded-4xl p-6 shadow-md">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2 text-rose-500 font-black text-sm uppercase mb-1 tracking-widest">
                            <Sword size={14} /> 大隊長指揮部
                        </div>
                        <h2 className="text-2xl font-black text-gray-900 italic">一次性任務終審</h2>
                        <p className="text-sm text-gray-500 mt-1">以下為已通過小隊長初審、待終審的一次性任務申請</p>
                    </div>
                    <button
                        onClick={onRefresh}
                        className="p-3 rounded-2xl bg-gray-100 text-gray-500 hover:text-gray-900 hover:bg-gray-200 active:scale-95 transition-all border border-gray-200"
                    >
                        <RefreshCw size={16} />
                    </button>
                </div>
            </div>

            {/* Battalion member overview */}
            {squadEntries.length > 0 && (
                <div className="bg-white border-2 border-rose-100 rounded-3xl p-5 space-y-4 shadow-md">
                    <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                        <Users size={15} className="text-rose-400" /> 各隊成員積分總覽
                    </h3>
                    <div className="space-y-3">
                        {squadEntries.map(([squadName, members]) => {
                            const activeCount = members.filter(m => isActive(m.lastCheckIn)).length;
                            const rate = members.length > 0 ? Math.round(activeCount / members.length * 100) : 0;
                            const rateColor = rate >= 70 ? 'text-emerald-600' : rate >= 40 ? 'text-amber-600' : 'text-red-500';
                            const rateBg = rate >= 70 ? 'bg-emerald-50' : rate >= 40 ? 'bg-amber-50' : 'bg-red-50';
                            const isOpen = expandedSquads[squadName];
                            return (
                                <div key={squadName} className="bg-gray-50 rounded-2xl overflow-hidden border border-gray-200">
                                    <button
                                        onClick={() => toggleSquad(squadName)}
                                        className="w-full flex items-center justify-between px-4 py-3 text-left active:bg-gray-100 transition-colors"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="font-black text-gray-900 text-base truncate">{squadName}</span>
                                            <span className={`text-sm font-black px-2 py-0.5 rounded-full ${rateColor} ${rateBg}`}>
                                                {activeCount}/{members.length} 活躍 · {rate}%
                                            </span>
                                        </div>
                                        {isOpen ? <ChevronUp size={14} className="text-gray-400 shrink-0" /> : <ChevronDown size={14} className="text-gray-400 shrink-0" />}
                                    </button>
                                    {isOpen && (
                                        <div className="px-4 pb-3 space-y-1.5 border-t border-gray-200 pt-2">
                                            {members.map(m => (
                                                <div key={m.UserID} className="flex items-center gap-2">
                                                    <span className="text-sm text-gray-900 font-bold flex-1 truncate">
                                                        {m.Name}
                                                        {m.IsCaptain && <span className="text-indigo-500 ml-1 text-sm">隊長</span>}
                                                    </span>
                                                    <span className="text-sm text-gray-400">{m.Score.toLocaleString()} 分</span>
                                                    {m.Streak > 0 && <span className="text-sm text-orange-400">🔥{m.Streak}</span>}
                                                    {isActive(m.lastCheckIn) ? (
                                                        <span className="text-sm font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full shrink-0">活躍</span>
                                                    ) : (
                                                        <span className="text-sm font-black text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full shrink-0">沉寂</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Application list */}
            {apps.length === 0 ? (
                <div className="bg-gray-50 border border-gray-200 rounded-3xl p-10 text-center">
                    <p className="text-gray-400 font-black text-sm">目前無待終審申請</p>
                    <p className="text-gray-300 text-xs mt-1">所有申請均已處理完畢</p>
                </div>
            ) : (
                <div className="flex flex-col gap-4">
                    {apps.map(app => (
                        <div key={app.id} className="bg-white border-2 border-rose-100 rounded-3xl p-5 space-y-4 shadow-md">
                            {/* App info */}
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="font-black text-gray-900 text-base">{app.user_name}</p>
                                    {ONE_TIME_QUEST_LABELS[app.quest_id] ? (
                                        <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1">
                                            <ScrollText size={10} className="text-amber-500 shrink-0" />
                                            {app.squad_name} · <span className="text-amber-600 font-bold">{ONE_TIME_QUEST_LABELS[app.quest_id]}</span>
                                            {app.interview_target && ` · ${app.interview_target}`}
                                        </p>
                                    ) : (
                                        <p className="text-sm text-gray-500 mt-0.5">
                                            {app.squad_name} · 訪談對象：<span className="text-rose-500">{app.interview_target}</span>
                                        </p>
                                    )}
                                    <p className="text-sm text-gray-400 mt-0.5">日期：{app.interview_date}</p>
                                    {app.squad_review_notes && (
                                        <p className="text-sm text-indigo-500 mt-1.5 bg-indigo-50 px-2 py-1 rounded-lg">
                                            劇組長備註：{app.squad_review_notes}
                                        </p>
                                    )}
                                    {app.description && (
                                        <p className="text-sm text-gray-500 italic mt-1.5">「{app.description}」</p>
                                    )}
                                </div>
                                <span className="shrink-0 text-sm font-black text-blue-500 bg-blue-50 px-2 py-1 rounded-lg">待終審</span>
                            </div>

                            {/* Notes */}
                            <textarea
                                placeholder="終審備註（選填）"
                                value={notes[app.id] || ''}
                                onChange={e => setNotes(prev => ({ ...prev, [app.id]: e.target.value }))}
                                rows={2}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-sm outline-none focus:border-rose-400 resize-none transition-colors"
                            />

                            {/* Actions */}
                            <div className="flex gap-3">
                                <button
                                    disabled={reviewingId === app.id}
                                    onClick={() => handleReview(app.id, 'reject')}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-black text-base text-red-500 bg-red-50 border border-red-200 active:scale-95 transition-all disabled:opacity-50"
                                >
                                    <XCircle size={14} /> 駁回
                                </button>
                                <button
                                    disabled={reviewingId === app.id}
                                    onClick={() => handleReview(app.id, 'approve')}
                                    className="flex-[2] flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-black text-base text-white bg-emerald-600 shadow-lg active:scale-95 transition-all disabled:opacity-50"
                                >
                                    <CheckCircle2 size={14} /> {reviewingId === app.id ? '處理中…' : '核准入帳'}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
