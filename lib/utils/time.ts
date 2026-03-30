import { differenceInCalendarWeeks, startOfYear } from 'date-fns';

/**
 * 取得邏輯日期字串 (YYYY-MM-DD)
 * 若在中午 12:00 前，視為前一天的日期
 */
export const getLogicalDateStr = (dateInput?: Date | string): string => {
    const date = dateInput ? new Date(dateInput) : new Date();
    // 使用台灣時區 (UTC+8) 判斷小時，避免伺服器時區造成誤判
    const twParts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hour12: false,
    }).formatToParts(date);
    const get = (type: string) => twParts.find(p => p.type === type)!.value;
    const hours = parseInt(get('hour'), 10);
    let y = parseInt(get('year'), 10);
    let m = parseInt(get('month'), 10);
    let day = parseInt(get('day'), 10);
    if (hours < 12) {
        const d = new Date(y, m - 1, day);
        d.setDate(d.getDate() - 1);
        y = d.getFullYear();
        m = d.getMonth() + 1;
        day = d.getDate();
    }
    return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

/**
 * 取得本週一 00:00:00 的時間
 */
export const getWeeklyMonday = (date: Date = new Date()): Date => {
    const d = new Date(date);
    const day = d.getDay() || 7; // Convert Sunday (0) to 7
    d.setDate(d.getDate() - (day - 1));
    d.setHours(0, 0, 0, 0);
    return d;
};

// ── 電影主題週期 ────────────────────────────────────────────────────────────

export type ThemePeriodType = 'before' | 'regular' | 'reflection' | 'after';

export interface ThemePeriod {
    movie: string;
    emoji: string;
    type: ThemePeriodType;
    taskType: 't1t2' | 't3' | null;
    weeks: string;
    desc: string;
    t3Reward: number;
    t3QuestBase: string;
    t3MaxPerPeriod: number;
}

/**
 * 依今日日期判斷活動期間所對應的電影主題週次
 * 活動期間：2026-05-04 ～ 2026-07-20
 */
export function getCurrentThemePeriod(date: Date = new Date()): ThemePeriod {
    // 取台灣時區的日期字串
    const dateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(date);

    if (dateStr < '2026-05-04') {
        return { movie: '活動即將開始', emoji: '🎬', type: 'before', taskType: null, weeks: '活動尚未開始', desc: '親證班將於 2026/5/4 正式啟動', t3Reward: 0, t3QuestBase: '', t3MaxPerPeriod: 0 };
    }
    if (dateStr > '2026-07-20') {
        return { movie: '感謝參與', emoji: '🏆', type: 'after', taskType: null, weeks: '活動已結束', desc: '感謝所有學員的參與！', t3Reward: 0, t3QuestBase: '', t3MaxPerPeriod: 0 };
    }
    if (dateStr >= '2026-05-04' && dateStr <= '2026-05-31') {
        return { movie: '阿甘正傳', emoji: '🏃', type: 'regular', taskType: 't1t2', weeks: '第 1–4 週', desc: '找小隊長訂立 21 天適應力突破計劃（做不習慣、害怕、討厭的事），每週在線收稿', t3Reward: 0, t3QuestBase: '', t3MaxPerPeriod: 0 };
    }
    if (dateStr >= '2026-06-01' && dateStr <= '2026-06-07') {
        return { movie: '功夫熊貓', emoji: '🐼', type: 'reflection', taskType: 't3', weeks: '沉澱週（6/1–6/7）', desc: '規劃來三個月行事曆，分享 21 天適應力挑戰心得', t3Reward: 600, t3QuestBase: 't3_forrest', t3MaxPerPeriod: 3 };
    }
    if (dateStr >= '2026-06-08' && dateStr <= '2026-07-05') {
        return { movie: '哈利波特：神秘的魔法石', emoji: '⚡', type: 'regular', taskType: 't1t2', weeks: '第 5–8 週', desc: '找輔導員解讀夢計畫或復盤，親證行動方案 21 天，將希望搭配夥伴支持方式放入小隊群組', t3Reward: 0, t3QuestBase: '', t3MaxPerPeriod: 0 };
    }
    // 2026-07-06 ~ 2026-07-12
    return { movie: '腦筋急轉彎', emoji: '🎭', type: 'reflection', taskType: 't3', weeks: '沉澱週（7/6–7/12）', desc: '找上級分享過去兩個月的親證收獲，分享圓夢計劃執行心得', t3Reward: 600, t3QuestBase: 't3_inside', t3MaxPerPeriod: 3 };
}

/**
 * 取得雙週主題週期起始日 (BiWeeklyStart)
 * 每年奇數週的週一 00:00:00 作為一次起始
 */
export const getBiWeeklyStart = (date: Date = new Date()): Date => {
    const monday = getWeeklyMonday(date);
    const firstDayOfYear = startOfYear(monday);

    // 計算當前週一是該年度的第幾週 (相對於該年第一天的週數)
    const currentWeek = differenceInCalendarWeeks(monday, firstDayOfYear, { weekStartsOn: 1 }) + 1;

    if (currentWeek % 2 !== 0) {
        // 奇數週：當前週一即為起始
        return monday;
    } else {
        // 偶數週：往前推一週的週一
        const prevWeekMonday = new Date(monday);
        prevWeekMonday.setDate(prevWeekMonday.getDate() - 7);
        return prevWeekMonday;
    }
};
