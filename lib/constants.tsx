import {
    EyeOff, Flame, Droplets, Wind, Ghost, Heart,
    ThumbsUp, BookOpen, Brain, Sparkles, Star, Utensils,
    HeartHandshake, TreePine, Waves, Moon, Laugh, Music2, Sun,
    Salad, MicVocal, Target, PenLine, Music, Flower2, Bell,
    Phone, Mic, Award, Users, PhoneCall,
    WandSparkles, Zap, Eye, Drum,
    type LucideIcon,
} from 'lucide-react';
import { Quest, ZoneInfo } from '@/types';

export const BASE_START_DATE_STR = "2026-02-01";
export const END_DATE = "2026-06-28";
export const PENALTY_PER_DAY = 50;

export function calculateLevelFromExp(exp: number): number {
    let currentLevel = 1;
    let accumulatedExp = 0;

    while (currentLevel < 99) {
        const nextLevelRequired = currentLevel * 5 + 480;
        if (exp >= accumulatedExp + nextLevelRequired) {
            accumulatedExp += nextLevelRequired;
            currentLevel++;
        } else {
            break;
        }
    }
    return currentLevel;
}

export function getExpForNextLevel(currentLevel: number): number {
    if (currentLevel >= 99) return 0;
    return currentLevel * 5 + 480;
}

export const ADMIN_PASSWORD = "123";

export const ZONES: ZoneInfo[] = [
    { id: 'pride', name: '愛情片．甜蜜陷阱', char: '偶像明星', color: '#f8fafc', textColor: 'text-pink-400', icon: <Heart size={14} /> },
    { id: 'doubt', name: '劇情片．反轉迷宮', char: '文藝名導', color: '#1e3a8a', textColor: 'text-blue-400', icon: <EyeOff size={14} /> },
    { id: 'anger', name: '動作片．爆破前線', char: '動作巨星', color: '#991b1b', textColor: 'text-red-500', icon: <Flame size={14} /> },
    { id: 'greed', name: '喜劇片．歡笑泥沼', char: '喜劇泰斗', color: '#14532d', textColor: 'text-emerald-500', icon: <Droplets size={14} /> },
    { id: 'delusion', name: '科幻片．綠幕幻境', char: '特效大師', color: '#78350f', textColor: 'text-orange-500', icon: <Wind size={14} /> },
    { id: 'chaos', name: '爛片．票房毒藥', char: 'Boss', color: '#1e293b', textColor: 'text-slate-400', icon: <Ghost size={14} /> },
];


// ── 每日定課 ──────────────────────────────────────────────────────────────
// 規則：
//   體運定課  q1(+1000) / q1_dawn(+2000) 每日擇一，互斥
//   任意定課  q2–q22 各 +1000，每日共用上限 3 種（每種各最多 1 次）
//   關係定課  r1 +2000／人，每日最多 3 名（見 quest.ts 特別處理）
export const DAILY_QUEST_CONFIG: Quest[] = [
    { id: 'q1',  title: '體運定課',    sub: '打拳或運動 30 分鐘', reward: 1000 },
    { id: 'q2',  title: '每日五感恩',  icon: '🙏', reward: 1000 },
    { id: 'q3',  title: '觀心書',      icon: '📖', reward: 1000 },
    { id: 'q4',  title: '靜心冥想',    icon: '🧘', reward: 1000 },
    { id: 'q5',  title: '自我肯定',    icon: '✨', reward: 1000 },
    { id: 'q6',  title: '感恩冥想',    icon: '💛', reward: 1000 },
    { id: 'q7',  title: '創造法則冥想',icon: '🌟', reward: 1000 },
    { id: 'q8',  title: '餐前感恩',    icon: '🍽️', reward: 1000 },
    { id: 'q9',  title: '欣賞伴侶',    icon: '💑', reward: 1000 },
    { id: 'q10', title: '接地氣',      icon: '🌿', reward: 1000 },
    { id: 'q11', title: '接海氣',      icon: '🌊', reward: 1000 },
    { id: 'q12', title: '子時入睡',    icon: '🌙', reward: 1000 },
    { id: 'q13', title: '大笑功法',    icon: '😄', reward: 1000 },
    { id: 'q14', title: '熱舞',        icon: '💃', reward: 1000 },
    { id: 'q15', title: '光的冥想',    icon: '☀️', reward: 1000 },
    { id: 'q16', title: '一日一蔬食',  icon: '🥦', reward: 1000 },
    { id: 'q17', title: '大悲咒',      icon: '🕉️', reward: 1000 },
    { id: 'q18', title: '活在當下',    icon: '🎯', reward: 1000 },
    { id: 'q19', title: '抄心經',      icon: '📝', reward: 1000 },
    { id: 'q20', title: '當下之舞',    icon: '🎶', reward: 1000 },
    { id: 'q21', title: '祝福',        icon: '🌸', reward: 1000 },
    { id: 'q22', title: '嗯啊吽',      icon: '🔔', reward: 1000 },
    { id: 'r1',  title: '關係定課',    sub: '與三貴人或伴侶有品質互動（≥15分鐘）', reward: 2000 },
];

// 任意定課 ID 集合，供伺服器端驗證與前端篩選共用
export const FLEX_QUEST_IDS = new Set([
    'q2','q3','q4','q5','q6','q7','q8','q9','q10','q11',
    'q12','q13','q14','q15','q16','q17','q18','q19','q20','q21','q22',
]);

// ── 每週 / 雙週 / 月任務 ──────────────────────────────────────────────────
// a1：天使通話      +500／次，每週至少1次、最多3次
// w1：親證分享      +1000，每週最多1則
// w2：欣賞／肯定夥伴 +1000，每週最多3則（各不同人）
// w3：小隊定聚      +5000，每月最多2次
// w4：小隊通話      +3000，每月最多2次
export const WEEKLY_QUEST_CONFIG: Quest[] = [
    { id: 'a1', title: '主創對談',       sub: '分享本週拍攝進度（每週 1–3 次）', reward: 500,  limit: 3, icon: '👼' },
    { id: 'w1', title: '精彩片段分享',   sub: '群組分享上週花絮 & 下週劇本規劃',  reward: 1000, limit: 1, icon: '🎙️' },
    { id: 'w2', title: '讚賞合製夥伴',   sub: '每次需為不同人，每週最多 3 則',   reward: 1000, limit: 3, icon: '🌟' },
    { id: 'w3', title: '劇組首映會',     sub: '小隊專屬首映（每月最多 2 次）',   reward: 5000, limit: 2, icon: '🎪' },
    { id: 'w4', title: '劇組會議',       sub: '分享拍攝心得，給予劇組支持（每月最多 2 次）', reward: 3000, limit: 2, icon: '📞' },
];

// ── 小隊主題定聚任務（搭配 w3 使用）────────────────────────────────────────
// 除 w3 基礎 +5000 外，另加主題分數；全員到齊再加成
export const SQUAD_THEME_CONFIG = [
    { id: 'sq1', title: '阿拉丁',   attr: '陽／適應力',     reward: 3000, bonusFull: 2000, icon: '🧞', desc: '帶領夥伴一起去掃公所，體驗突破適應力的過程' },
    { id: 'sq2', title: 'F1賽車',   attr: '陰／找回初衷',   reward: 3000, bonusFull: 2000, icon: '🏎️', desc: '分享工作或生活中的卡關之處，如何轉念並訂立行動方案' },
    { id: 'sq3', title: '獵魔女團', attr: '陰／接納不完美', reward: 3000, bonusFull: 2000, icon: '🔮', desc: '探討自己最不能接受的缺點，如何接納並化為優點' },
    { id: 'sq4', title: '陣頭',     attr: '陽／主動吃苦',   reward: 3000, bonusFull: 2000, icon: '🥁', desc: '透過爬山主動吃向上的苦，透過彼此扶持體驗團隊力量' },
];

// ── Quest Icon Map（ID → Lucide Component）─────────────────────────────────
export const QUEST_ICON_MAP: Record<string, LucideIcon> = {
    q2:  ThumbsUp,       // 每日五感恩
    q3:  BookOpen,       // 觀心書
    q4:  Brain,          // 靜心冥想
    q5:  Sparkles,       // 自我肯定
    q6:  Heart,          // 感恩冥想
    q7:  Star,           // 創造法則冥想
    q8:  Utensils,       // 餐前感恩
    q9:  HeartHandshake, // 欣賞伴侶
    q10: TreePine,       // 接地氣
    q11: Waves,          // 接海氣
    q12: Moon,           // 子時入睡
    q13: Laugh,          // 大笑功法
    q14: Music2,         // 熱舞
    q15: Sun,            // 光的冥想
    q16: Salad,          // 一日一蔬食
    q17: MicVocal,       // 大悲咒
    q18: Target,         // 活在當下
    q19: PenLine,        // 抄心經
    q20: Music,          // 當下之舞
    q21: Flower2,        // 祝福
    q22: Bell,           // 嗯啊吽
    // Weekly quests
    a1:  Phone,          // 天使通話
    w1:  Mic,            // 親證分享
    w2:  Award,          // 欣賞／肯定夥伴
    w3:  Users,          // 小隊定聚
    w4:  PhoneCall,      // 小隊通話
};

// ── Squad Theme Icon Map（ID → Lucide Component）───────────────────────────
export const SQUAD_THEME_ICON_MAP: Record<string, LucideIcon> = {
    sq1: WandSparkles,   // 阿拉丁
    sq2: Zap,            // F1賽車
    sq3: Eye,            // 獵魔女團
    sq4: Drum,           // 陣頭
};

export const SQUAD_ROLES = ['副隊長', '抱抱', '衡衡', '叮叮1號', '叮叮2號', '樂樂'] as const;
