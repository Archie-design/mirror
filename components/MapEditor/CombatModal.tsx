import React from 'react';
import { Swords, Shield, Heart, Zap, AlertTriangle, Info } from 'lucide-react';
import { CharacterStats } from '@/types';
import { ROLE_CURE_MAP } from '@/lib/constants';

interface CombatModalProps {
    isOpen: boolean;
    onClose: () => void;
    player: CharacterStats;
    targetEntity: any;
    flankingMultiplier: number; // 1.0 = Frontal, 1.3 = Flank, 1.5 = Backstab
    remainingAP: number;
    isObscured: boolean; // True if fog of war hides stats
    onAttack: () => void;
    isProcessing: boolean;
}

export function CombatModal({
    isOpen, onClose, player, targetEntity, flankingMultiplier, remainingAP, isObscured, onAttack, isProcessing
}: CombatModalProps) {
    if (!isOpen || !targetEntity) return null;

    // Player Stats Calculation
    const roleConfig = ROLE_CURE_MAP[player.Role];
    const playerBaseHP = roleConfig ? roleConfig.baseHP + (player.Physique * roleConfig.hpScale) : 1000;
    const currentHP = player.HP ?? playerBaseHP;
    const playerATK = (player.Level * 10) + (player.Physique * 2);
    let playerDEF = roleConfig ? roleConfig.baseDEF + (player.Physique * 1) : 50;

    // Check debuffs (simplified for UI display)
    const isIrritable = player.Role === '孫悟空' && false; // TODO: Hook up real status
    if (isIrritable) playerDEF *= 0.7;

    // Monster Stats Calculation
    const monsterLevel = targetEntity.data?.level || 1;
    const monsterName = targetEntity.name || "未知妖物";
    const monsterIcon = targetEntity.icon || "🐉";
    const monsterATK = monsterLevel * 12;
    const monsterDEF = monsterLevel * 8;
    const monsterHP = targetEntity.data?.hp || 100;

    // Predictive Math for Combo
    const firstHitDmg = Math.max(1, Math.floor((playerATK * flankingMultiplier) - monsterDEF));
    const subHitDmg = Math.max(1, Math.floor(playerATK - monsterDEF));
    const totalExpectedDamage = firstHitDmg + Math.max(0, remainingAP - 1) * subHitDmg;

    // Counter Attack Math
    const predictedMonsterDamage = Math.max(5, monsterATK - playerDEF);
    const willKill = totalExpectedDamage >= monsterHP;

    let winChance = "均勢 ⚖️";
    let winColor = "text-yellow-500";

    if (willKill) {
        winChance = `強力斬殺！預期造成 ${totalExpectedDamage} 傷 ✨`;
        winColor = "text-emerald-400";
    } else if (totalExpectedDamage >= monsterHP * 0.5) {
        winChance = `重創！換血預計受 ${predictedMonsterDamage} 傷 ⚔️`;
        winColor = "text-emerald-500";
    } else if (predictedMonsterDamage >= currentHP) {
        winChance = `致命反擊！你將承受 ${predictedMonsterDamage} 傷 ☠️`;
        winColor = "text-red-500";
    } else {
        winChance = `刮痧苦戰！預計受反擊 ${predictedMonsterDamage} 傷 ⚠️`;
        winColor = "text-orange-500";
    }

    if (isObscured) {
        winChance = "資訊未明 ❓";
        winColor = "text-slate-400";
    }

    const tacticalLabel = flankingMultiplier === 1.5 ? "背襲發動！(1.5x 傷害)" : flankingMultiplier === 1.3 ? "側翼夾擊！(1.3x 傷害)" : "正面交鋒";
    const tacticalColor = flankingMultiplier > 1.0 ? "text-orange-400" : "text-slate-400";

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-in fade-in zoom-in duration-300 overflow-y-auto">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-2rem)] my-auto">

                {/* Header */}
                <div className="bg-slate-800 p-6 flex flex-col items-center justify-center relative border-b border-white/5 shadow-inner flex-shrink-0">
                    <button onClick={onClose} className="absolute top-6 right-6 p-2 text-slate-500 hover:text-white transition-colors bg-white/5 rounded-full"><AlertTriangle size={16} className="rotate-180 opacity-0" /></button>
                    <h2 className="text-2xl font-black text-white flex items-center gap-3">
                        <Swords className="text-red-500" /> 戰鬥推演預測
                    </h2>
                    <p className={`text-sm font-black mt-2 bg-slate-950/50 px-4 py-1.5 rounded-full border border-white/5 ${tacticalColor}`}>
                        {tacticalLabel}
                    </p>
                </div>

                {/* VS Board */}
                <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-white/10 bg-slate-900 flex-1 overflow-y-auto min-h-0">

                    {/* Player Side */}
                    <div className="flex-1 p-4 md:p-6 flex flex-col items-center">
                        <div className="text-4xl md:text-5xl drop-shadow-lg mb-2 md:mb-4">{roleConfig?.avatar || '👤'}</div>
                        <h3 className="text-lg font-black text-emerald-400">{player.Name} (Lv.{player.Level})</h3>
                        <div className="w-full mt-4 space-y-2 md:space-y-3">
                            <div className="flex justify-between items-center bg-slate-950 p-3 rounded-xl border border-white/5">
                                <span className="text-xs font-black text-slate-500 flex items-center gap-2"><Heart size={14} className="text-red-500" /> 血量</span>
                                <span className="font-bold text-white">{currentHP} / {playerBaseHP}</span>
                            </div>
                            <div className="flex justify-between items-center bg-slate-950 p-3 rounded-xl border border-white/5">
                                <span className="text-xs font-black text-slate-500 flex items-center gap-2"><Swords size={14} className="text-orange-500" /> 攻擊力</span>
                                <span className="font-bold text-white">{playerATK}</span>
                            </div>
                            <div className="flex justify-between items-center bg-slate-950 p-3 rounded-xl border border-white/5">
                                <span className="text-xs font-black text-slate-500 flex items-center gap-2"><Shield size={14} className="text-indigo-400" /> 防禦力</span>
                                <span className="font-bold text-white flex items-center gap-1">
                                    {playerDEF}
                                    {isIrritable && <span className="text-[10px] text-red-500 bg-red-500/10 px-1 rounded">(暴躁 -30%)</span>}
                                </span>
                            </div>
                            <div className="flex justify-between items-center bg-slate-950 p-3 rounded-xl border border-white/5">
                                <span className="text-xs font-black text-slate-500 flex items-center gap-2"><Zap size={14} className="text-yellow-400" /> 連擊次數</span>
                                <span className="font-bold text-yellow-400">x {Math.max(1, remainingAP)}</span>
                            </div>
                        </div>
                    </div>

                    {/* VS divider */}
                    <div className="flex items-center justify-center py-2 md:p-4 bg-slate-950/30">
                        <div className="w-12 h-12 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center font-black text-slate-500 shadow-inner">VS</div>
                    </div>

                    {/* Target Side */}
                    <div className="flex-1 p-4 md:p-6 flex flex-col items-center">
                        <div className="text-4xl md:text-5xl drop-shadow-lg mb-2 md:mb-4 filter drop-shadow-[0_0_15px_rgba(239,68,68,0.3)]">{monsterIcon}</div>
                        <h3 className="text-lg font-black text-red-400">{monsterName} {isObscured ? '' : `(Lv.${monsterLevel})`}</h3>
                        <div className="w-full mt-4 space-y-2 md:space-y-3 relative">
                            {isObscured && (
                                <div className="absolute inset-0 z-10 bg-slate-950/80 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center border border-slate-700/50">
                                    <AlertTriangle size={24} className="text-slate-500 mb-2" />
                                    <span className="text-sm font-black text-slate-400">戰爭迷霧：數值未知</span>
                                </div>
                            )}
                            <div className="flex justify-between items-center bg-slate-950 p-3 rounded-xl border border-white/5">
                                <span className="text-xs font-black text-slate-500 flex items-center gap-2"><Heart size={14} className="text-red-500" /> 血量</span>
                                <span className="font-bold text-slate-300">{isObscured ? '???' : monsterHP}</span>
                            </div>
                            <div className="flex justify-between items-center bg-slate-950 p-3 rounded-xl border border-white/5">
                                <span className="text-xs font-black text-slate-500 flex items-center gap-2"><Swords size={14} className="text-orange-500" /> 攻擊力</span>
                                <span className="font-bold text-slate-300">{isObscured ? '???' : monsterATK}</span>
                            </div>
                            <div className="flex justify-between items-center bg-slate-950 p-3 rounded-xl border border-white/5">
                                <span className="text-xs font-black text-slate-500 flex items-center gap-2"><Shield size={14} className="text-indigo-400" /> 防禦力</span>
                                <span className="font-bold text-slate-300">{isObscured ? '???' : monsterDEF}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* AI Predictive Result */}
                <div className="bg-slate-950 p-6 flex flex-col md:flex-row items-center justify-between gap-4 border-t border-white/5 flex-shrink-0">
                    <div className="text-left w-full md:w-auto">
                        <div className="text-[10px] uppercase font-black tracking-widest text-slate-500 mb-1 flex items-center gap-1"><Zap size={12} /> AI 戰局推演</div>
                        <div className={`text-lg font-black ${winColor} tracking-wide`}>{winChance}</div>
                    </div>
                    <div className="flex gap-3 w-full md:w-auto">
                        <button
                            onClick={onClose}
                            disabled={isProcessing}
                            className={`flex-1 md:flex-none px-6 py-4 rounded-xl font-black transition-colors ${isProcessing ? 'text-slate-600 bg-slate-900 cursor-not-allowed' : 'text-slate-400 bg-slate-800 hover:bg-slate-700 hover:text-white'}`}
                        >
                            撤退
                        </button>
                        <button
                            onClick={onAttack}
                            disabled={isProcessing}
                            className={`flex-[2] md:flex-none px-8 py-4 rounded-xl font-black text-white transition-all flex items-center justify-center gap-2 ${isProcessing ? 'bg-red-900/50 text-red-500 cursor-not-allowed' : 'bg-red-600 hover:bg-red-500 shadow-lg shadow-red-600/20 active:scale-95'}`}
                        >
                            {isProcessing ? '交戰中...' : '發動攻擊 ⚔️'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
