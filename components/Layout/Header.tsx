import React from 'react';
import { LogOut } from 'lucide-react';
import { CharacterStats } from '@/types';
import { getExpForNextLevel } from '@/lib/constants';

interface HeaderProps {
    userData: CharacterStats | null;
    onLogout: () => void;
}

export function Header({ userData, onLogout }: HeaderProps) {
    let progressPercent = 0;
    let expInCurrentLevel = 0;
    let nextLevelExp = 0;

    if (userData) {
        let accumulatedExp = 0;
        for (let i = 1; i < userData.Level; i++) {
            accumulatedExp += i * 5 + 480;
        }
        expInCurrentLevel = userData.Exp - accumulatedExp;
        nextLevelExp = getExpForNextLevel(userData.Level);
        progressPercent = userData.Level >= 99 ? 100 : Math.min(100, Math.max(0, (expInCurrentLevel / nextLevelExp) * 100));
    }

    return (
        <header className="px-6 py-6 bg-black border-b border-[#1a1a1a] flex items-center gap-4 relative">
            {/* 登出按鈕移至右側 Flex 容器中而非 absolute，避免覆蓋標籤 */}
            <div className="relative shrink-0">
                <div className="w-16 h-16 bg-orange-600 rounded-3xl flex items-center justify-center text-white text-3xl font-black shadow-lg">
                    {userData?.Name?.[0]}
                </div>
                <div className="absolute -bottom-1 -right-1 bg-yellow-500 text-black text-[9px] font-black px-1.5 py-0.5 rounded-full border-2 border-black">
                    LV.{userData?.Level}
                </div>
            </div>

            <div className="flex-1 min-w-0 pr-12"> {/* 預留右側空間給按鈕 */}
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h1 className="text-xl font-black text-white truncate">{userData?.Name}</h1>
                    <div className="bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-lg shrink-0">
                        <span className="text-[9px] font-black text-orange-400">票房累積中</span>
                    </div>
                </div>
                <div className="flex justify-between items-end mb-1.5">
                    <p className="text-[9px] text-[rgba(255,255,255,0.35)] font-bold uppercase tracking-widest italic truncate">{userData?.SquadName} 劇組</p>
                    <p className="text-[10px] text-[rgba(255,255,255,0.45)] font-mono tracking-tighter mix-blend-screen shrink-0">{userData?.Level! >= 99 ? 'MAX' : `${expInCurrentLevel} / ${nextLevelExp} 票房`}</p>
                </div>
                <div className="w-full bg-[#1a1a1a] h-1.5 rounded-full overflow-hidden border border-[#2a2a2a] relative shadow-inner">
                    <div
                        className="h-full bg-gradient-to-r from-orange-500 to-yellow-400 shadow-[0_0_10px_rgba(249,115,22,0.5)] transition-all duration-1000"
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>
            </div>

            <button
                onClick={onLogout}
                aria-label="登出"
                className="absolute top-1/2 -translate-y-1/2 right-6 bg-[#111] border border-[#2a2a2a] p-2.5 rounded-xl text-[rgba(255,255,255,0.35)] hover:text-red-400 hover:border-red-900/40 transition-all duration-150 cursor-pointer active:scale-95 shadow-md">
                <LogOut size={18} />
            </button>
        </header>
    );
}
