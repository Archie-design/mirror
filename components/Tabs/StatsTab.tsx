import React from 'react';
import { Skull, Cake } from 'lucide-react';
import { CharacterStats } from '@/types';

interface StatsTabProps {
    userData: CharacterStats;
}

export function StatsTab({ userData }: StatsTabProps) {

    const displayAge = userData.Birthday
        ? Math.floor((Date.now() - new Date(userData.Birthday).getTime()) / (365.25 * 24 * 3600 * 1000))
        : null;

    return (
        <div className="space-y-8 animate-in zoom-in-95 duration-500 mx-auto text-center">
            <div className="grid grid-cols-1 gap-4">
                <div className="bg-gradient-to-br from-[#E50914]/20 to-[#111] border-2 border-[#333] p-6 rounded-[2.5rem] shadow-2xl text-center flex flex-col items-center justify-center">
                    <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center mb-2 mx-auto"><Skull className="text-[#E50914]" size={16} /></div>
                    <span className="text-4xl font-black text-white mb-1">
                        {Math.max(0, (userData.TotalFines || 0) - (userData.FinePaid || 0))}
                    </span>
                    <p className="text-[10px] text-gray-500 font-black uppercase tracking-[0.2em]">罰金餘額</p>
                    <p className="text-[9px] text-gray-600 mt-1">
                        累計 NT${userData.TotalFines || 0}　已繳 NT${userData.FinePaid || 0}
                    </p>
                </div>

            </div>

            {/* Birthday card — read-only, set by admin via roster import */}
            <div className="bg-[#111] border-2 border-[#333] p-5 rounded-[2.5rem] shadow-xl text-left">
                <div className="flex items-center gap-2 mb-3">
                    <Cake size={16} className="text-pink-400" />
                    <span className="text-[10px] font-black text-gray-500 tracking-widest uppercase ml-1">生日驗證 (VIP禮遇資格)</span>
                </div>
                <span className="text-white font-bold">
                    {userData.Birthday
                        ? `${userData.Birthday}（${displayAge} 歲）`
                        : <span className="text-gray-500">尚未設定</span>}
                </span>
            </div>

        </div>
    );
}
