import { useState } from 'react';
import { ShieldAlert, Dices } from 'lucide-react';
import { DAILY_QUEST_CONFIG } from '@/lib/constants';
import { TeamSettings, W4Application } from '@/types';

interface CaptainTabProps {
    teamName: string;
    teamSettings?: TeamSettings;
    pendingW4Apps: W4Application[];
    onDrawWeeklyQuest: () => Promise<void>;
    onReviewW4: (appId: string, approve: boolean, notes: string) => Promise<void>;
}

function getCurrentWeekMondayStr(): string {
    const nowTaiwan = new Date(Date.now() + 8 * 3600 * 1000);
    const day = nowTaiwan.getUTCDay() || 7;
    const monday = new Date(nowTaiwan);
    monday.setUTCDate(monday.getUTCDate() - (day - 1));
    return monday.toISOString().slice(0, 10);
}

export function CaptainTab({ teamName, teamSettings, pendingW4Apps, onDrawWeeklyQuest, onReviewW4 }: CaptainTabProps) {
    const [isDrawing, setIsDrawing] = useState(false);
    const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
    const [reviewingId, setReviewingId] = useState<string | null>(null);

    const weekMondayStr = getCurrentWeekMondayStr();
    const alreadyDrawnThisWeek = teamSettings?.mandatory_quest_week === weekMondayStr;
    const currentQuestId = teamSettings?.mandatory_quest_id;
    const currentQuestName = DAILY_QUEST_CONFIG.find(q => q.id === currentQuestId)?.title;
    const drawHistory: string[] = teamSettings?.quest_draw_history || [];
    const remaining = DAILY_QUEST_CONFIG.filter(q => q.id.startsWith('q') && !drawHistory.includes(q.id));

    const handleDraw = async () => {
        setIsDrawing(true);
        await onDrawWeeklyQuest();
        setIsDrawing(false);
    };

    const handleReview = async (appId: string, approve: boolean) => {
        setReviewingId(appId);
        await onReviewW4(appId, approve, reviewNotes[appId] || '');
        setReviewingId(null);
        setReviewNotes(prev => { const n = { ...prev }; delete n[appId]; return n; });
    };

    return (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            <div className="bg-indigo-950/40 border-2 border-indigo-500/40 rounded-4xl p-6 shadow-2xl text-center mx-auto">
                <div className="flex items-center justify-center gap-2 text-indigo-400 font-black text-xs uppercase mb-2 tracking-widest"><ShieldAlert size={16} /> 隊長權限指揮所</div>
                <h2 className="text-2xl font-black text-white italic mx-auto">{teamName || '未知小隊'}</h2>
                <p className="text-xs text-indigo-300 mt-2 font-black">你擁有點亮同伴前行的提燈。請謹慎決策。</p>
            </div>

            <section className="bg-slate-900 border-2 border-slate-800 p-8 rounded-4xl space-y-6 shadow-xl text-center">
                <h3 className="text-lg font-black text-white border-b border-white/10 pb-4 text-left">🎲 本週推薦定課抽籤</h3>

                {alreadyDrawnThisWeek && currentQuestName ? (
                    <div className="space-y-3">
                        <p className="text-xs text-slate-400 font-bold">本週已抽出</p>
                        <div className="bg-indigo-900/30 border-2 border-indigo-500/50 rounded-3xl p-6">
                            <p className="text-3xl font-black text-white">「{currentQuestName}」</p>
                            <p className="text-xs text-indigo-400 mt-2 font-bold">週一 {weekMondayStr} 起生效</p>
                        </div>
                        <p className="text-xs text-slate-500">下週一前無法再次抽籤</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <p className="text-xs text-slate-400 font-bold leading-relaxed">
                            每週一 12:00 前抽選本週推薦定課。<br />
                            已抽過的定課不重複，{remaining.length > 0 ? `尚餘 ${remaining.length} 項可抽` : '本輪已全部抽完，下次抽籤將重置循環'}。
                        </p>
                        <button
                            disabled={isDrawing}
                            onClick={handleDraw}
                            className="w-full flex items-center justify-center gap-3 bg-indigo-600 p-5 rounded-2xl text-white font-black text-lg shadow-lg hover:bg-indigo-500 active:scale-95 transition-all disabled:opacity-50"
                        >
                            <Dices size={22} /> {isDrawing ? '命運抽籤中...' : '🎲 抽選本週定課'}
                        </button>
                    </div>
                )}

                {drawHistory.length > 0 && (
                    <div className="text-left space-y-2 mt-2">
                        <p className="text-xs font-black text-slate-500 uppercase tracking-widest">本輪已抽歷程</p>
                        <div className="flex flex-wrap gap-2">
                            {drawHistory.map(id => {
                                const name = DAILY_QUEST_CONFIG.find(q => q.id === id)?.title || id;
                                return (
                                    <span key={id} className={`px-3 py-1 rounded-xl text-xs font-bold ${id === currentQuestId ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                                        {name}
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                )}
            </section>

            {/* ❤️ 傳愛分數初審 */}
            <section className="bg-slate-900 border-2 border-pink-500/30 p-8 rounded-4xl space-y-6 shadow-xl">
                <h3 className="text-lg font-black text-white border-b border-white/10 pb-4">❤️ 傳愛分數審核（小隊長初審）</h3>

                {pendingW4Apps.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-4">目前無待審申請</p>
                ) : (
                    <div className="space-y-4">
                        {pendingW4Apps.map(app => (
                            <div key={app.id} className="bg-slate-800 rounded-2xl p-5 space-y-3">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="font-black text-white">{app.user_name}</p>
                                        <p className="text-xs text-slate-400">訪談：{app.interview_target} · {app.interview_date}</p>
                                    </div>
                                    <span className="text-[10px] font-black text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded-lg">待初審</span>
                                </div>
                                {app.description && <p className="text-xs text-slate-400 italic">{app.description}</p>}
                                <textarea
                                    placeholder="備註（選填）"
                                    value={reviewNotes[app.id] || ''}
                                    onChange={e => setReviewNotes(prev => ({ ...prev, [app.id]: e.target.value }))}
                                    rows={2}
                                    className="w-full bg-slate-700 border border-slate-600 rounded-xl p-3 text-white text-xs outline-none focus:border-pink-500 resize-none"
                                />
                                <div className="flex gap-3">
                                    <button
                                        disabled={reviewingId === app.id}
                                        onClick={() => handleReview(app.id, false)}
                                        className="flex-1 py-2 bg-red-600/20 text-red-400 font-black rounded-xl text-sm border border-red-600/30 active:scale-95 transition-all disabled:opacity-50"
                                    >
                                        ❌ 駁回
                                    </button>
                                    <button
                                        disabled={reviewingId === app.id}
                                        onClick={() => handleReview(app.id, true)}
                                        className="flex-2 py-2 bg-emerald-600 text-white font-black rounded-xl text-sm shadow-lg active:scale-95 transition-all disabled:opacity-50"
                                    >
                                        ✅ 初審通過
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
