import React from 'react';
import { Snowflake, EyeOff, Flame, Droplets, Wind, Ghost } from 'lucide-react';
import { Quest, ZoneInfo, CharacterStats } from '@/types';

export const BASE_START_DATE_STR = "2026-02-01";
export const PENALTY_PER_DAY = 50;
export const ADVENTURE_COST = 3;
export const ADMIN_PASSWORD = "123";

export const DEFAULT_CONFIG = {
    CENTER_SIDE: 15,
    CORRIDOR_W: 5,
    CORRIDOR_L: 60,
    SUBZONE_SIDE: 15,
    HEX_SIZE_WORLD: 8.0,
    HEX_SIZE_EDITOR: 25,
};

export const ZONES: ZoneInfo[] = [
    { id: 'pride', name: '慢．傲慢之巔', char: '白龍馬', color: '#f8fafc', textColor: 'text-slate-100', icon: <Snowflake size={14} /> },
    { id: 'doubt', name: '疑．迷途森林', char: '唐三藏', color: '#1e3a8a', textColor: 'text-blue-400', icon: <EyeOff size={14} /> },
    { id: 'anger', name: '嗔．焦熱荒原', char: '孫悟空', color: '#991b1b', textColor: 'text-red-500', icon: <Flame size={14} /> },
    { id: 'greed', name: '貪．慾望泥沼', char: '豬八戒', color: '#14532d', textColor: 'text-emerald-500', icon: <Droplets size={14} /> },
    { id: 'delusion', name: '痴．虛妄流沙', char: '沙悟淨', color: '#78350f', textColor: 'text-orange-500', icon: <Wind size={14} /> },
    { id: 'chaos', name: '混沌迷霧', char: 'Boss', color: '#1e293b', textColor: 'text-slate-400', icon: <Ghost size={14} /> },
];

export const ROLE_CURE_MAP: Record<string, {
    poison: string;
    color: string;
    cureTaskId: string;
    bonusStat: keyof CharacterStats;
    talent: string;
    curseName: string;
    curseEffect: string;
    avatar: string;
}> = {
    '孫悟空': {
        poison: '破嗔', color: 'bg-red-500', cureTaskId: 'q2', bonusStat: 'Spirit',
        talent: '越戰越勇：連續打卡疊加攻擊力，無視迷霧陷阱。',
        curseName: '緊箍咒', curseEffect: '暴躁狀態。移動路徑發生隨機偏移。',
        avatar: '🐒'
    },
    '豬八戒': {
        poison: '破貪', color: 'bg-emerald-500', cureTaskId: 'q6', bonusStat: 'Physique',
        talent: '福星高照：資源雙倍，滿骰加 HP。',
        curseName: '貪吃誤事', curseEffect: '懶惰狀態。移動消耗加倍。',
        avatar: '🐷'
    },
    '沙悟淨': {
        poison: '破痴', color: 'bg-purple-500', cureTaskId: 'q4', bonusStat: 'Savvy',
        talent: '捲簾大將：相鄰隊友防禦加成，地形懲罰免疫。',
        curseName: '迷霧障眼', curseEffect: '無明狀態。地圖怪物數值隱藏。',
        avatar: '🐢'
    },
    '白龍馬': {
        poison: '破慢', color: 'bg-orange-500', cureTaskId: 'q5', bonusStat: 'Charisma',
        talent: '日行千里：移動骰基礎 +2，回收步數。',
        curseName: '傲慢之牆', curseEffect: '孤立狀態。無法團隊 Buff。',
        avatar: '🐎'
    },
    '唐三藏': {
        poison: '破疑', color: 'bg-blue-500', cureTaskId: 'q3', bonusStat: 'Potential',
        talent: '信念之光：加成傳愛獎勵，範圍回血。',
        curseName: '寸步難行', curseEffect: '懷疑狀態。移動力減半。',
        avatar: '🧘'
    }
};

export const DAILY_QUEST_CONFIG: Quest[] = [
    { id: 'q1', title: '打拳', sub: '身體開發', reward: 200, dice: 1 },
    { id: 'q2', title: '感恩冥想', sub: '對治嗔心', reward: 100, dice: 1 },
    { id: 'q3', title: '當下之舞', sub: '對治疑心', reward: 100, dice: 1 },
    { id: 'q4', title: '嗯啊吽七次', sub: '覺醒痴念', reward: 100, dice: 1 },
    { id: 'q5', title: '五感恩', sub: '放下傲慢', reward: 100, dice: 1 },
    { id: 'q6', title: '海鮮素', sub: '節制貪慾', reward: 100, dice: 1 },
    { id: 'q7', title: '子時入睡', sub: '能量補給', reward: 100, dice: 1 }
];

export const WEEKLY_QUEST_CONFIG: Quest[] = [
    { id: 'w1', title: '小天使通話', sub: '關心夥伴 (15min)', reward: 500, limit: 1, icon: '👼' },
    { id: 'w2', title: '參加心成活動', sub: '聚會、培訓、活動', reward: 500, limit: 2, icon: '🏛️' },
    { id: 'w3', title: '家人互動親證', sub: '視訊或品質陪伴', reward: 500, limit: 1, icon: '🏠' },
    { id: 'w4', title: '傳愛分數', sub: '訪談成功加分', reward: 1000, limit: 99, icon: '❤️' }
];

export const TERRAIN_TYPES: Record<string, any> = {
    grass: { id: 'grass', name: '茵綠草地', url: 'https://cdn-icons-png.flaticon.com/512/1041/1041916.png', color: '#1a472a', effect: '【移動】消耗 1 點。' },
    roots: { id: 'roots', name: '世界樹根', url: 'https://cdn-icons-png.flaticon.com/512/4289/4289139.png', color: '#064e3b', effect: '【阻擋】無法通行。' },
    spring: { id: 'spring', name: '能量湧泉', url: 'https://cdn-icons-png.flaticon.com/512/427/427745.png', color: '#38bdf8', effect: '【特殊】回復 10% HP，擲骰 +1。' },
    snow_path: { id: 'snow_path', name: '積雪山徑', url: 'https://cdn-icons-png.flaticon.com/512/2334/2334336.png', color: '#e2e8f0', effect: '【移動】消耗 1 點。' },
    dark_trail: { id: 'dark_trail', name: '幽暗小徑', url: 'https://cdn-icons-png.flaticon.com/512/2590/2590327.png', color: '#1a472a', effect: '【移動】消耗 1 點。' },
};
