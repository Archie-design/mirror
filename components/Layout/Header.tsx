import React from 'react';
import { LogOut } from 'lucide-react';
import { CharacterStats } from '@/types';
import { ROLE_CURE_MAP } from '@/lib/constants';

interface HeaderProps {
    userData: CharacterStats | null;
    onLogout: () => void;
}

export function Header({ userData, onLogout }: HeaderProps) {
    return (
        <header className="p-8 bg-slate-900 border-b border-white/10 flex items-center gap-6 relative justify-center">
            <button
                onClick={onLogout}
                className="absolute top-6 right-6 bg-slate-950/50 border border-white/5 p-2 rounded-xl text-slate-600 hover:text-red-400">
                <LogOut size={20} />
            </button>

            <div className="relative shrink-0 mx-auto text-center">
                <div className="w-24 h-24 bg-orange-600 rounded-4xl flex items-center justify-center text-white text-5xl font-black shadow-lg mx-auto">
                    {userData?.Name?.[0]}
                </div>
                <div className="absolute -bottom-2 -right-2 bg-yellow-500 text-slate-950 text-[10px] font-black px-2 py-1 rounded-full border-4 border-slate-900">
                    LV.{userData?.Level}
                </div>
            </div>

            <div className="flex-1 text-left">
                <div className="flex items-center gap-2 mb-1">
                    <h1 className="text-3xl font-black text-white">{userData?.Name}</h1>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-black text-white ${userData ? ROLE_CURE_MAP[userData.Role]?.color : ''}`}>
                        {userData ? ROLE_CURE_MAP[userData.Role]?.poison : ''}
                    </span>
                </div>
                <p className="text-xs text-slate-500 font-bold mb-3 uppercase tracking-widest italic">{userData?.Role} 模組修行中</p>
                <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden border border-white/5">
                    <div className="h-full bg-orange-500 shadow-inner" style={{ width: `${((userData?.Exp || 0) % 1000) / 10}%` }}></div>
                </div>
            </div>
        </header>
    );
}
