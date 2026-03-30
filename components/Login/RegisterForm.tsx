import React, { useState } from 'react';
import { UserPlus, Star, ChevronRight, AlertCircle } from 'lucide-react';

interface RegisterFormProps {
    onRegister: (data: any) => void;
    onGoToLogin: () => void;
    isSyncing: boolean;
}

const FIVE_FORTUNES = [
    { key: 'career', label: '事業運', desc: '事業成就感與人生方向的清晰度' },
    { key: 'wealth', label: '金錢運', desc: '財富豐盛度與對金錢的掌控感' },
    { key: 'relationship', label: '感情運', desc: '人際關係的和諧與情感連結深度' },
    { key: 'family', label: '家庭運', desc: '與家人之間的情感圓滿與支持度' },
    { key: 'health', label: '身體運', desc: '身體健康與精神活力的充沛程度' },
];

export function RegisterForm({ onRegister, onGoToLogin, isSyncing }: RegisterFormProps) {
    const [step, setStep] = useState<1 | 2>(1);
    const [formData, setFormData] = useState({ name: '', phone: '', email: '' });
    const [fortunes, setFortunes] = useState<Record<string, number>>({
        wealth: 5, relationship: 5, family: 5, career: 5, health: 5
    });

    const handleNext = (e: React.FormEvent) => {
        e.preventDefault();
        if (formData.name && formData.phone) {
            setStep(2);
        }
    };

    const handleFinalSubmit = () => {
        onRegister({ ...formData, fortunes });
    };

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center py-10 px-6 overflow-y-auto">
            <div className="animate-in slide-in-from-bottom-4 duration-700 w-full max-w-md">

                <div className="flex justify-center mb-8">
                    <div className="w-24 h-24 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl flex items-center justify-center shadow-[0_0_40px_rgba(99,102,241,0.3)] border-2 border-white/10">
                        <Star className="text-white" size={40} />
                    </div>
                </div>

                <h1 className="text-3xl font-black text-white mb-2 text-center uppercase tracking-widest">角色甄選</h1>
                <p className="text-indigo-400 text-sm font-bold tracking-widest text-center mb-10">
                    {step === 1 ? '第一幕：演員登記' : '第二幕：內在勘景'}
                </p>

                {step === 1 ? (
                    <form onSubmit={handleNext} className="space-y-5">
                        <input
                            required
                            type="text"
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            className="w-full bg-slate-900 border-2 border-white/5 rounded-2xl p-5 text-white text-lg font-bold outline-none focus:border-indigo-500 transition-colors"
                            placeholder="演員姓名"
                        />
                        <input
                            required
                            type="text"
                            inputMode="numeric"
                            maxLength={10}
                            value={formData.phone}
                            onChange={e => setFormData({ ...formData, phone: e.target.value.replace(/\\D/g, '') })}
                            className="w-full bg-slate-900 border-2 border-white/5 rounded-2xl p-5 text-white text-lg font-bold outline-none focus:border-indigo-500 transition-colors"
                            placeholder="聯絡電話"
                        />
                        <input
                            type="email"
                            value={formData.email}
                            onChange={e => setFormData({ ...formData, email: e.target.value })}
                            className="w-full bg-slate-900 border-2 border-white/5 rounded-2xl p-5 text-white text-lg font-bold outline-none focus:border-indigo-500 transition-colors"
                            placeholder="Email (選填，用於劇組綁定)"
                        />

                        <button type="submit" className="w-full py-5 rounded-2xl bg-indigo-600 text-white font-black text-xl shadow-lg hover:bg-indigo-500 active:scale-95 transition-all flex items-center justify-center gap-2 mt-4">
                            下一步 <ChevronRight size={20} />
                        </button>
                    </form>
                ) : (
                    <div className="space-y-6">
                        <div className="bg-indigo-950/40 p-4 rounded-2xl border border-indigo-500/20 flex items-start gap-3">
                            <AlertCircle className="text-indigo-400 shrink-0 mt-0.5" size={18} />
                            <p className="text-xs text-indigo-200 leading-relaxed font-bold">
                                請憑直覺誠實填寫目前各項人生狀態（１分為極不滿意，10分為極滿意）。
                            </p>
                        </div>

                        <div className="space-y-5 bg-slate-900/50 p-6 rounded-3xl border border-white/5">
                            {FIVE_FORTUNES.map(fortune => (
                                <div key={fortune.key} className="space-y-2">
                                    <div className="flex justify-between items-end">
                                        <label className="text-white font-black text-sm">{fortune.label}</label>
                                        <span className="text-indigo-400 font-bold text-xs bg-indigo-950 px-2 py-0.5 rounded">{fortunes[fortune.key]} 分</span>
                                    </div>
                                    <p className="text-[10px] text-slate-500 font-bold mb-2">{fortune.desc}</p>
                                    <input
                                        type="range"
                                        min="1"
                                        max="10"
                                        step="1"
                                        value={fortunes[fortune.key]}
                                        onChange={e => setFortunes({ ...fortunes, [fortune.key]: parseInt(e.target.value, 10) })}
                                        className="w-full accent-indigo-500 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                                    />
                                    <div className="flex justify-between text-[10px] text-slate-600 font-bold px-1">
                                        <span>1 (待突破)</span>
                                        <span>10 (大滿貫)</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex gap-3">
                            <button onClick={() => setStep(1)} className="px-6 py-5 rounded-2xl bg-slate-800 text-slate-300 font-black text-sm hover:bg-slate-700 transition-colors">
                                返回
                            </button>
                            <button
                                onClick={handleFinalSubmit}
                                disabled={isSyncing}
                                className="flex-1 py-5 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-black text-lg shadow-lg hover:opacity-90 active:scale-95 transition-all text-center disabled:opacity-50"
                            >
                                {isSyncing ? '建檔中...' : '正式報到，開拍！'}
                            </button>
                        </div>
                    </div>
                )}

                {step === 1 && (
                    <button type="button" onClick={onGoToLogin} className="w-full text-slate-500 text-sm font-bold hover:text-indigo-400 transition-colors mx-auto mt-8">
                        已有帳號？返回影城入口
                    </button>
                )}
            </div>
        </div>
    );
}

