import React from 'react';

interface IconProps {
    size?: number;
    className?: string;
    strokeWidth?: number;
}

/** 膠卷圓盤 */
export function FilmReelIcon({ size = 24, className = '', strokeWidth = 1.5 }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            <circle cx="12" cy="12" r="9.5" />
            <circle cx="12" cy="12" r="2.5" />
            {/* 6 spokes */}
            <line x1="12" y1="9.5" x2="12" y2="2.5" />
            <line x1="15.5" y1="10.5" x2="20.7" y2="7.5" />
            <line x1="15.5" y1="13.5" x2="20.7" y2="16.5" />
            <line x1="12" y1="14.5" x2="12" y2="21.5" />
            <line x1="8.5" y1="13.5" x2="3.3" y2="16.5" />
            <line x1="8.5" y1="10.5" x2="3.3" y2="7.5" />
            {/* hub detail */}
            <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        </svg>
    );
}

/** 膠卷條紋 */
export function FilmStripIcon({ size = 24, className = '', strokeWidth = 1.5 }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            {/* main strip body */}
            <rect x="2" y="7" width="20" height="10" rx="1.5" />
            {/* top perforations */}
            <rect x="4" y="3" width="3" height="4" rx="1" />
            <rect x="10.5" y="3" width="3" height="4" rx="1" />
            <rect x="17" y="3" width="3" height="4" rx="1" />
            {/* bottom perforations */}
            <rect x="4" y="17" width="3" height="4" rx="1" />
            <rect x="10.5" y="17" width="3" height="4" rx="1" />
            <rect x="17" y="17" width="3" height="4" rx="1" />
            {/* frame dividers */}
            <line x1="8.5" y1="8" x2="8.5" y2="16" />
            <line x1="15.5" y1="8" x2="15.5" y2="16" />
        </svg>
    );
}

/** 3D 眼鏡 */
export function Glasses3DIcon({ size = 24, className = '', strokeWidth = 1.5 }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            {/* left lens */}
            <path d="M1.5 10.5 C1.5 8 2.5 7 4.5 7 L9.5 7 C11.5 7 12 8.5 12 10.5 C12 12.5 11.5 14 9.5 14 L4.5 14 C2.5 14 1.5 13 1.5 10.5 Z" />
            {/* right lens */}
            <path d="M12 10.5 C12 8.5 12.5 7 14.5 7 L19.5 7 C21.5 7 22.5 8 22.5 10.5 C22.5 13 21.5 14 19.5 14 L14.5 14 C12.5 14 12 12.5 12 10.5 Z" />
            {/* left temple */}
            <line x1="1.5" y1="10.5" x2="0" y2="9.5" />
            {/* right temple */}
            <line x1="22.5" y1="10.5" x2="24" y2="9.5" />
        </svg>
    );
}

/** 導演喊聲筒 */
export function MegaphoneIcon({ size = 24, className = '', strokeWidth = 1.5 }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            {/* body + cone */}
            <path d="M3 9 L3 15 L7 15 L13 19 L13 5 L7 9 Z" />
            {/* small arc */}
            <path d="M16 9.5 C17 9.5 18 10.6 18 12 C18 13.4 17 14.5 16 14.5" />
            {/* large arc */}
            <path d="M16 6.5 C19 6.5 21.5 9 21.5 12 C21.5 15 19 17.5 16 17.5" />
            {/* handle */}
            <line x1="5" y1="15" x2="5" y2="20" />
        </svg>
    );
}

/** 電影打板機 (進階版) */
export function ClapperIcon({ size = 24, className = '', strokeWidth = 1.5 }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            {/* board body */}
            <rect x="2" y="9" width="20" height="13" rx="2" />
            {/* top flap */}
            <path d="M2 9 L2 6 L22 6 L22 9" />
            {/* diagonal stripes on flap */}
            <line x1="5" y1="6" x2="7" y2="9" />
            <line x1="9" y1="6" x2="11" y2="9" />
            <line x1="13" y1="6" x2="15" y2="9" />
            <line x1="17" y1="6" x2="19" y2="9" />
            {/* text area lines */}
            <line x1="5" y1="13" x2="19" y2="13" />
            <line x1="5" y1="17" x2="19" y2="17" />
        </svg>
    );
}

/** 放映機 */
export function ProjectorIcon({ size = 24, className = '', strokeWidth = 1.5 }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            {/* body */}
            <rect x="2" y="7" width="14" height="10" rx="2" />
            {/* lens */}
            <circle cx="16" cy="12" r="3" />
            <circle cx="16" cy="12" r="1.2" fill="currentColor" stroke="none" />
            {/* film reels on top */}
            <circle cx="5" cy="5" r="2" />
            <circle cx="11" cy="5" r="2" />
            <line x1="5" y1="5" x2="11" y2="5" />
            {/* projection beam */}
            <path d="M19 10 L23 7" strokeDasharray="1.5 1.5" />
            <path d="M19 14 L23 17" strokeDasharray="1.5 1.5" />
            {/* stand */}
            <line x1="9" y1="17" x2="9" y2="21" />
            <line x1="6" y1="21" x2="12" y2="21" />
        </svg>
    );
}

/**
 * 全頁背景裝飾：浮動電影圖示
 * 放在 login 頁面或主頁背景層。
 */
export function FilmBackgroundDecorations() {
    return (
        <div className="pointer-events-none select-none absolute inset-0 overflow-hidden" aria-hidden="true">
            {/* top-left: film reel */}
            <FilmReelIcon
                size={160}
                strokeWidth={0.9}
                className="absolute -top-10 -left-10 text-white/[0.10] rotate-12"
            />
            {/* top-right: clapperboard */}
            <ClapperIcon
                size={130}
                strokeWidth={0.9}
                className="absolute top-8 -right-8 text-white/[0.10] -rotate-15"
            />
            {/* bottom-left: film strip */}
            <FilmStripIcon
                size={150}
                strokeWidth={0.9}
                className="absolute -bottom-8 -left-6 text-white/[0.10] rotate-6"
            />
            {/* bottom-right: 3d glasses */}
            <Glasses3DIcon
                size={120}
                strokeWidth={0.9}
                className="absolute bottom-20 -right-4 text-white/[0.10] -rotate-8"
            />
            {/* center area extras */}
            <FilmReelIcon
                size={90}
                strokeWidth={0.9}
                className="absolute top-1/3 right-1/4 text-white/[0.06] rotate-45"
            />
            <MegaphoneIcon
                size={100}
                strokeWidth={0.9}
                className="absolute top-1/2 left-1/5 text-white/[0.06] -rotate-12"
            />
        </div>
    );
}

/** 向日葵 */
export function SunflowerIcon({ size = 24, className = '', strokeWidth = 1.5 }: IconProps) {
    const petals = [0, 45, 90, 135, 180, 225, 270, 315];
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            {petals.map(angle => (
                <ellipse key={angle} cx="12" cy="6.5" rx="2" ry="3.2" transform={`rotate(${angle} 12 12)`} />
            ))}
            <circle cx="12" cy="12" r="3.5" />
            <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
        </svg>
    );
}

/** 紅寶石鞋 */
export function RubySlipperIcon({ size = 24, className = '', strokeWidth = 1.5 }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            {/* upper */}
            <path d="M4 17 Q4 13 8 12 Q12 11 16 11 Q20 11 21 13 L21 17 Z" />
            {/* sole */}
            <path d="M3 17 L22 17 L22 19 Q21 19.5 20 19.5 L4 19.5 Q3 19.5 3 19 Z" />
            {/* toe decoration */}
            <path d="M14 11.5 Q17 10.5 19.5 12.5" />
        </svg>
    );
}

/** 翡翠城城堡 */
export function EmeraldCastleIcon({ size = 24, className = '', strokeWidth = 1.5 }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            {/* main tower */}
            <rect x="8" y="9" width="8" height="12" rx="0.5" />
            {/* merlons */}
            <rect x="8.5" y="6" width="2" height="4" rx="0.5" />
            <rect x="11" y="6" width="2" height="4" rx="0.5" />
            <rect x="13.5" y="6" width="2" height="4" rx="0.5" />
            {/* arched window */}
            <path d="M11 14 L11 18 L13 18 L13 14 Q13 12 12 12 Q11 12 11 14 Z" />
            {/* side towers */}
            <rect x="3" y="13" width="5" height="8" rx="0.5" />
            <rect x="16" y="13" width="5" height="8" rx="0.5" />
            <rect x="3.5" y="11" width="1.5" height="3" rx="0.3" />
            <rect x="5.5" y="11" width="1.5" height="3" rx="0.3" />
            <rect x="16.5" y="11" width="1.5" height="3" rx="0.3" />
            <rect x="18.5" y="11" width="1.5" height="3" rx="0.3" />
        </svg>
    );
}

/** 彩虹 */
export function RainbowIcon({ size = 24, className = '', strokeWidth = 1.5 }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            <path d="M2 19 A10 10 0 0 1 22 19" />
            <path d="M4.5 19 A7.5 7.5 0 0 1 19.5 19" />
            <path d="M7 19 A5 5 0 0 1 17 19" />
            {/* ground dots */}
            <circle cx="2" cy="19" r="0.8" fill="currentColor" stroke="none" />
            <circle cx="22" cy="19" r="0.8" fill="currentColor" stroke="none" />
        </svg>
    );
}

/** 錫人的心 */
export function HeartGlowIcon({ size = 24, className = '', strokeWidth = 1.5 }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            <path d="M12 8 C15 4 20 5 20 9 C20 14 16 18 12 20 C8 18 4 14 4 9 C4 5 9 4 12 8 Z" />
            {/* glow sparkles */}
            <line x1="12" y1="2" x2="12" y2="4" />
            <line x1="19" y1="5" x2="21" y2="4" />
            <line x1="5" y1="5" x2="3" y2="4" />
            <line x1="21" y1="12" x2="23" y2="12" />
        </svg>
    );
}

/** 魔法棒星星 */
export function StarWandIcon({ size = 24, className = '', strokeWidth = 1.5 }: IconProps) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
            {/* five-pointed star */}
            <path d="M12 3 L13.8 8.5 L19.5 8.5 L14.9 11.8 L16.6 17.3 L12 14 L7.4 17.3 L9.1 11.8 L4.5 8.5 L10.2 8.5 Z" />
            {/* wand stick */}
            <line x1="12" y1="14" x2="12" y2="22" />
            {/* sparkles */}
            <line x1="17" y1="3" x2="18.5" y2="1.5" />
            <line x1="7" y1="3" x2="5.5" y2="1.5" />
            <line x1="20" y1="7" x2="22" y2="6" />
            <line x1="4" y1="7" x2="2" y2="6" />
        </svg>
    );
}

/**
 * 水平黃磚路裝飾帶（取代舊電影膠卷條紋）
 * 標準偏移磚塊排列：Row 1 兩塊完整磚，Row 2 半磚＋完整磚＋半磚（拼接後對齊）
 * 放在 Header 上下緣。
 */
export function YellowBrickDivider({ className = '' }: { className?: string }) {
    // Pattern tile = 44 × 16 px
    // Row 1 (y=1..6):  [brick 0..19] [mortar 2px] [brick 22..41] [mortar 2px to tile edge]
    // Row 2 (y=9..14): [half 0..9] [mortar 2px] [brick 12..31] [mortar 2px] [half 34..43]
    //   ↑ the two halves join across tile boundaries to form a complete offset brick
    return (
        <div className={`w-full overflow-hidden ${className}`} aria-hidden="true">
            <svg width="100%" height="16" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <pattern id="yellowbrick-pattern" x="0" y="0" width="44" height="16" patternUnits="userSpaceOnUse">
                        {/* Row 1 — two full bricks */}
                        <rect x="0"  y="1" width="20" height="6" rx="0.5" fill="currentColor" opacity="0.60" />
                        <rect x="22" y="1" width="20" height="6" rx="0.5" fill="currentColor" opacity="0.60" />
                        {/* Row 2 — offset: left half | full brick | right half */}
                        <rect x="0"  y="9" width="10" height="6" rx="0.5" fill="currentColor" opacity="0.48" />
                        <rect x="12" y="9" width="20" height="6" rx="0.5" fill="currentColor" opacity="0.60" />
                        <rect x="34" y="9" width="10" height="6" rx="0.5" fill="currentColor" opacity="0.48" />
                    </pattern>
                </defs>
                <rect width="100%" height="16" fill="url(#yellowbrick-pattern)" />
            </svg>
        </div>
    );
}

/**
 * 水平膠卷條紋裝飾帶（保留備用，Header 已改用 YellowBrickDivider）
 */
export function FilmStripDivider({ className = '' }: { className?: string }) {
    return (
        <div className={`w-full overflow-hidden ${className}`} aria-hidden="true">
            <svg width="100%" height="20" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <pattern id="filmstrip-pattern" x="0" y="0" width="40" height="20" patternUnits="userSpaceOnUse">
                        <rect x="4" y="1" width="6" height="5" rx="1.5" fill="currentColor" opacity="0.35" />
                        <rect x="4" y="14" width="6" height="5" rx="1.5" fill="currentColor" opacity="0.35" />
                        <line x1="14" y1="0" x2="14" y2="20" stroke="currentColor" strokeWidth="0.5" opacity="0.2" />
                    </pattern>
                </defs>
                <rect width="100%" height="20" fill="url(#filmstrip-pattern)" />
            </svg>
        </div>
    );
}
