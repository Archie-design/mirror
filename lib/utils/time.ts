import { differenceInCalendarWeeks, startOfYear, addWeeks, startOfWeek } from 'date-fns';

/**
 * 取得邏輯日期字串 (YYYY-MM-DD)
 * 若在中午 12:00 前，視為前一天的日期
 */
export const getLogicalDateStr = (dateInput?: Date | string): string => {
    const date = dateInput ? new Date(dateInput) : new Date();
    const hours = date.getHours();
    const d = new Date(date);
    if (hours < 12) {
        d.setDate(d.getDate() - 1);
    }
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
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
