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

// ── 活動旅程階段 ────────────────────────────────────────────────────────────

export type ThemePeriodType = 'before' | 'regular' | 'graduation' | 'after';

export interface ThemePeriod {
    title: string;
    emoji: string;
    type: ThemePeriodType;
    taskType: 't1t2' | null;
    weeks: string;
    desc: string;
}

/**
 * 依今日日期判斷活動旅程所在階段（GAME_DESIGN §1.3）
 * 活動期間：2026-05-10 ～ 2026-07-12
 */
export function getCurrentThemePeriod(date: Date = new Date()): ThemePeriod {
    const dateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(date);

    if (dateStr < '2026-05-10') {
        return { title: '活動即將開始', emoji: '🌪️', type: 'before', taskType: null, weeks: '宣傳期', desc: '親證班將於 2026/5/10 正式啟動，龍捲風即將來臨' };
    }
    if (dateStr > '2026-07-12') {
        return { title: '感謝參與', emoji: '🏆', type: 'after', taskType: null, weeks: '活動已結束', desc: '感謝所有學員踏上屬於自己的黃磚路！' };
    }
    if (dateStr >= '2026-05-10' && dateStr <= '2026-05-16') {
        return { title: '開學日・踏上黃磚路', emoji: '👟', type: 'regular', taskType: 't1t2', weeks: '第 1 週', desc: '一切都是陌生的，不舒服正是真正開始走路的感覺' };
    }
    if (dateStr >= '2026-07-06') {
        return { title: '畢業典禮・回望旅程', emoji: '✨', type: 'graduation', taskType: 't1t2', weeks: '第 9 週', desc: '停下來回望，看見自己走過的路。黃磚路盡頭沒有大法師，只有一面鏡子' };
    }
    // 2026-05-17 ~ 2026-07-05（第 2–8 週）
    return { title: '課後課・旅伴同行', emoji: '🌿', type: 'regular', taskType: 't1t2', weeks: '第 2–8 週', desc: '夥伴成為彼此的鏡子，給出鼓勵的同時已先相信自己值得' };
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
