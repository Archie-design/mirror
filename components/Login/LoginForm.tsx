import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { UserPlus } from 'lucide-react';
import { SunflowerIcon, EmeraldCastleIcon, RainbowIcon, RubySlipperIcon, StarWandIcon, HeartGlowIcon } from '@/components/ui/FilmIcons';

const OZ_TIERS = [
    { minScore: 18000, src: '/icons/oz-4-mirror.png',  label: '合・鏡中自照' },
    { minScore:  9000, src: '/icons/oz-3-wizard.png',  label: '轉・大法師顯靈' },
    { minScore:  3000, src: '/icons/oz-2-journey.png', label: '承・旅伴同行' },
    { minScore:     0, src: '/icons/oz-1-start.png',   label: '起・踏上旅程' },
] as const;

function getOzTier(score: number) {
    return OZ_TIERS.find(t => score >= t.minScore) ?? OZ_TIERS[3];
}

function LineIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
        </svg>
    );
}

interface LoginFormProps {
    onLogin: (e: React.FormEvent<HTMLFormElement>) => void;
    onGoToRegister: () => void;
    onGoToAdmin: () => void;
    isSyncing: boolean;
}

export function LoginForm({ onLogin, onGoToRegister, onGoToAdmin, isSyncing }: LoginFormProps) {
    const [tier, setTier] = useState<typeof OZ_TIERS[number]>(OZ_TIERS[3]);

    useEffect(() => {
        const stored = Number(localStorage.getItem('oz_score') ?? 0);
        setTier(getOzTier(stored));
    }, []);

    return (
        <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10 space-y-8 relative overflow-hidden"
            style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, #C8EDD5 0%, #E8F5EC 40%, #FFFEF5 100%)' }}>

            {/* 背景光暈層 */}
            <div className="pointer-events-none absolute inset-0" aria-hidden="true">
                <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-[#F5C842]/[0.08] blur-3xl" />
                <div className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full bg-[#1A6B4A]/[0.06] blur-3xl" />
            </div>

            {/* 浮動 OZ 圖示 */}
            <div className="pointer-events-none select-none absolute inset-0 overflow-hidden" aria-hidden="true">
                <div className="animate-float-slow absolute -top-10 -left-10" style={{ animationDelay: '0s' }}>
                    <SunflowerIcon size={160} strokeWidth={0.9} className="text-[#F5C842]/[0.18] rotate-12" />
                </div>
                <div className="animate-float absolute top-8 -right-8" style={{ animationDelay: '1.5s' }}>
                    <EmeraldCastleIcon size={130} strokeWidth={0.9} className="text-[#1A6B4A]/[0.12] -rotate-6" />
                </div>
                <div className="animate-float-slow absolute -bottom-8 -left-6" style={{ animationDelay: '3s' }}>
                    <RainbowIcon size={150} strokeWidth={0.9} className="text-[#F5C842]/[0.20] rotate-3" />
                </div>
                <div className="animate-float absolute bottom-20 -right-4" style={{ animationDelay: '0.8s' }}>
                    <RubySlipperIcon size={120} strokeWidth={0.9} className="text-[#C0392B]/[0.12] -rotate-8" />
                </div>
                <div className="animate-float-slow absolute top-1/3 right-1/4" style={{ animationDelay: '2s' }}>
                    <StarWandIcon size={90} strokeWidth={0.9} className="text-[#F5C842]/[0.14] rotate-20" />
                </div>
                <div className="animate-float absolute top-1/2 left-1/5" style={{ animationDelay: '4s' }}>
                    <HeartGlowIcon size={100} strokeWidth={0.9} className="text-[#1A6B4A]/[0.10] -rotate-12" />
                </div>
            </div>

            {/* Logo 徽章 */}
            <div className="animate-fade-up text-center mx-auto relative z-10">
                <div className="w-[236px] h-[236px] mx-auto mb-5 drop-shadow-2xl rounded-[2rem]">
                    <div className="w-full h-full relative rounded-[2rem] overflow-hidden bg-[#1B3A1E]">
                        <Image src={tier.src} alt={tier.label} fill sizes="236px" className="object-contain scale-[1.06]" priority />
                    </div>
                </div>
                <h1 className="font-display text-2xl md:text-3xl font-black text-[#1A2A1A] mb-1 tracking-wide">覺醒開運親證班</h1>
                <p className="text-base text-[#5A7A5A] font-bold tracking-[0.3em]">你的黃磚路</p>
                <p className="text-base text-[#F5C842] font-bold tracking-widest mt-0.5">{tier.label}</p>
            </div>

            {/* 表單 */}
            <form onSubmit={onLogin} className="w-full max-w-sm space-y-4 mx-auto text-center relative z-10">
                <div className="animate-fade-up delay-100">
                    <input
                        name="name"
                        required
                        className="w-full bg-white/80 backdrop-blur-sm border-2 border-[#B2DFC0] rounded-2xl px-6 py-5 text-[#1A2A1A] text-center text-xl outline-none focus:border-[#1A6B4A] focus:bg-white font-bold placeholder:text-gray-400 shadow-sm transition-all duration-200"
                        placeholder="旅人姓名"
                    />
                </div>
                <div className="animate-fade-up delay-200">
                    <input
                        name="phone"
                        required
                        type="password"
                        maxLength={3}
                        inputMode="numeric"
                        className="w-full bg-white/80 backdrop-blur-sm border-2 border-[#B2DFC0] rounded-2xl px-6 py-5 text-[#1A2A1A] text-center text-xl outline-none focus:border-[#1A6B4A] focus:bg-white font-bold placeholder:text-gray-400 shadow-sm transition-all duration-200"
                        placeholder="手機末三碼"
                    />
                </div>
                <div className="animate-fade-up delay-300">
                    <button
                        disabled={isSyncing}
                        className="w-full py-6 rounded-4xl bg-[#C0392B] text-white font-black text-2xl shadow-xl active:scale-95 transition-all duration-200 hover:bg-[#A93226] hover:shadow-2xl disabled:opacity-60"
                        style={{ boxShadow: '0 4px 20px rgba(192,57,43,0.4)' }}
                    >
                        {isSyncing ? '旅程啟動中…' : '踏上旅程'}
                    </button>
                </div>

                <div className="animate-fade-up delay-400 flex flex-col gap-4 pt-1">
                    <div className="relative flex items-center gap-3">
                        <div className="flex-1 h-px bg-[#B2DFC0]" />
                        <span className="text-[#5A7A5A] text-xs font-bold shrink-0">或</span>
                        <div className="flex-1 h-px bg-[#B2DFC0]" />
                    </div>
                    <a
                        href="/api/auth/line?action=login"
                        className="w-full flex items-center justify-center gap-3 py-5 rounded-2xl bg-[#06C755] text-white font-black text-xl shadow-lg active:scale-95 transition-all duration-200 hover:brightness-105"
                    >
                        <LineIcon /> LINE 帳號登入
                    </a>
                </div>

                <div className="animate-fade-up delay-500 flex flex-col gap-3 pt-1">
                    <button
                        type="button"
                        onClick={onGoToRegister}
                        className="text-[#5A7A5A] text-sm font-bold hover:text-[#1A6B4A] transition-colors flex items-center justify-center gap-1.5 mx-auto"
                    >
                        <UserPlus size={16} /> 初次踏上旅途？
                    </button>
                    <button
                        type="button"
                        onClick={onGoToAdmin}
                        className="text-[#B2DFC0] text-[10px] font-bold uppercase tracking-[0.3em] hover:text-[#1A6B4A] transition-colors"
                    >
                        大會中樞入口
                    </button>
                </div>
            </form>
        </div>
    );
}
