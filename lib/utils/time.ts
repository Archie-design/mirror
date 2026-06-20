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
 * 取得台灣時區日曆日字串 (YYYY-MM-DD)
 * 與 getLogicalDateStr 不同：這裡單純取台灣日曆日，不做中午切換。
 * 用於「最後活動日」「活躍/沉寂」這類需以日曆日為單位的場景。
 */
export const getTaipeiDateStr = (dateInput?: Date | string): string => {
    const date = dateInput ? new Date(dateInput) : new Date();
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
};

/**
 * 取「邏輯日今天」的 00:00 +08 anchor。
 * 用於把 getWeeklyMonday/getSeasonWeekStart 改成跟著邏輯日切換（中午前算前一天）。
 */
export const getLogicalNowAnchor = (): Date => {
    return new Date(`${getLogicalDateStr()}T00:00:00+08:00`);
};

/**
 * 取得本週週一 00:00:00 +08 的時間（純週一錨點，無賽季概念）
 * 用於日曆 UI 顯示「本週」7 格按鈕（週一-週日）。
 */
export const getWeeklyMonday = (date: Date = new Date()): Date => {
    // 以 Asia/Taipei 推算當地日期與週幾
    const twParts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei',
        year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
    }).formatToParts(date);
    const get = (type: string) => twParts.find(p => p.type === type)!.value;
    const y = parseInt(get('year'), 10);
    const m = parseInt(get('month'), 10);
    const d = parseInt(get('day'), 10);
    // ISO weekday: 1 = Mon, 7 = Sun
    const weekdayMap: Record<string, number> = { Sun: 7, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dow = weekdayMap[get('weekday')] ?? 1;
    const dayMs = 24 * 60 * 60 * 1000;
    const localMidnight = Date.UTC(y, m - 1, d) - 8 * 60 * 60 * 1000;
    return new Date(localMidnight - (dow - 1) * dayMs);
};

// ── 賽季週分桶 ─────────────────────────────────────────────────────────────
// 賽季週採「週一 → 週日」7 天為一週。
// 第 1 週特例：2026-05-10(日) ~ 2026-05-17(日)，8 天（含起跑首日週日）。
// 第 2 週起回歸標準週一起算（5/18 一 ~ 5/24 日）。
// 用於每週任務上限、排行榜本週積分、週快照等「賽季週」邊界。
export const SEASON_W1_START = '2026-05-10';
export const SEASON_W2_MONDAY = '2026-05-18';

export function getSeasonWeekStart(date: Date = new Date()): Date {
    const dStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(date);
    if (dStr >= SEASON_W1_START && dStr < SEASON_W2_MONDAY) {
        return new Date('2026-05-10T00:00:00+08:00');
    }
    return getWeeklyMonday(date);
}

/**
 * 取得某日所屬賽季週的「結束 exclusive 邊界」= 下一賽季週的起點。
 * W1（5/10–5/17，8 天）→ 5/18；W2+（7 天）→ 下週一。
 * 用途：週上限統計需要上界，避免「只有下界」把後續週次的記錄也算進本週額度。
 * 作法：weekStart + 8 天必落入下一賽季週，再用 getSeasonWeekStart 對齊其起點。
 */
export function getSeasonWeekEnd(date: Date = new Date()): Date {
    const weekStart = getSeasonWeekStart(date);
    const intoNextWeek = new Date(weekStart.getTime() + 8 * 24 * 60 * 60 * 1000);
    return getSeasonWeekStart(intoNextWeek);
}

// ── 賽季月分桶 ─────────────────────────────────────────────────────────────
// 月排行榜採「賽季月」而非日曆月，邊界對齊賽季週、以中午 12:00 為邏輯日邊界。
//   第一個月：5/10–6/14（W1–W5，5 週）
//   第二個月：6/15–7/19（W6–W10，5 週；分數統計至 7/19，畢業典禮另於 7/24）
// key 直接作為 MonthlyRankSnapshot.month_start（DATE）。
export interface SeasonMonth {
    key: string;          // 賽季月起始日（= 快照 month_start）
    label: string;        // 「第一個月」
    startDate: string;    // 含此邏輯日
    endDate: string;      // 含此邏輯日（最後一天）
    endExclusive: string; // 結束邊界（不含）：endDate 的次日，配 12:00 noon 邊界
}

export const SEASON_MONTHS: SeasonMonth[] = [
    { key: '2026-05-10', label: '第一個月', startDate: '2026-05-10', endDate: '2026-06-14', endExclusive: '2026-06-15' },
    { key: '2026-06-15', label: '第二個月', startDate: '2026-06-15', endDate: '2026-07-19', endExclusive: '2026-07-20' },
];

// 賽季月的聚合區間（中午 12:00 +08 邏輯日邊界）
export function seasonMonthRangeIso(entry: SeasonMonth): { start: string; end: string } {
    return {
        start: `${entry.startDate}T12:00:00+08:00`,
        end: `${entry.endExclusive}T12:00:00+08:00`,
    };
}

// 依（邏輯）日期取得所在賽季月；早於賽季→第一個月，晚於賽季→最後一個月
export function getCurrentSeasonMonth(date: Date = new Date()): SeasonMonth {
    const dStr = getLogicalDateStr(date);
    for (const m of SEASON_MONTHS) {
        if (dStr >= m.startDate && dStr < m.endExclusive) return m;
    }
    if (dStr < SEASON_MONTHS[0].startDate) return SEASON_MONTHS[0];
    return SEASON_MONTHS[SEASON_MONTHS.length - 1];
}

export function getSeasonMonthByKey(key: string): SeasonMonth | undefined {
    return SEASON_MONTHS.find(m => m.key === key);
}

// 前一個賽季月；若為第一個月則回 null
export function getPrevSeasonMonth(key: string): SeasonMonth | null {
    const idx = SEASON_MONTHS.findIndex(m => m.key === key);
    if (idx <= 0) return null;
    return SEASON_MONTHS[idx - 1];
}

// 顯示標籤，例：「第一個月（5/10–6/14）」；查無 key 時回傳原字串
export function formatSeasonMonthLabel(key: string): string {
    const m = getSeasonMonthByKey(key);
    if (!m) return key;
    const md = (d: string) => { const [, mm, dd] = d.split('-'); return `${parseInt(mm, 10)}/${parseInt(dd, 10)}`; };
    return `${m.label}（${md(m.startDate)}–${md(m.endDate)}）`;
}

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
 * 活動期間（分數統計）：2026-05-10 ～ 2026-07-19；畢業典禮另於 2026-07-24
 */
export function getCurrentThemePeriod(date: Date = new Date()): ThemePeriod {
    const dateStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(date);

    if (dateStr < '2026-05-10') {
        return { title: '活動即將開始', emoji: '🌪️', type: 'before', taskType: null, weeks: '宣傳期', desc: '親證班將於 2026/5/10 正式啟動，龍捲風即將來臨' };
    }
    if (dateStr > '2026-07-19') {
        return { title: '感謝參與', emoji: '🏆', type: 'after', taskType: null, weeks: '活動已結束', desc: '感謝所有學員踏上屬於自己的黃磚路！7/24 畢業典禮見。' };
    }
    if (dateStr >= '2026-05-10' && dateStr <= '2026-05-17') {
        return { title: '開學日・踏上黃磚路', emoji: '👟', type: 'regular', taskType: 't1t2', weeks: '第 1 週', desc: '一切都是陌生的，不舒服正是真正開始走路的感覺' };
    }
    if (dateStr >= '2026-07-06') {
        return { title: '畢業典禮・回望旅程', emoji: '✨', type: 'graduation', taskType: 't1t2', weeks: '第 9–10 週', desc: '停下來回望，看見自己走過的路。黃磚路盡頭沒有大法師，只有一面鏡子' };
    }
    // 2026-05-18 ~ 2026-07-05（第 2–8 週）
    return { title: '課後課・旅伴同行', emoji: '🌿', type: 'regular', taskType: 't1t2', weeks: '第 2–8 週', desc: '夥伴成為彼此的鏡子，給出鼓勵的同時已先相信自己值得' };
}

/**
 * 取得雙週主題週期起始日 (BiWeeklyStart)
 * 以週一為週起點，每兩週為一個雙週週期。
 */
export const getBiWeeklyStart = (date: Date = new Date()): Date => {
    const monday = getWeeklyMonday(date);
    const firstDayOfYear = startOfYear(monday);

    const currentWeek = differenceInCalendarWeeks(monday, firstDayOfYear, { weekStartsOn: 1 }) + 1;

    if (currentWeek % 2 !== 0) {
        return monday;
    } else {
        const prevMonday = new Date(monday);
        prevMonday.setDate(prevMonday.getDate() - 7);
        return prevMonday;
    }
};
