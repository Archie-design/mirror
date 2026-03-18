import React from 'react';
import { UserPlus } from 'lucide-react';

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
    return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6 py-10 space-y-8">
            <div className="animate-in zoom-in duration-700 text-center mx-auto">
                <img src="/images/logo.png" alt="星光西遊" className="w-[min(18rem,60vw)] h-[min(18rem,60vw)] mx-auto mb-4 drop-shadow-2xl object-contain" />
                <h1 className="text-5xl font-black text-white mb-2 uppercase tracking-widest text-center mx-auto">星光西遊</h1>
                <p className="text-orange-400 text-lg font-bold uppercase tracking-[0.4em] text-center mx-auto">修行者轉生入口</p>
            </div>
            <form onSubmit={onLogin} className="w-full max-w-sm space-y-6 mx-auto text-center">
                <input name="name" required className="w-full bg-slate-900 border-2 border-white/5 rounded-2xl p-6 text-white text-center text-xl outline-none focus:border-orange-500 font-bold" placeholder="冒險者姓名" />
                <input name="phone" required type="password" maxLength={3} inputMode="numeric" className="w-full bg-slate-900 border-2 border-white/5 rounded-2xl p-6 text-white text-center text-xl focus:border-orange-500 font-bold" placeholder="手機末三碼" />
                <button disabled={isSyncing} className="w-full py-7 rounded-4xl bg-orange-600 text-white font-black text-2xl shadow-xl active:scale-95 transition-all text-center mx-auto">連結靈魂印記</button>
                <div className="flex flex-col gap-4">
                    <div className="relative flex items-center gap-3">
                        <div className="flex-1 h-px bg-white/10" />
                        <span className="text-slate-600 text-xs font-bold shrink-0">或</span>
                        <div className="flex-1 h-px bg-white/10" />
                    </div>
                    <a
                        href="/api/auth/line?action=login"
                        className="w-full flex items-center justify-center gap-3 py-5 rounded-2xl bg-[#06C755] text-white font-black text-xl shadow-lg active:scale-95 transition-all"
                    >
                        <LineIcon /> LINE 帳號登入
                    </a>
                    <button type="button" onClick={onGoToRegister} className="text-slate-500 text-sm font-bold hover:text-orange-400 transition-colors flex items-center justify-center gap-1 mx-auto mt-2"><UserPlus size={16} /> 尚未啟動轉生？</button>
                    <button type="button" onClick={onGoToAdmin} className="text-slate-800 text-[10px] font-black uppercase tracking-[0.3em] hover:text-orange-900 transition-colors">大會中樞入口</button>
                </div>
            </form>
        </div>
    );
}
