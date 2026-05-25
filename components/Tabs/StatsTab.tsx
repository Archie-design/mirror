import React from 'react';
import { Star } from 'lucide-react';
import { CharacterStats, BonusApplication } from '@/types';
import { BonusQuestsSection } from '@/components/Tabs/BonusQuestsSection';
import { HeartActivityCard } from '@/components/Tabs/HeartActivityCard';
import { MyGatheringHistorySection } from '@/components/Tabs/MyGatheringHistorySection';

interface StatsTabProps {
    userData: CharacterStats;
    myBonusApps: BonusApplication[];
    onBonusRefresh: () => Promise<void> | void;
}

export function StatsTab({ userData, myBonusApps, onBonusRefresh }: StatsTabProps) {
    const refresh = async () => { await onBonusRefresh(); };
    return (
        <div className="space-y-8 animate-in zoom-in-95 duration-500 mx-auto text-center">
            <div className="grid grid-cols-1 gap-4">
                <div className="bg-white border-2 border-[#B2DFC0] p-6 rounded-[2.5rem] shadow-md text-center flex flex-col items-center justify-center">
                    <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center mb-2 mx-auto"><Star className="text-amber-400" size={16} /></div>
                    <span className="text-4xl font-black text-[#1A2A1A] mb-1">
                        {(userData.Score || 0).toLocaleString()}
                    </span>
                    <p className="text-sm text-gray-400 font-black uppercase tracking-[0.2em]">累積積分</p>
                    {userData.Streak > 0 && (
                        <p className="text-sm text-orange-400 mt-1 font-bold">
                            🔥 連續打卡 {userData.Streak} 天
                        </p>
                    )}
                </div>

            </div>

            <BonusQuestsSection
                userData={userData}
                myApplications={myBonusApps}
                onRefresh={onBonusRefresh}
            />

            {/* ── 心成活動（一級審核 + 可申請多次） ── */}
            <section className="space-y-3 text-left">
                <h2 className="text-sm font-black text-gray-500 uppercase tracking-widest px-1 text-center">💛 心成活動</h2>
                <HeartActivityCard
                    userData={userData}
                    myApps={myBonusApps}
                    onRefresh={refresh}
                />
            </section>

            {/* ── 我的實體凝聚紀錄（含補報） ── */}
            <section className="space-y-3 text-left">
                <h2 className="text-sm font-black text-gray-500 uppercase tracking-widest px-1 text-center">🎯 我的實體凝聚紀錄</h2>
                <MyGatheringHistorySection userId={userData.UserID} />
            </section>
        </div>
    );
}
