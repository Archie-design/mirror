import React from 'react';
import { UserPlus } from 'lucide-react';

interface LoginFormProps {
    onLogin: (e: React.FormEvent<HTMLFormElement>) => void;
    onGoToRegister: () => void;
    onGoToAdmin: () => void;
    isSyncing: boolean;
}

export function LoginForm({ onLogin, onGoToRegister, onGoToAdmin, isSyncing }: LoginFormProps) {
    return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-10 space-y-12">
            <div className="animate-in zoom-in duration-700 text-center mx-auto">
                <div className="w-32 h-32 bg-orange-600 rounded-4xl flex items-center justify-center shadow-2xl border-4 border-white/20 mb-6 mx-auto text-white text-7xl italic text-center mx-auto">🕉️</div>
                <h1 className="text-5xl font-black text-white mb-2 uppercase tracking-widest text-center mx-auto">星光西遊</h1>
                <p className="text-orange-400 text-lg font-bold uppercase tracking-[0.4em] text-center mx-auto">修行者轉生入口</p>
            </div>
            <form onSubmit={onLogin} className="w-full max-w-sm space-y-6 mx-auto text-center">
                <input name="name" required className="w-full bg-slate-900 border-2 border-white/5 rounded-2xl p-6 text-white text-center text-xl outline-none focus:border-orange-500 font-bold" placeholder="冒險者姓名" />
                <input name="phone" required type="password" maxLength={3} inputMode="numeric" className="w-full bg-slate-900 border-2 border-white/5 rounded-2xl p-6 text-white text-center text-xl focus:border-orange-500 font-bold" placeholder="手機末三碼" />
                <button disabled={isSyncing} className="w-full py-7 rounded-4xl bg-orange-600 text-white font-black text-2xl shadow-xl active:scale-95 transition-all text-center mx-auto">連結靈魂印記</button>
                <div className="flex flex-col gap-4">
                    <button type="button" onClick={onGoToRegister} className="text-slate-500 text-sm font-bold hover:text-orange-400 transition-colors flex items-center justify-center gap-1 mx-auto mt-4"><UserPlus size={16} /> 尚未啟動轉生？</button>
                    <button type="button" onClick={onGoToAdmin} className="text-slate-800 text-[10px] font-black uppercase tracking-[0.3em] hover:text-orange-900 transition-colors">大會中樞入口</button>
                </div>
            </form>
        </div>
    );
}
