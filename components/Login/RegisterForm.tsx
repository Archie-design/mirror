'use client';
import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { SunflowerIcon, StarWandIcon } from '@/components/ui/FilmIcons';

function sliderStyle(value: number, color: string): React.CSSProperties {
    const pct = ((value - 1) / 9) * 100;
    return {
        accentColor: color,
        background: `linear-gradient(to right, ${color} 0%, ${color} ${pct}%, #D1EAD9 ${pct}%, #D1EAD9 100%)`,
    };
}

export const FORTUNE_COMPANIONS = [
    { key: 'career',       dbCol: 'Score_事業運', companion: '事業運' as const, name: '小草', color: '#27AE60', desc: '事業・工作' },
    { key: 'wealth',       dbCol: 'Score_財富運', companion: '財富運' as const, name: '小獅', color: '#F39C12', desc: '財富・金錢' },
    { key: 'relationship', dbCol: 'Score_情感運', companion: '情感運' as const, name: '小鐵', color: '#95A5A6', desc: '情感・人際' },
    { key: 'family',       dbCol: 'Score_家庭運', companion: '家庭運' as const, name: '翡翠城', color: '#1A6B4A', desc: '家庭・根源' },
    { key: 'health',       dbCol: 'Score_體能運', companion: '體能運' as const, name: '小桃', color: '#5DADE2', desc: '體能・健康' },
] as const;

export function getLowestFortune(scores: Record<string, number>) {
    return FORTUNE_COMPANIONS.reduce((lowest, f) =>
        scores[f.key] < scores[lowest.key] ? f : lowest
    , FORTUNE_COMPANIONS[0]);
}

interface RegisterFormProps {
    onRegister: (data: any) => void;
    onGoToLogin: () => void;
    isSyncing: boolean;
}

export function RegisterForm({ onRegister, onGoToLogin, isSyncing }: RegisterFormProps) {
    const [step, setStep] = useState<1 | 2>(1);
    const [formData, setFormData] = useState({ name: '', phone: '', email: '' });
    const [fortunes, setFortunes] = useState<Record<string, number>>({
        career: 5, wealth: 5, relationship: 5, family: 5, health: 5,
    });

    const handleNext = (e: React.FormEvent) => {
        e.preventDefault();
        if (formData.name && formData.phone) setStep(2);
    };

    const handleFinalSubmit = () => {
        onRegister({ ...formData, fortunes });
    };

    return (
        <div className="min-h-screen flex flex-col items-center py-10 px-6 overflow-y-auto"
            style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, #C8EDD5 0%, #E8F5EC 40%, #FFFEF5 100%)' }}>

            <div className="w-full max-w-md animate-fade-up">

                {/* Logo */}
                <div className="flex justify-center mb-6">
                    <div className="relative">
                        <SunflowerIcon size={80} className="text-[#F5C842]/60" />
                        <StarWandIcon size={36} className="text-[#1A6B4A] absolute bottom-0 right-0" />
                    </div>
                </div>

                <h1 className="font-display text-3xl font-black text-[#1A2A1A] mb-1 text-center tracking-wide">初次踏上旅途</h1>
                <p className="text-sm text-[#5A7A5A] font-bold tracking-widest text-center mb-8">
                    {step === 1 ? '第一步：旅人資料' : '第二步：找到你的旅伴'}
                </p>

                {step === 1 ? (
                    <form onSubmit={handleNext} className="space-y-4">
                        <input
                            required
                            type="text"
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            className="w-full bg-white/80 backdrop-blur-sm border-2 border-[#B2DFC0] rounded-2xl px-6 py-5 text-[#1A2A1A] text-xl font-bold outline-none focus:border-[#1A6B4A] transition-colors placeholder:text-gray-400"
                            placeholder="旅人姓名"
                        />
                        <input
                            required
                            type="text"
                            inputMode="numeric"
                            maxLength={10}
                            value={formData.phone}
                            onChange={e => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '') })}
                            className="w-full bg-white/80 backdrop-blur-sm border-2 border-[#B2DFC0] rounded-2xl px-6 py-5 text-[#1A2A1A] text-xl font-bold outline-none focus:border-[#1A6B4A] transition-colors placeholder:text-gray-400"
                            placeholder="聯絡電話"
                        />
                        <input
                            type="email"
                            value={formData.email}
                            onChange={e => setFormData({ ...formData, email: e.target.value })}
                            className="w-full bg-white/80 backdrop-blur-sm border-2 border-[#B2DFC0] rounded-2xl px-6 py-5 text-[#1A2A1A] text-xl font-bold outline-none focus:border-[#1A6B4A] transition-colors placeholder:text-gray-400"
                            placeholder="Email（選填，用於小隊綁定）"
                        />
                        <button
                            type="submit"
                            className="w-full py-5 rounded-2xl bg-[#1A6B4A] text-white font-black text-xl shadow-lg hover:bg-[#145A3A] active:scale-95 transition-all flex items-center justify-center gap-2 mt-2"
                        >
                            下一步 <ChevronRight size={20} />
                        </button>
                    </form>
                ) : (
                    <div className="space-y-5">
                        <div className="bg-[#F5C842]/10 border border-[#F5C842]/40 rounded-2xl p-4 text-sm text-[#5A7A5A] font-bold leading-relaxed">
                            請憑直覺為目前各運勢狀態評分（1分為最需突破，10分為最滿意）。
                            系統將自動為你找到最需要同行的旅伴。
                        </div>

                        <div className="space-y-3 bg-white/60 backdrop-blur-sm p-5 rounded-3xl border border-[#B2DFC0]">
                            {FORTUNE_COMPANIONS.map(f => (
                                <div key={f.key} className="space-y-2 rounded-2xl p-3">
                                    <div className="flex justify-between items-center">
                                        <span className="font-black text-[#1A2A1A] text-sm">{f.companion}</span>
                                        <span className="font-black text-base px-3 py-1 rounded-xl min-w-[52px] text-center" style={{ color: f.color, background: `${f.color}20` }}>
                                            {fortunes[f.key]} 分
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-[#5A7A5A] font-bold">{f.desc}</p>
                                    <div className="relative py-1">
                                        <input
                                            type="range" min="1" max="10" step="1"
                                            value={fortunes[f.key]}
                                            onChange={e => setFortunes({ ...fortunes, [f.key]: parseInt(e.target.value, 10) })}
                                            className="w-full h-4 rounded-full appearance-none cursor-pointer"
                                            style={sliderStyle(fortunes[f.key], f.color)}
                                        />
                                    </div>
                                    <div className="flex justify-between text-[10px] text-[#5A7A5A]/50 font-bold px-0.5">
                                        <span>1（最需突破）</span>
                                        <span>10（大滿貫）</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setStep(1)}
                                className="px-5 py-4 rounded-2xl bg-white border-2 border-[#B2DFC0] text-[#5A7A5A] font-black text-sm hover:bg-gray-50 transition-colors"
                            >
                                返回
                            </button>
                            <button
                                onClick={handleFinalSubmit}
                                disabled={isSyncing}
                                className="flex-1 py-4 rounded-2xl bg-[#C0392B] text-white font-black text-lg shadow-lg hover:bg-[#A93226] active:scale-95 transition-all disabled:opacity-50"
                            >
                                {isSyncing ? '旅程啟動中…' : '完成評分，踏上旅程'}
                            </button>
                        </div>
                    </div>
                )}

                {step === 1 && (
                    <button
                        type="button"
                        onClick={onGoToLogin}
                        className="w-full text-[#5A7A5A] text-sm font-bold hover:text-[#1A6B4A] transition-colors mt-8"
                    >
                        已有帳號？返回登入
                    </button>
                )}
            </div>
        </div>
    );
}
