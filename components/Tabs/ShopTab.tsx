import React, { useState } from 'react';
import { ShoppingBag, Coins, Users, User, AlertCircle, CheckCircle2 } from 'lucide-react';
import { ARTIFACTS_CONFIG } from '@/lib/constants';
import { purchaseArtifact, transferCoinsToTeam } from '@/app/actions/store';
import { CharacterStats, TeamSettings } from '@/types';

const ARTIFACT_IMAGES: Record<string, string> = {
    a1: '/images/artifacts/a1.png',
    a2: '/images/artifacts/a2.png',
    a3: '/images/artifacts/a3.png',
    a4: '/images/artifacts/a4.png',
    a5: '/images/artifacts/a5.png',
    a6: '/images/artifacts/a6.png',
};

const HEX_CLIP = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';

function HexIcon({ artifactId, isOwned, isTeamBinding, size = 100 }: { artifactId: string; isOwned: boolean; isTeamBinding: boolean; size?: number }) {
    const glowColor = isTeamBinding
        ? 'rgba(99,102,241,0.7)'
        : 'rgba(234,179,8,0.7)';
    const bgColor = isOwned
        ? (isTeamBinding ? '#1e1b4b' : '#422006')
        : '#1e293b';
    const imgSize = ['a1', 'a3', 'a4', 'a5'].includes(artifactId) ? '60%' : '78%';

    return (
        <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
            {isOwned && (
                <div
                    className="absolute inset-0"
                    style={{
                        clipPath: HEX_CLIP,
                        background: isTeamBinding
                            ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                            : 'linear-gradient(135deg, #f59e0b, #fbbf24)',
                        filter: `drop-shadow(0 0 10px ${glowColor})`,
                    }}
                />
            )}
            <div
                className="absolute"
                style={{
                    clipPath: HEX_CLIP,
                    background: bgColor,
                    inset: isOwned ? 4 : 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                }}
            >
                {ARTIFACT_IMAGES[artifactId] ? (
                    <img
                        src={ARTIFACT_IMAGES[artifactId]}
                        alt={artifactId}
                        className="object-contain"
                        style={{ width: imgSize, height: imgSize }}
                    />
                ) : (
                    <span className={`font-black text-[11px] tracking-widest ${isOwned ? (isTeamBinding ? 'text-indigo-300' : 'text-yellow-300') : 'text-slate-500'}`}>
                        {artifactId.toUpperCase()}
                    </span>
                )}
            </div>
        </div>
    );
}

interface ShopTabProps {
    userData: CharacterStats;
    teamSettings: TeamSettings | null;
    teamMemberCount?: number;
    onPurchaseSuccess: () => void;
    onShowMessage: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export function ShopTab({ userData, teamSettings, teamMemberCount = 1, onPurchaseSuccess, onShowMessage }: ShopTabProps) {
    const [isBuying, setIsBuying] = useState<string | null>(null);
    const [transferAmount, setTransferAmount] = useState<number | ''>('');
    const [isTransferring, setIsTransferring] = useState(false);

    const handleTransfer = async () => {
        if (!userData.TeamName || !transferAmount || typeof transferAmount !== 'number' || transferAmount <= 0) return;
        setIsTransferring(true);
        try {
            const res = await transferCoinsToTeam(userData.UserID, userData.TeamName, transferAmount);
            if (res.success) {
                onShowMessage(`已成功將 ${transferAmount} 金幣注入團隊資金！`, "success");
                setTransferAmount('');
                onPurchaseSuccess();
            } else {
                onShowMessage(res.error || "轉帳失敗", "error");
            }
        } catch (error: any) {
            onShowMessage(`系統異常: ${error.message}`, "error");
        } finally {
            setIsTransferring(false);
        }
    };

    const handlePurchase = async (artifactId: string, isTeamBinding: boolean) => {
        setIsBuying(artifactId);
        try {
            const teamName = isTeamBinding ? userData.TeamName : null;
            if (isTeamBinding && !teamName) {
                onShowMessage("小隊專屬法寶需加入小隊後由隊長購買", "error");
                return;
            }
            if (isTeamBinding && !userData.IsCaptain) {
                onShowMessage("只有小隊長可以使用團隊修為購買專屬法寶", "error");
                return;
            }
            const res = await purchaseArtifact(userData.UserID, artifactId, teamName || null);
            if (res.success) {
                onShowMessage(`交易成功！法寶已收入囊中。`, "success");
                onPurchaseSuccess();
            } else {
                onShowMessage(res.error || "購買失敗", "error");
            }
        } catch (error: any) {
            onShowMessage(`系統異常: ${error.message}`, "error");
        } finally {
            setIsBuying(null);
        }
    };

    const myInventory: string[] = typeof userData.Inventory === 'string' ? JSON.parse(userData.Inventory) : (userData.Inventory || []);
    const teamInventory: string[] = teamSettings ? (typeof teamSettings.inventory === 'string' ? JSON.parse(teamSettings.inventory) : (teamSettings.inventory || [])) : [];

    const ownedArtifacts = ARTIFACTS_CONFIG.filter(a =>
        a.isTeamBinding ? teamInventory.includes(a.id) : myInventory.includes(a.id)
    );

    const personalArtifacts = ARTIFACTS_CONFIG.filter(a => !a.isTeamBinding);
    const teamArtifacts = ARTIFACTS_CONFIG.filter(a => a.isTeamBinding);

    function ArtifactCard({ artifact }: { artifact: typeof ARTIFACTS_CONFIG[0] }) {
        const isOwned = artifact.isTeamBinding
            ? teamInventory.includes(artifact.id)
            : myInventory.includes(artifact.id);
        const isExclusiveBlocked = !!(artifact.exclusiveWith && myInventory.includes(artifact.exclusiveWith));
        const isPerMember = artifact.isTeamBinding && artifact.price !== 0;
        const finalPrice = isPerMember ? artifact.price * teamMemberCount : artifact.price;

        if (isOwned) {
            return (
                <div className={`relative rounded-3xl px-4 py-4 border-2 overflow-hidden flex items-center gap-4
                    ${artifact.isTeamBinding
                        ? 'bg-gradient-to-br from-indigo-900/60 to-purple-950/80 border-indigo-400/60 shadow-[0_0_24px_rgba(99,102,241,0.35)]'
                        : 'bg-gradient-to-br from-yellow-900/60 to-amber-950/80 border-yellow-500/60 shadow-[0_0_24px_rgba(234,179,8,0.35)]'
                    }`}
                >
                    <HexIcon artifactId={artifact.id} isOwned={true} isTeamBinding={artifact.isTeamBinding} size={100} />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <h3 className={`text-base font-black ${artifact.isTeamBinding ? 'text-indigo-200' : 'text-yellow-200'}`}>
                                {artifact.name}
                            </h3>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase tracking-widest shrink-0 ${artifact.isTeamBinding ? 'bg-indigo-500/20 text-indigo-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                                {artifact.isTeamBinding ? '小隊' : '個人'}
                            </span>
                        </div>
                        <p className={`text-[11px] leading-relaxed mb-2 ${artifact.isTeamBinding ? 'text-indigo-300/80' : 'text-yellow-300/80'}`}>
                            {artifact.effect}
                        </p>
                        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-black text-xs
                            ${artifact.isTeamBinding ? 'bg-indigo-500/20 text-indigo-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                            <CheckCircle2 size={11} /> 已裝備
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <div className="relative rounded-3xl px-4 py-4 border-2 border-slate-700/50 bg-slate-900/80 overflow-hidden flex items-center gap-4">
                {isExclusiveBlocked && (
                    <div className="absolute inset-0 bg-slate-950/60 z-10 flex items-center justify-center rounded-3xl">
                        <span className="text-[10px] text-slate-400 font-black text-center px-4">與已持有的法寶互斥</span>
                    </div>
                )}
                <HexIcon artifactId={artifact.id} isOwned={false} isTeamBinding={artifact.isTeamBinding} size={100} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-base font-black text-white">{artifact.name}</h3>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase tracking-widest shrink-0 ${artifact.isTeamBinding ? 'bg-indigo-500/20 text-indigo-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                            {artifact.isTeamBinding ? '小隊' : '個人'}
                        </span>
                    </div>
                    <div className="flex items-start gap-1 bg-slate-950/60 rounded-xl p-2 mb-2">
                        <AlertCircle size={11} className="text-orange-400 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-orange-300/80 leading-relaxed">{artifact.effect}</p>
                    </div>
                    <button
                        disabled={isExclusiveBlocked || isBuying === artifact.id || (artifact.isTeamBinding && !userData.IsCaptain)}
                        onClick={() => handlePurchase(artifact.id, artifact.isTeamBinding)}
                        className={`w-full py-2 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition-all
                            ${artifact.isTeamBinding
                                ? (userData.IsCaptain ? 'bg-indigo-600 text-white hover:bg-indigo-500 active:scale-95 shadow-lg shadow-indigo-900/30' : 'bg-slate-800 text-slate-500 cursor-not-allowed')
                                : 'bg-yellow-600 text-white hover:bg-yellow-500 active:scale-95 shadow-lg shadow-yellow-900/30'
                            }`}
                    >
                        <Coins size={11} />
                        {isBuying === artifact.id ? '煉化中...' : (finalPrice === 0 ? '免費領取（長輩）' : `${finalPrice} 金幣`)}
                        {isPerMember && <span className="opacity-60 text-[10px]">/人</span>}
                    </button>
                    {artifact.isTeamBinding && !userData.IsCaptain && (
                        <p className="text-[10px] text-slate-500 font-black mt-1 text-center">需由小隊長操作購買</p>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">

            {/* Header */}
            <div className="bg-gradient-to-br from-yellow-950/40 to-slate-900 border-2 border-yellow-500/40 rounded-4xl p-6 shadow-2xl text-center">
                <div className="flex items-center justify-center gap-2 text-yellow-500 font-black text-xs uppercase mb-1 tracking-widest">
                    <ShoppingBag size={16} /> 天庭藏寶閣
                </div>
                <h2 className="text-2xl font-black text-white italic mb-4">法寶兌換處</h2>
                <div className="flex items-center justify-center gap-3 text-xs font-black">
                    <div className="flex items-center gap-1.5 text-yellow-500 bg-yellow-500/10 px-3 py-1.5 rounded-xl">
                        <User size={13} /> 個人金幣: {userData.Coins || 0}
                    </div>
                    {userData.TeamName && (
                        <div className="flex items-center gap-1.5 text-indigo-400 bg-indigo-500/10 px-3 py-1.5 rounded-xl">
                            <Users size={13} /> 團隊資金: {teamSettings?.team_coins || 0}
                        </div>
                    )}
                </div>
            </div>

            {/* Owned artifacts strip */}
            {ownedArtifacts.length > 0 && (
                <div className="bg-slate-900/60 border border-slate-700/40 rounded-3xl p-4">
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-3">✨ 已裝備法寶</p>
                    <div className="flex gap-3 flex-wrap">
                        {ownedArtifacts.map(a => (
                            <div key={a.id} className="flex flex-col items-center gap-1">
                                <HexIcon artifactId={a.id} isOwned={true} isTeamBinding={a.isTeamBinding} />
                                <span className={`text-[9px] font-black ${a.isTeamBinding ? 'text-indigo-300' : 'text-yellow-300'}`}>
                                    {a.name}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Personal artifacts */}
            <div>
                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-3 px-1">個人法寶</p>
                <div className="flex flex-col gap-3">
                    {personalArtifacts.map(a => <ArtifactCard key={a.id} artifact={a} />)}
                </div>
            </div>

            {/* Team artifacts */}
            <div>
                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-3 px-1">小隊法寶</p>
                <div className="flex flex-col gap-3">
                    {teamArtifacts.map(a => <ArtifactCard key={a.id} artifact={a} />)}
                </div>
            </div>

            {/* Coin transfer to team */}
            {userData.TeamName && (
                <div className="bg-indigo-950/40 border-2 border-indigo-500/30 p-4 rounded-3xl flex items-center justify-between gap-4">
                    <div className="flex-1">
                        <p className="text-xs text-indigo-300 font-bold mb-2">捐獻個人金幣至團隊</p>
                        <input
                            type="number"
                            min="1"
                            max={userData.Coins || 0}
                            value={transferAmount}
                            onChange={e => setTransferAmount(e.target.value ? parseInt(e.target.value, 10) : '')}
                            placeholder="輸入金幣數量"
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white font-bold outline-none focus:border-indigo-500"
                        />
                    </div>
                    <button
                        onClick={handleTransfer}
                        disabled={isTransferring || !transferAmount || typeof transferAmount !== 'number' || transferAmount <= 0 || transferAmount > (userData.Coins || 0)}
                        className="mt-6 shrink-0 bg-indigo-600 px-6 py-2.5 rounded-xl font-black text-sm text-white hover:bg-indigo-500 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
                    >
                        {isTransferring ? '傳輸中...' : '入帳'}
                    </button>
                </div>
            )}
        </div>
    );
}
