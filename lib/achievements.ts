export interface AchievementDef {
    id: string;
    name: string;
    rarity: 'common' | 'rare' | 'epic' | 'legendary';
    icon: string;
    hint: string;
    description: string;
    roleExclusive?: string;
}

export const RARITY_STYLE = {
    common:    { border: 'border-orange-700/50', glow: 'shadow-orange-900/40',  text: 'text-orange-400',  bg: 'bg-orange-950/30',  label: '常見' },
    rare:      { border: 'border-slate-400/50',  glow: 'shadow-slate-500/40',   text: 'text-slate-200',   bg: 'bg-slate-700/20',   label: '罕見' },
    epic:      { border: 'border-yellow-500/60', glow: 'shadow-yellow-600/50',  text: 'text-yellow-300',  bg: 'bg-yellow-950/30',  label: '稀有' },
    legendary: { border: 'border-purple-500/70', glow: 'shadow-purple-600/60',  text: 'text-purple-300',  bg: 'bg-purple-950/30',  label: '傳說' },
} as const;

export const ACHIEVEMENTS: AchievementDef[] = [
    // ── 一般定課成就（30）──────────────────────────────────────────────
    { id: 'first_step',        name: '千里之行',   rarity: 'common',    icon: '👣', hint: '萬事起於足下…',               description: '完成了人生第一個定課' },
    { id: 'full_day',          name: '圓滿一日',   rarity: 'common',    icon: '🌕', hint: '今日已盡，無悔矣',              description: '在同一邏輯日完成 3 個定課' },
    { id: 'streak_3',          name: '三日不輟',   rarity: 'common',    icon: '🔥', hint: '三天，是個開始…',               description: '連續 3 天完成打拳定課' },
    { id: 'dawn_boxer',        name: '破曉修士',   rarity: 'common',    icon: '🌅', hint: '清晨的微光有你的身影',           description: '累計破曉打拳 5 次' },
    { id: 'veg_pioneer',       name: '蓮台素客',   rarity: 'common',    icon: '🥬', hint: '一飲一啄，皆有定數…',           description: '累計海鮮素 20 次' },
    { id: 'early_sleeper',     name: '夜歸明月',   rarity: 'common',    icon: '🌙', hint: '子時前已入夢…',                 description: '累計子時入睡 20 次' },
    { id: 'weekly_caller',     name: '小天使之約', rarity: 'common',    icon: '📞', hint: '緣分自有定時…',                 description: '累計小天使通話 5 次' },
    { id: 'comeback',          name: '回頭是岸',   rarity: 'rare',      icon: '🔄', hint: '路雖繞，終能歸…',               description: '某項定課超過 7 天未做，今日重新完成' },
    { id: 'streak_7',          name: '七日精進',   rarity: 'rare',      icon: '⚡', hint: '七，是完整的數字…',             description: '連續 7 天完成打拳定課' },
    { id: 'full_week',         name: '圓滿五日',   rarity: 'rare',      icon: '🗓️', hint: '無一日荒廢…',                  description: '連續 5 天各完成至少 1 個定課' },
    { id: 'dawn_devotee',      name: '寅時武者',   rarity: 'rare',      icon: '🌄', hint: '天還未亮，你已…',               description: '累計破曉打拳 20 次' },
    { id: 'meditation_master', name: '定慧之境',   rarity: 'rare',      icon: '🧘', hint: '心靜方能見本性…',               description: '累計感恩冥想 30 次' },
    { id: 'dance_devotee',     name: '當下之身',   rarity: 'rare',      icon: '💃', hint: '舞動即是修行…',                 description: '累計當下之舞 30 次' },
    { id: 'role_cure_10',      name: '破執之路',   rarity: 'rare',      icon: '💊', hint: '心魔有名，方能破解…',           description: '累計完成解毒定課 10 次' },
    { id: 'w4_giver',          name: '傳愛使者',   rarity: 'rare',      icon: '💌', hint: '愛是唯一不減的資源…',           description: '累計傳愛任務 10 次' },
    { id: 'topic_devotee',     name: '主題探索者', rarity: 'rare',      icon: '🔍', hint: '每個主題都是一扇門…',           description: '累計主題親證 5 次' },
    { id: 'yuanmeng',          name: '圓夢行者',   rarity: 'rare',      icon: '🌟', hint: '夢想不是用想的…',               description: '累計親證圓夢 3 次' },
    { id: 'all_daily',         name: '七藝初探',   rarity: 'rare',      icon: '🎯', hint: '七種修行，缺一不可…',           description: '每項日課各完成過一次' },
    { id: 'temp_master',       name: '隨機應變',   rarity: 'rare',      icon: '🎲', hint: '世事難料，但你準備好了…',       description: '累計完成臨時任務 5 次' },
    { id: 'marathon',          name: '百日征途',   rarity: 'epic',      icon: '🏃', hint: '修行路上，計步者長',             description: '累計完成 100 個定課' },
    { id: 'mastery_q1',        name: '打拳宗師',   rarity: 'epic',      icon: '🥊', hint: '拳不離手，曲不離口…',           description: '累計打拳 50 次' },
    { id: 'phoenix',           name: '浴火重生',   rarity: 'epic',      icon: '🦅', hint: '塵封已久的修行，重新燃起…',     description: '某項定課超過 14 天未做，今日重新完成' },
    { id: 'streak_30',         name: '月之恆心',   rarity: 'epic',      icon: '🌕', hint: '月滿則虧，但在滿之前…',         description: '連續 30 天完成打拳定課' },
    { id: 'role_cure_50',      name: '執念消融',   rarity: 'epic',      icon: '🌊', hint: '重複，是最深的修行…',           description: '累計完成解毒定課 50 次' },
    { id: 'five_hundred',      name: '五百修為',   rarity: 'epic',      icon: '💎', hint: '路遙知馬力…',                   description: '累計完成 500 個定課' },
    { id: 'dawn_legend',       name: '破曉傳說',   rarity: 'epic',      icon: '🌠', hint: '日日破曉，心不曾眠…',           description: '累計破曉打拳 50 次' },
    { id: 'full_month',        name: '月圓無缺',   rarity: 'epic',      icon: '📅', hint: '一月之中，滴水不漏…',           description: '連續 20 天各完成至少 1 個定課' },
    { id: 'prodigal',          name: '置之死地',   rarity: 'legendary', icon: '♾️', hint: '有些事，你以為永遠不會再做了…', description: '某項定課超過 30 天未做，今日重新完成' },
    { id: 'omnipractice',      name: '無所不修',   rarity: 'legendary', icon: '🌈', hint: '修行無邊，卻有人走遍…',         description: '完成過所有類型定課（q1-q7、w1-w4、t、bd_yuanmeng）' },
    { id: 'eternal_dawn',      name: '永恆破曉',   rarity: 'legendary', icon: '☀️', hint: '傳說中有人，每日破曉…',         description: '連續 7 天完成破曉打拳' },
    // ── 團隊協作成就（3）─────────────────────────────────────────────
    { id: 'team_punch',        name: '同心齊拳',   rarity: 'rare',      icon: '🤜', hint: '獨行者快，眾行者遠…',           description: '與隊友在同一天都完成了打拳定課' },
    { id: 'team_perfect',      name: '眾志成城',   rarity: 'epic',      icon: '🏆', hint: '你的小隊創造了奇蹟…',           description: '小隊全員在同一天都有打卡記錄' },
    { id: 'team_streak',       name: '共修三日',   rarity: 'epic',      icon: '🤝', hint: '同行三天，心更近了…',           description: '與任一隊友連續 3 天同日完成打拳' },
    // ── 職業專屬成就（10）────────────────────────────────────────────
    { id: 'wukong_dawn',       name: '齊天武聖',   rarity: 'epic',      icon: '🐒', hint: '某位鬥戰勝佛的傳人…',           description: '身為孫悟空，累計破曉打拳 30 次',    roleExclusive: '孫悟空' },
    { id: 'wukong_spirit',     name: '火眼金睛',   rarity: 'rare',      icon: '👁️', hint: '神識洞明，萬象皆透…',           description: '神識屬性達到 20 點',                roleExclusive: '孫悟空' },
    { id: 'bajie_veg',         name: '齋戒持身',   rarity: 'epic',      icon: '🐷', hint: '老豬也有清靜之日…',             description: '身為豬八戒，累計海鮮素 30 次',      roleExclusive: '豬八戒' },
    { id: 'bajie_physique',    name: '根骨渾厚',   rarity: 'rare',      icon: '💪', hint: '力大無窮，從此而來…',           description: '根骨屬性達到 20 點',                roleExclusive: '豬八戒' },
    { id: 'wujing_chant',      name: '悟淨持念',   rarity: 'epic',      icon: '🏺', hint: '水中沙，心中定…',               description: '身為沙悟淨，累計嗯啊吽七次 30 次',  roleExclusive: '沙悟淨' },
    { id: 'wujing_savvy',      name: '慧根深種',   rarity: 'rare',      icon: '🌿', hint: '悟性如流水，無形無礙…',         description: '悟性屬性達到 20 點',                roleExclusive: '沙悟淨' },
    { id: 'horse_gratitude',   name: '五感圓融',   rarity: 'epic',      icon: '🐴', hint: '馬行千里，感恩相隨…',           description: '身為白龍馬，累計五感恩 30 次',      roleExclusive: '白龍馬' },
    { id: 'horse_charisma',    name: '魅力非凡',   rarity: 'rare',      icon: '✨', hint: '行者之魅，眾人傾心…',           description: '魅力屬性達到 20 點',                roleExclusive: '白龍馬' },
    { id: 'monk_dance',        name: '疑心盡消',   rarity: 'epic',      icon: '🧧', hint: '師父的心，終於放下…',           description: '身為唐三藏，累計當下之舞 30 次',    roleExclusive: '唐三藏' },
    { id: 'monk_streak',       name: '取經之心',   rarity: 'legendary', icon: '📿', hint: '十萬八千里，一步未停…',         description: '連續 14 天有完成任意定課',          roleExclusive: '唐三藏' },
];

export const ACHIEVEMENT_MAP = new Map(ACHIEVEMENTS.map(a => [a.id, a]));
export const TOTAL_ACHIEVEMENTS = ACHIEVEMENTS.length;
