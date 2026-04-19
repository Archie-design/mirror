import {
    Flame, Heart, ThumbsUp, BookOpen, Brain, Sparkles, Star, Utensils,
    HeartHandshake, Waves, Moon, Sun, Salad, MicVocal, Target, PenLine,
    Bell, Phone, Mic, Award, Users, Zap,
    type LucideIcon,
} from 'lucide-react';
import { Quest } from '@/types';

// ⚠️ ADMIN_PASSWORD 已移除（之前為明文 "123" hardcode）。
// 請改用 process.env.ADMIN_PASSWORD（透過 server action 比對），
// 客戶端不應再持有任何管理員密碼字串。
// 相關檔案：app/actions/admin-auth.ts

// ── 基本定課（20分/項，每日上限3項）────────────────────────────────────────
// d1–d8：做不習慣但有意義的內在練習，建立向上慣性
// 每日最多完成 3 項，計入 DAILY_BASIC_LIMIT
export const DAILY_BASIC_CONFIG: Quest[] = [
    { id: 'd1', title: '五感恩',   sub: '每日五感恩練習',                   reward: 20, icon: '🙏' },
    { id: 'd2', title: '餐前感恩', sub: '餐前感恩練習',                     reward: 20, icon: '🍽️' },
    { id: 'd3', title: '嗯啊吽',   sub: '嗯啊吽咒語練習',                   reward: 20, icon: '🔔' },
    { id: 'd4', title: '感恩冥想', sub: '感恩冥想練習',                     reward: 20, icon: '💛' },
    { id: 'd5', title: '抄經',     sub: '抄寫心經或指定經文',               reward: 20, icon: '📝' },
    { id: 'd6', title: '光的冥想', sub: '光的冥想練習',                     reward: 20, icon: '☀️' },
    { id: 'd7', title: '欣賞',     sub: '欣賞伴侶或身邊的人',               reward: 20, icon: '💑' },
    { id: 'd8', title: '活在當下', sub: '活在當下練習',                     reward: 20, icon: '🎯' },
];

// 基本定課 ID 集合，供伺服器端驗證與前端篩選共用
export const BASIC_QUEST_IDS = new Set(['d1','d2','d3','d4','d5','d6','d7','d8']);
export const DAILY_BASIC_LIMIT = 3;

// ── 加權定課（50分/項，每日上限3項）────────────────────────────────────────
// p1–p5：需要更深刻投入或身體力行的修練
// 每日最多完成 3 項，與基本定課各自獨立計算
export const DAILY_WEIGHTED_CONFIG: Quest[] = [
    { id: 'p1', title: '打拳',     sub: '每日至少打一種拳或運動30分鐘',             reward: 50, icon: '🥊' },
    { id: 'p2', title: '觀心書',   sub: '閱讀觀心書',                               reward: 50, icon: '📖' },
    { id: 'p3', title: '大悲咒',   sub: '持誦大悲咒',                               reward: 50, icon: '🕉️' },
    { id: 'p4', title: '子時入睡', sub: '子時（23:00）前入睡',                      reward: 50, icon: '🌙' },
    { id: 'p5', title: '痛參',     sub: '對生活中遇到的痛苦，透過內觀參解其出現的意義', reward: 50, icon: '🧠' },
];

// 加權定課 ID 集合，供伺服器端驗證與前端篩選共用
export const WEIGHTED_QUEST_IDS = new Set(['p1','p2','p3','p4','p5']);
export const DAILY_WEIGHTED_LIMIT = 3;

// ── 破曉打拳（獨立加成，不佔用名額）───────────────────────────────────────
export const DAWN_QUEST: Quest = {
    id: 'p1_dawn',
    title: '破曉打拳',
    sub: '在破曉時段（05:00–08:00）完成打拳，疊加在打拳 p1 之上',
    reward: 50,
    icon: '🌅',
};

// ── 每日飲控（獨立計分，每日擇一，不佔用定課名額）─────────────────────────
export const DIET_QUEST_CONFIG: Quest[] = [
    { id: 'diet_veg',     title: '三餐吃素',   sub: '今日三餐全素',    reward: 50, icon: '🥦' },
    { id: 'diet_seafood', title: '三餐海鮮素', sub: '今日三餐海鮮素',  reward: 30, icon: '🌊' },
];

// 飲控任務 ID 集合（每日只能擇一）
export const DIET_QUEST_IDS = new Set(['diet_veg', 'diet_seafood']);

// ── 每週任務 ──────────────────────────────────────────────────────────────
// wk1：破框練習，每週最多 3 次
// wk2：天使通話，每週最多 2 次
// wk3_online / wk3_offline：小組凝聚，每週 1 次，須審核
// wk4_small / wk4_large：人生大戲分享，每週各 1 次
export const WEEKLY_QUEST_CONFIG: Quest[] = [
    { id: 'wk1',         title: '破框練習',         sub: '做不習慣、討厭、害怕的事；在小群分享',              reward: 200, limit: 3 },
    { id: 'wk2',         title: '天使通話',         sub: '與夥伴進行天使通話，分享近期親證狀況',              reward: 200, limit: 2 },
    { id: 'wk3_online',  title: '小組凝聚（線上）', sub: '線上小組聚會，須審核',                             reward: 100, limit: 1 },
    { id: 'wk3_offline', title: '小組凝聚（實體）', sub: '實體小組聚會（全到+400，大隊長出席再+100），須審核', reward: 300, limit: 1 },
    { id: 'wk4_small',   title: '人生大戲（小群）', sub: '選定最弱一運，在小群分享親證狀況',                  reward: 200, limit: 1 },
    { id: 'wk4_large',   title: '人生大戲（大群）', sub: '選定最弱一運，在大群（全隊）分享親證狀況',           reward: 300, limit: 1 },
];

// ── Quest Icon Map（ID → Lucide Component）─────────────────────────────────
export const QUEST_ICON_MAP: Record<string, LucideIcon> = {
    // 基本定課
    d1: ThumbsUp,       // 五感恩
    d2: Utensils,       // 餐前感恩
    d3: Bell,           // 嗯啊吽
    d4: Heart,          // 感恩冥想
    d5: PenLine,        // 抄經
    d6: Sun,            // 光的冥想
    d7: HeartHandshake, // 欣賞
    d8: Target,         // 活在當下
    // 加權定課
    p1: Flame,          // 打拳
    p2: BookOpen,       // 觀心書
    p3: MicVocal,       // 大悲咒
    p4: Moon,           // 子時入睡
    p5: Brain,          // 痛參
    // 破曉打拳
    p1_dawn: Sparkles,  // 破曉打拳
    // 飲控
    diet_veg:     Salad, // 三餐吃素
    diet_seafood: Waves, // 三餐海鮮素
    // 每週任務
    wk1:         Zap,   // 破框練習
    wk2:         Phone, // 天使通話
    wk3_online:  Star,  // 小組凝聚（線上）
    wk3_offline: Users, // 小組凝聚（實體）
    wk4_small:   Mic,   // 人生大戲（小群）
    wk4_large:   Award, // 人生大戲（大群）
};

export const SQUAD_ROLES = ['副隊長', '抱抱', '衡衡', '叮叮1號', '叮叮2號', '樂樂'] as const;

export const COMPANION_TYPES = ['事業運', '財富運', '情感運', '家庭運', '體能運'] as const;
export type CompanionType = typeof COMPANION_TYPES[number];
