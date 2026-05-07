import Image from 'next/image';
import { Sparkles } from 'lucide-react';
import type { OzTier } from '@/lib/oz-tiers';

const TIER_FLAVOR: Record<number, string> = {
    2: '黃磚路上你不再孤單，旅伴與你並肩同行。',
    3: '大法師的指引在你面前顯靈，洞見開始浮現。',
    4: '當你照進鏡中，看見的就是覺醒的自己。',
};

export function LevelUpModal({ tier, onClose }: { tier: OzTier; onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-6 bg-[#1A2A1A]/85 backdrop-blur-sm animate-in fade-in duration-500">
            <div className="bg-gradient-to-b from-[#FFFEF5] to-[#FFF8DC] border-4 border-[#F5C842] p-8 rounded-[2.5rem] shadow-2xl max-w-sm w-full text-center space-y-5 animate-in zoom-in-95 duration-500">
                <div className="flex items-center justify-center gap-2 text-[#8B6914] font-black text-sm tracking-widest">
                    <Sparkles size={18} className="text-[#F5C842]" />
                    恭喜達成 LV.{tier.level}
                    <Sparkles size={18} className="text-[#F5C842]" />
                </div>

                <div className="w-44 h-44 mx-auto rounded-3xl overflow-hidden bg-[#1B3A1E] shadow-lg ring-4 ring-[#F5C842]/40">
                    <Image src={tier.src} alt={tier.label} width={176} height={176} className="object-contain scale-[1.06]" />
                </div>

                <div>
                    <p className="font-display text-2xl font-black text-[#1A2A1A] tracking-wide">{tier.label}</p>
                    <p className="text-sm text-[#5A7A5A] mt-2 leading-relaxed px-2">
                        {TIER_FLAVOR[tier.level] ?? '繼續前行，你的故事仍在書寫。'}
                    </p>
                </div>

                <button
                    onClick={onClose}
                    className="w-full py-4 bg-[#1A6B4A] hover:bg-[#155A3D] text-white font-black rounded-2xl shadow-lg active:scale-95 transition-all"
                >
                    繼續踏上旅程
                </button>
            </div>
        </div>
    );
}
