'use client';
import React, { useState } from 'react';
import { CharacterStats, UserNineGrid } from '@/types';
import { NineGridCard } from '@/components/NineGridCard';
import { FORTUNE_COMPANIONS, getLowestFortune } from '@/components/Login/RegisterForm';

const COMPANION_DETAILS: Record<string, {
    name: string; archetype: string; symbol: string; story: string; color: string; bgColor: string;
}> = {
    '事業運': {
        name: '小草', archetype: '稻草人', symbol: '智慧與判斷力',
        story: '很多人在事業上不是沒有能力，而是不相信自己的判斷。小草整趟旅程出點子最多，帶你看見本來就有的智慧與行動力。',
        color: '#27AE60', bgColor: '#27AE6015',
    },
    '財富運': {
        name: '小獅', archetype: '膽小獅', symbol: '勇氣與值得感',
        story: '財富的阻礙往往不是方法不對，而是內心覺得自己不值得、不敢承擔、不敢被看見。',
        color: '#F39C12', bgColor: '#F39C1215',
    },
    '情感運': {
        name: '小鐵', archetype: '鐵皮人', symbol: '愛與流動',
        story: '感情的課題從來不是找到對的人，而是先打開自己的心。你給出什麼能量，就吸引什麼樣的關係回來。',
        color: '#95A5A6', bgColor: '#95A5A615',
    },
    '家庭運': {
        name: '翡翠城', archetype: '翡翠城（目的地）', symbol: '歸屬感',
        story: '家庭是所有人能量的根源。真正的力量從來不在城裡，而在你自己身上。翡翠城象徵「我想回去的地方」。',
        color: '#1A6B4A', bgColor: '#1A6B4A15',
    },
    '體能運': {
        name: '小桃', archetype: '桃樂絲', symbol: '回到自己',
        story: '健康是所有旅程的根基。小桃腳上的紅鞋象徵身體本來就有的自癒力，只是我們往往忘記它一直都在。',
        color: '#5DADE2', bgColor: '#5DADE215',
    },
};

function sliderStyle(value: number, color: string): React.CSSProperties {
    const pct = ((value - 1) / 9) * 100;
    return {
        accentColor: color,
        background: `linear-gradient(to right, ${color} 0%, ${color} ${pct}%, #D1EAD9 ${pct}%, #D1EAD9 100%)`,
    };
}

interface NineGridTabProps {
    userId: string;
    userName: string;
    userData: CharacterStats;
    grid: UserNineGrid | null;
    onFortuneSave: (fortunes: Record<string, number>) => Promise<void>;
    onRefresh: () => void;
}

export function NineGridTab({ userId, userName, userData, grid, onFortuneSave, onRefresh }: NineGridTabProps) {
    const hasFortuneData = FORTUNE_COMPANIONS.some(f => (userData[f.dbCol as keyof CharacterStats] as number ?? 0) > 0);

    const [fortunes, setFortunes] = useState<Record<string, number>>(() => {
        const init: Record<string, number> = {};
        for (const f of FORTUNE_COMPANIONS) {
            init[f.key] = (userData[f.dbCol as keyof CharacterStats] as number) || 5;
        }
        return init;
    });
    const [saving, setSaving] = useState(false);
    const lowestFortune = getLowestFortune(fortunes);

    const handleSubmit = async () => {
        setSaving(true);
        await onFortuneSave(fortunes);
        setSaving(false);
    };

    if (grid) {
        const detail = COMPANION_DETAILS[grid.companion_type];
        const tagColor = detail?.color ?? '#1A6B4A';
        const tagBg = tagColor === '#1A6B4A' ? '#2E8B5A' : tagColor;
        return (
            <div className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                    <span className="text-xs font-black px-3 py-1 rounded-full text-white"
                        style={{ background: tagBg }}>
                        旅伴：{grid.companion_type}
                    </span>
                    {hasFortuneData && (
                        <span className="text-xs text-[#5A7A5A] font-bold">
                            當時評分：{FORTUNE_COMPANIONS.find(f => f.companion === grid.companion_type)?.desc}
                        </span>
                    )}
                </div>
                {detail && (
                    <div
                        className="rounded-2xl p-4 border"
                        style={{ background: detail.bgColor, borderColor: `${detail.color}30` }}
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg font-black" style={{ color: detail.color }}>
                                {detail.name}
                            </span>
                            <span className="text-xs text-[#5A7A5A] font-bold">· {detail.archetype}</span>
                        </div>
                        <p className="text-xs font-black mb-1" style={{ color: detail.color }}>
                            ◆ {detail.symbol}
                        </p>
                        <p className="text-xs text-[#5A7A5A] font-bold leading-relaxed">
                            {detail.story}
                        </p>
                    </div>
                )}
                <NineGridCard grid={grid} userId={userId} userName={userName} onRefresh={onRefresh} />
            </div>
        );
    }

    // 尚未初始化九宮格 → 顯示五運自評
    return (
        <div className="space-y-5">
            <div className="text-center space-y-1 pt-2">
                <h2 className="font-display text-xl font-black text-[#1A2A1A]">找到你的旅伴</h2>
                <p className="text-sm text-[#5A7A5A] font-bold">為五運評分，系統將自動為你配對最需要的旅伴</p>
            </div>

            <div className="bg-[#F5C842]/10 border border-[#F5C842]/40 rounded-2xl p-4 text-sm text-[#5A7A5A] font-bold leading-relaxed">
                請憑直覺為目前各運勢評分（1分為最需突破，10分為最滿意）。
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

            <button
                onClick={handleSubmit}
                disabled={saving}
                className="w-full py-5 rounded-2xl bg-[#C0392B] text-white font-black text-xl shadow-xl active:scale-95 transition-all disabled:opacity-50"
                style={{ boxShadow: '0 4px 20px rgba(192,57,43,0.4)' }}
            >
                {saving ? '旅伴配對中…' : '完成評分，找到我的旅伴'}
            </button>
        </div>
    );
}
