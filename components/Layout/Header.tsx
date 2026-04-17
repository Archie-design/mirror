import { LogOut } from 'lucide-react';
import { CharacterStats } from '@/types';
import { YellowBrickDivider } from '@/components/ui/FilmIcons';
import { FORTUNE_COMPANIONS } from '@/components/Login/RegisterForm';

interface HeaderProps {
    userData: CharacterStats | null;
    onLogout: () => void;
    companionType?: string;
}

export function Header({ userData, onLogout, companionType }: HeaderProps) {
    const companion = companionType
        ? FORTUNE_COMPANIONS.find(f => f.companion === companionType)
        : null;

    return (
        <header className="bg-[#1A6B4A] border-b border-[#0F4A30]">
        <YellowBrickDivider className="text-[#F5C842]" />
        <div className="px-6 py-5 flex items-center gap-4 relative">
            <div className="relative shrink-0">
                <div className="w-16 h-16 bg-[#C0392B] rounded-3xl flex items-center justify-center text-white text-3xl font-black shadow-lg">
                    {userData?.Name?.[0]}
                </div>
            </div>

            <div className="flex-1 min-w-0 pr-12">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <h1 className="text-xl font-black text-white truncate">{userData?.Name}</h1>
                    <div className="bg-[#F5C842]/20 border border-[#F5C842]/40 px-2 py-0.5 rounded-lg shrink-0">
                        <span className="text-sm font-black text-[#F5C842]">積分累積中</span>
                    </div>
                </div>
                {companion && (
                    <div className="flex mb-0.5">
                        <span className="text-xs font-black text-white px-2 py-0.5 rounded-lg"
                            style={{ background: companion.color === '#1A6B4A' ? '#2E8B5A' : companion.color }}>
                            {companion.name}
                        </span>
                    </div>
                )}
                <p className="text-sm text-yellow-300/60 font-black uppercase tracking-[0.25em] mb-1">你的黃磚路</p>
                <div className="flex justify-between items-end">
                    <p className="text-sm text-white/60 font-bold uppercase tracking-widest italic truncate">{userData?.SquadName} 小隊</p>
                    <p className="text-base text-yellow-200 font-mono tracking-tighter shrink-0">
                        {(userData?.Score ?? 0).toLocaleString()} 分
                    </p>
                </div>
            </div>

            <button
                onClick={onLogout}
                aria-label="登出"
                className="absolute top-1/2 -translate-y-1/2 right-6 bg-[#0F4A30] border border-[#0F4A30] p-2.5 rounded-xl text-white/60 hover:text-red-300 hover:border-red-400/40 transition-all duration-150 cursor-pointer active:scale-95 shadow-md">
                <LogOut size={18} />
            </button>
        </div>
        <YellowBrickDivider className="text-[#F5C842]" />
        </header>
    );
}
