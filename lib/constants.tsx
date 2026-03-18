import React from 'react';
import { Snowflake, EyeOff, Flame, Droplets, Wind, Ghost } from 'lucide-react';
import { Quest, ZoneInfo, CharacterStats } from '@/types';

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

export const ARTIFACTS_CONFIG = [
    {
        id: 'a1',
        name: '如意金箍棒',
        description: '齊天大聖孫悟空的至寶，變化萬千，每人限定一把。',
        effect: '個人總經驗獲取 ×1.2 倍',
        price: 1200,
        isTeamBinding: false,
        limit: 1
    },
    {
        id: 'a2',
        name: '照妖鏡',
        description: '「照見」——日出前的清醒自照，破曉打拳的修行哲學。',
        effect: '破曉打拳額外 +150 修為（不可回溯）',
        price: 250,
        isTeamBinding: false,
        limit: 1
    },
    {
        id: 'a3',
        name: '七彩袈裟',
        description: '唐三藏的聖物，象徵精進修行的榮耀。',
        effect: '全隊打拳經驗 ×1.5 倍',
        price: 550, // per member
        isTeamBinding: true,
        limit: 99
    },
    {
        id: 'a4',
        name: '幌金繩',
        description: '金角大王的法寶，能縛住一切貪著。',
        effect: '參加體系活動個人經驗 ×1.5 倍',
        price: 700, // per member
        isTeamBinding: true,
        limit: 99
    },
    {
        id: 'a5',
        name: '金剛杖',
        description: '六十歲以上修煉者專屬道具，無法與如意金箍棒疊加。',
        effect: '個人總經驗 ×1.2 倍（60歲以上長輩免費贈；不可與如意金箍棒疊加）',
        price: 0, // free for elders, admin grants
        isTeamBinding: false,
        limit: 1,
        exclusiveWith: 'a1'
    },
    {
        id: 'a6',
        name: '定風珠',
        description: '「靜心」——定風珠能令人心定氣閒，如如不動，對治浮躁。',
        effect: '親證圓夢計劃每次完成 +300 修為（每週上限 3 次）',
        price: 650,
        isTeamBinding: false,
        limit: 1
    }
];
export const ADVENTURE_COST = 1;
export const ADMIN_PASSWORD = "123";

export const CHEST_LOOT_TABLE = [
    { dice: 1, weight: 60 },
    { dice: 2, weight: 30 },
    { dice: 3, weight: 10 }
];

export const MIMIC_CHANCE = 0.2; // 20% base chance

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
    baseHP: number;
    hpScale: number; // multiplier for Physique
    baseDEF: number;
}> = {
    '孫悟空': {
        poison: '破嗔', color: 'bg-red-500', cureTaskId: 'q2', bonusStat: 'Spirit',
        talent: '越戰越勇：連續打卡疊加攻擊力，無視迷霧陷阱。',
        curseName: '緊箍咒', curseEffect: '暴躁狀態。移動路徑發生隨機偏移。',
        avatar: '🐒',
        baseHP: 1000, hpScale: 50, baseDEF: 50
    },
    '豬八戒': {
        poison: '破貪', color: 'bg-emerald-500', cureTaskId: 'q6', bonusStat: 'Physique',
        talent: '福星高照：資源雙倍，滿骰加 HP。',
        curseName: '貪吃誤事', curseEffect: '懶惰狀態。移動消耗加倍。',
        avatar: '豬',
        baseHP: 1500, hpScale: 80, baseDEF: 60
    },
    '沙悟淨': {
        poison: '破痴', color: 'bg-purple-500', cureTaskId: 'q4', bonusStat: 'Savvy',
        talent: '捲簾大將：相鄰隊友防禦加成，地形懲罰免疫。',
        curseName: '迷霧障眼', curseEffect: '無明狀態。地圖怪物數值隱藏。',
        avatar: '🐢',
        baseHP: 1200, hpScale: 60, baseDEF: 80
    },
    '白龍馬': {
        poison: '破慢', color: 'bg-orange-500', cureTaskId: 'q5', bonusStat: 'Charisma',
        talent: '日行千里：移動骰基礎 +2，回收步數。',
        curseName: '傲慢之牆', curseEffect: '孤立狀態。無法團隊 Buff。',
        avatar: '🐎',
        baseHP: 800, hpScale: 40, baseDEF: 40
    },
    '唐三藏': {
        poison: '破疑', color: 'bg-blue-500', cureTaskId: 'q3', bonusStat: 'Potential',
        talent: '信念之光：加成傳愛獎勵，範圍回血。',
        curseName: '寸步難行', curseEffect: '懷疑狀態。移動力減半。',
        avatar: '🧘',
        baseHP: 500, hpScale: 20, baseDEF: 30
    }
};

export const ROLE_GROWTH_RATES: Record<string, Partial<Record<keyof CharacterStats, number>>> = {
    '孫悟空': { Physique: 3, Potential: 2, Charisma: 1, Luck: 1, Savvy: 1, Spirit: 0 },
    '豬八戒': { Luck: 4, Charisma: 1, Potential: 1, Spirit: 1, Savvy: 1, Physique: 0 },
    '沙悟淨': { Spirit: 2, Physique: 2, Charisma: 1, Potential: 2, Luck: 1, Savvy: 0 },
    '白龍馬': { Charisma: 3, Luck: 3, Savvy: 1, Spirit: 1, Potential: 0, Physique: 0 },
    '唐三藏': { Spirit: 4, Potential: 3, Savvy: 1, Charisma: 0, Luck: 0, Physique: 0 }
};

export const IN_GAME_ITEMS = [
    // Combat
    { id: 'i1', name: '紫金紅葫蘆', type: 'combat', desc: '秒殺或收服低階心魔怪，直接獲取掉落物。', icon: '🏺', price: 100 },
    { id: 'i2', name: '照妖鏡', type: 'combat', desc: '破除 3 格內的迷霧，識破偽裝寶箱怪的真面目。', icon: '🪞', price: 80 },
    { id: 'i3', name: '錦鑭袈裟', type: 'combat', desc: '裝備後抵擋一次致死傷害，保留 1 點 HP。', icon: '🥻', price: 300 },
    { id: 'i4', name: '如意金剛琢', type: 'combat', desc: '丟出後封印目標怪物被動技能 2 回合。', icon: '⭕', price: 150 },
    // Exploration
    { id: 'i5', name: '步雲履', type: 'exploration', desc: '裝備當回合無視地形高低差與移動懲罰。', icon: '🥾', price: 120 },
    { id: 'i6', name: '芭蕉扇', type: 'exploration', desc: '吹散沙塵暴地形，或將直線上的怪物擊退 3 格。', icon: '🪭', price: 150 },
    { id: 'i7', name: '神行甲馬', type: 'exploration', desc: '貼上後，該回合擲骰結果直接乘 2。', icon: '🐎', price: 60 },
    // Buffs
    { id: 'i8', name: '觀音甘露水', type: 'buff', desc: '回復 30% HP，並解除身上的所有異常狀態。', icon: '💧', price: 50 },
    { id: 'i9', name: '九轉金丹', type: 'buff', desc: '吞服後，單場戰鬥全屬性提升 50%。', icon: '💊', price: 250 },
    { id: 'i10', name: '人參果', type: 'buff', desc: '百年難得！永久提升角色的弱勢六維屬性 1 點。', icon: '👶', price: 1000 }
];

// ── 怪物特殊掉落物（d 系列）──────────────────────────────────────
// 僅能從擊殺怪物獲得，存入 CharacterStats.GameInventory
export const MONSTER_DROP_ITEMS = [
    { id: 'd1', name: '五毒精魄', rarity: 2, stackable: true, icon: '🌀', desc: '本場戰鬥全屬性+20%；若當日已完成角色天命對治任務，效果升為+40%。' },
    { id: 'd2', name: '業障石', rarity: 2, stackable: true, icon: '🪨', desc: '投擲目標怪物，強制降低其 3 個等級（最低 Lv1），可留存至下次戰鬥使用。' },
    { id: 'd3', name: '心魔殘骸', rarity: 3, stackable: true, icon: '💀', desc: '消耗後獲得 2 個能源骰子，同時本賽季心魔怪掉落機率永久+5%。' },
    { id: 'd4', name: '混沌碎片', rarity: 3, stackable: true, icon: '🔮', desc: '使用時擲 d20：1–5 傳送至隨機地格；6–15 清除當格所有怪物；16–20 召喚稀有 NPC 商人（可購任意 i 系列道具）。' },
    { id: 'd5', name: '業火之種', rarity: 2, stackable: true, icon: '🔥', desc: '放置於地格，72 小時內首個到達的怪物受到 Lv×50 真實傷害（穿透防禦）；玩家踏入無效。' },
    { id: 'd6', name: '貪狼之爪', rarity: 3, stackable: true, icon: '🐾', desc: '使用後，下次開箱必定觸發 Mimic；失敗時改掉落+2 黃金骰；成功識破則獲得+3 黃金骰。' },
    { id: 'd7', name: '渾天至寶珠', rarity: 4, stackable: false, icon: '🌟', desc: '賽季唯一。啟動後全隊 2 天「梵天庇護」Buff：所有定課經驗×2、不觸發五毒詛咒、死亡零懲罰。' },
];

// 怪物掉落機率表（%）
// 怪物分類：普通怪 Lv1-3 | 心魔怪（demon trait）| 精英怪 Lv7+ | 世界Boss
export const MONSTER_DROP_RATES: Record<string, { normal: number; demon: number; elite: number; boss: number }> = {
    d1: { normal: 8, demon: 15, elite: 20, boss: 30 },
    d2: { normal: 6, demon: 12, elite: 18, boss: 25 },
    d3: { normal: 1, demon: 8, elite: 15, boss: 20 },
    d4: { normal: 0, demon: 3, elite: 10, boss: 18 },
    d5: { normal: 5, demon: 10, elite: 12, boss: 20 },
    d6: { normal: 0, demon: 5, elite: 8, boss: 15 },
    d7: { normal: 0, demon: 1, elite: 3, boss: 10 },
};

export const DAILY_QUEST_CONFIG: Quest[] = [
    { id: 'q1', title: '打拳', sub: '身體開發', reward: 200, dice: 1 },
    { id: 'q2', title: '感恩冥想', sub: '對治嗔心', reward: 100, dice: 1 },
    { id: 'q3', title: '當下之舞', sub: '對治疑心', reward: 100, dice: 1 },
    { id: 'q4', title: '嗯啊吽七次', sub: '覺醒痴念', reward: 100, dice: 1 },
    { id: 'q5', title: '五感恩', sub: '放下傲慢', reward: 100, dice: 1 },
    { id: 'q6', title: '海鮮素', sub: '節制貪慾', reward: 100, dice: 1 },
    { id: 'q7', title: '子時入睡', sub: '能量補給', reward: 100, dice: 1 },
    { id: 'q8', title: '高階定課1', sub: '進階修行', reward: 100, dice: 1 },
    { id: 'q9', title: '高階定課2', sub: '進階修行', reward: 100, dice: 1 }
];

export const WEEKLY_QUEST_CONFIG: Quest[] = [
    { id: 'w1', title: '小天使通話', sub: '關心夥伴 (15min)', reward: 500, limit: 1, icon: '👼' },
    { id: 'w2', title: '參加心成活動', sub: '聚會、培訓、活動', reward: 500, limit: 2, icon: '🏛️' },
    { id: 'w3', title: '家人互動親證', sub: '視訊或品質陪伴', reward: 500, limit: 1, icon: '🏠' },
    { id: 'w4', title: '傳愛分數', sub: '訪談成功加分', reward: 1000, limit: 99, icon: '❤️' }
];

export const TERRAIN_TYPES: Record<string, any> = {
    grass: { id: 'grass', name: '茵綠草地', url: '/assets/terrains/The Sanctuary/Grassland.png', scale: 1.15, vOffset: 0.0, color: '#1a472a', effect: '【移動】消耗 1 點。安全、歸零。' },
    roots: { id: 'roots', name: '世界樹根', url: '/assets/terrains/The Sanctuary/Roots.png', scale: 1.15, vOffset: 0.0, color: '#064e3b', effect: '【阻擋】無法通行。中心裝飾與障礙。' },
    spring: { id: 'spring', name: '能量湧泉', url: '/assets/terrains/The Sanctuary/Spring of Energy.png', scale: 1.15, vOffset: -0.05, color: '#1e293b', effect: '【特殊】回復 10% HP，擲骰 +1。' },
    roots_yggdrasil: { id: 'roots_yggdrasil', name: '世界樹盤根', url: '/assets/terrains/The Sanctuary/Roots of Yggdrasil.png', scale: 1.15, vOffset: 0.0, color: '#064e3b', effect: '【地障】自然形成的地形障礙。' },
    snow_path: { id: 'snow_path', name: '積雪山徑', url: '/assets/terrains/Arrogance Peak/Snowy Path.png', scale: 1.15, vOffset: 0.0, color: '#e2e8f0', effect: '【移動】消耗 1 點。' },
    ice_wall: { id: 'ice_wall', name: '冰封絕壁', url: '/assets/terrains/Arrogance Peak/Ice Wall.png', scale: 1.15, vOffset: 0.0, color: '#94a3b8', effect: '【阻擋】高度差 > 2。非飛行無法通過。' },
    thin_air: { id: 'thin_air', name: '稀薄空氣', url: '/assets/terrains/Arrogance Peak/Thin Air.png', scale: 1.15, vOffset: 0.0, color: '#cbd5e1', effect: '【減益】本回合攻擊力下降 20%。' },
    slippery_slope: { id: 'slippery_slope', name: '滑坡', url: '/assets/terrains/Arrogance Peak/Slippery Slope.png', scale: 1.15, vOffset: 0.0, color: '#94a3b8', effect: '【機制】結束時若無釘鞋將滑落。' },
    cliffs_pride: { id: 'cliffs_pride', name: '絕雲冰壁', url: '/assets/terrains/Arrogance Peak/Cloud-Piercing Cliffs.png', scale: 1.15, vOffset: 0.0, color: '#64748b', effect: '【地障】極高海拔形成的冰壁。' },
    dark_trail: { id: 'dark_trail', name: '幽暗小徑', url: '/assets/terrains/Forest of Doubt/Dark Trail.png', scale: 1.15, vOffset: 0.0, color: '#1a472a', effect: '【移動】消耗 1 點。' },
    ancient_tree: { id: 'ancient_tree', name: '千年古樹', url: '/assets/terrains/Forest of Doubt/Ancient Tree.png', scale: 1.15, vOffset: 0.0, color: '#0f172a', effect: '【阻擋】無法通行且阻擋視線。' },
    fog: { id: 'fog', name: '濃重迷霧', url: '/assets/terrains/Forest of Doubt/Dense Fog.png', scale: 1.15, vOffset: 0.0, color: '#475569', effect: '【減益】看不到 2 格外的數值。' },
    thorns: { id: 'thorns', name: '荊棘叢', url: '/assets/terrains/Forest of Doubt/Thorns.png', scale: 1.15, vOffset: 0.0, color: '#1e293b', effect: '【機制】移動消耗加倍。' },
    wall_thorns: { id: 'wall_thorns', name: '嘆息荊棘牆', url: '/assets/terrains/Forest of Doubt/Wall of Thorns.png', scale: 1.15, vOffset: 0.0, color: '#1e293b', effect: '【地障】密不可分的防禦荊棘。' },
    cracked_earth: { id: 'cracked_earth', name: '龜裂大地', url: '/assets/terrains/Scorched Earth/Cracked Earth.png', scale: 1.15, vOffset: 0.0, color: '#450a0a', effect: '【移動】消耗 1 點。' },
    obsidian: { id: 'obsidian', name: '黑曜石岩', url: '/assets/terrains/Scorched Earth/Obsidian Rock.png', scale: 1.15, vOffset: 0.0, color: '#111827', effect: '【阻擋】無法通行，悟空可擊碎。' },
    lava: { id: 'lava', name: '熔岩流', url: '/assets/terrains/Scorched Earth/Lava Flow.png', scale: 1.15, vOffset: 0.0, color: '#991b1b', effect: '【減益】停留每回合扣 5% HP。' },
    geyser: { id: 'geyser', name: '間歇泉', url: '/assets/terrains/Scorched Earth/Geyser.png', scale: 1.15, vOffset: 0.0, color: '#ef4444', effect: '【機制】30% 機率彈射鄰格。' },
    abyssal_magma: { id: 'abyssal_magma', name: '虛空火海', url: '/assets/terrains/Scorched Earth/Abyssal Magma.png', scale: 1.15, vOffset: 0.0, color: '#7f1d1d', effect: '【地障】嗔恨構成的致命區。' },
    wetland: { id: 'wetland', name: '泥濘濕地', url: '/assets/terrains/Swamp of Greed/Wetland.png', scale: 1.15, vOffset: 0.0, color: '#064e3b', effect: '【移動】消耗 1 點。' },
    rotten_vines: { id: 'rotten_vines', name: '腐敗巨藤', url: '/assets/terrains/Swamp of Greed/Rotten Vines.png', scale: 1.15, vOffset: 0.0, color: '#14532d', effect: '【阻擋】無法通行。' },
    deep_bog: { id: 'deep_bog', name: '深淵泥淖', url: '/assets/terrains/Swamp of Greed/Deep Bog.png', scale: 1.15, vOffset: 0.0, color: '#022c22', effect: '【減益】進入即立刻停止移動。' },
    mimic: { id: 'mimic', name: '偽裝寶箱', url: '/assets/terrains/Swamp of Greed/Mimic Chest.png', scale: 1.15, vOffset: 0.0, color: '#713f12', effect: '【機制】未過檢定扣骰子。' },
    corrupted_vines: { id: 'corrupted_vines', name: '腐化巨藤', url: '/assets/terrains/Swamp of Greed/Corrupted Vines.png', scale: 1.15, vOffset: 0.0, color: '#064e3b', effect: '【地障】致命的劇毒藤蔓。' },
    sand_dune: { id: 'sand_dune', name: '虛妄沙丘', url: '/assets/terrains/delusion/Sand Dune.png', scale: 1.15, vOffset: 0.0, color: '#d97706', effect: '【移動】消耗 1 點。' },
    sandstorm_wall: { id: 'sandstorm_wall', name: '沙塵暴壁', url: '/assets/terrains/delusion/Sandstorm Wall.png', scale: 1.15, vOffset: 0.0, color: '#451a03', effect: '【阻擋】暫時無法通行的動態牆。' },
    quicksand: { id: 'quicksand', name: '迷走流沙', url: '/assets/terrains/delusion/Quicksand.png', scale: 1.15, vOffset: 0.0, color: '#92400e', effect: '【減益】結束時位移下一格。' },
    mirage: { id: 'mirage', name: '海市蜃樓', url: '/assets/terrains/delusion/Mirage.png', scale: 1.15, vOffset: 0.0, color: '#f59e0b', effect: '【機制】指令前後左右反轉。' },
    chaos_storm_barr: { id: 'chaos_storm_barr', name: '混沌風暴', url: '/assets/terrains/delusion/Chaos Sandstorm.png', scale: 1.15, vOffset: 0.0, color: '#1e293b', effect: '【地障】視覺與行進終極障礙。' },
    ash_path: { id: 'ash_path', name: '灰燼虛道', url: '/assets/terrains/The Chaos/Ash Path.png', scale: 1.15, vOffset: 0.0, color: '#475569', effect: '【移動】消耗 1 點移動力。穩定的立足點。' },
    glitch_wall: { id: 'glitch_wall', name: '錯誤代碼牆', url: '/assets/terrains/The Chaos/Glitch Wall.png', scale: 1.15, vOffset: 0.0, color: '#1e293b', effect: '【阻擋】業障牆。無法通行、破壞或穿越。' },
    entropy_field: { id: 'entropy_field', name: '熵增力場', url: '/assets/terrains/The Chaos/Entropy Field.png', scale: 1.15, vOffset: 0.0, color: '#0f172a', effect: '【特殊】結束時扣除 1 骰子或 15% HP。' },
    random_anomaly: { id: 'random_anomaly', name: '隨機異常', url: '/assets/terrains/The Chaos/Random Anomaly.png', scale: 1.15, vOffset: 0.0, color: '#334155', effect: '【特殊】踏入隨機觸發五區的一種負面效果。' },
    void: { id: 'void', name: '虛空邊界', url: '/assets/terrains/The Chaos/Event Horizon.png', scale: 1.15, vOffset: 0.0, color: '#020617', effect: '【地障】墜入虛空！扣 50% HP 並傳回中心。' },
};

export const zoneWeights: Record<string, string[]> = {
    center: ['grass', 'grass', 'grass', 'grass', 'grass', 'grass', 'grass', 'grass', 'grass', 'grass', 'grass', 'grass', 'roots', 'spring', 'roots_yggdrasil'],
    pride: ['snow_path', 'snow_path', 'snow_path', 'snow_path', 'snow_path', 'snow_path', 'snow_path', 'snow_path', 'snow_path', 'snow_path', 'snow_path', 'snow_path', 'ice_wall', 'thin_air', 'slippery_slope', 'cliffs_pride'],
    doubt: ['dark_trail', 'dark_trail', 'dark_trail', 'dark_trail', 'dark_trail', 'dark_trail', 'dark_trail', 'dark_trail', 'dark_trail', 'dark_trail', 'dark_trail', 'dark_trail', 'ancient_tree', 'fog', 'thorns', 'wall_thorns'],
    anger: ['cracked_earth', 'cracked_earth', 'cracked_earth', 'cracked_earth', 'cracked_earth', 'cracked_earth', 'cracked_earth', 'cracked_earth', 'cracked_earth', 'cracked_earth', 'cracked_earth', 'cracked_earth', 'obsidian', 'lava', 'geyser', 'abyssal_magma'],
    greed: ['wetland', 'wetland', 'wetland', 'wetland', 'wetland', 'wetland', 'wetland', 'wetland', 'wetland', 'wetland', 'wetland', 'wetland', 'rotten_vines', 'deep_bog', 'mimic', 'corrupted_vines'],
    delusion: ['sand_dune', 'sand_dune', 'sand_dune', 'sand_dune', 'sand_dune', 'sand_dune', 'sand_dune', 'sand_dune', 'sand_dune', 'sand_dune', 'sand_dune', 'sand_dune', 'sandstorm_wall', 'quicksand', 'mirage', 'chaos_storm_barr'],
    chaos: ['ash_path', 'ash_path', 'ash_path', 'ash_path', 'ash_path', 'ash_path', 'ash_path', 'ash_path', 'ash_path', 'ash_path', 'ash_path', 'ash_path', 'glitch_wall', 'entropy_field', 'random_anomaly', 'void']
};
