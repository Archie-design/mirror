import { useEffect, useMemo, useState } from 'react';
import { getLogicalDateStr, getWeeklyMonday, getSeasonWeekStart } from '@/lib/utils/time';

/**
 * 每分鐘觸發一次 tick，讓依賴「今天 / 本週一」的計算跨午夜時自動刷新。
 * 抽到獨立 hook 後，未來若改用 useSyncExternalStore 限縮 re-render 範圍，
 * 只需修改本檔即可，呼叫端 API 不變。
 */
export function useLogicalDate() {
    const [tick, setTick] = useState(() => Date.now());
    useEffect(() => {
        let id: ReturnType<typeof setInterval> | null = null;
        const start = () => {
            if (id !== null) return;
            id = setInterval(() => setTick(Date.now()), 60 * 1000);
        };
        const stop = () => {
            if (id !== null) { clearInterval(id); id = null; }
        };
        const onVis = () => {
            if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
                setTick(Date.now()); // 回到前景立即重算（補上隱藏期間跨午）
                start();
            } else {
                stop();
            }
        };
        if (typeof document === 'undefined' || document.visibilityState === 'visible') start();
        if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis);
        return () => {
            stop();
            if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis);
        };
    }, []);
    // tick 作為 useMemo 觸發器：每分鐘 setTick 後重新計算
    // - currentWeeklyMonday：純週一錨，給日曆 UI（WeekCalendarRow 等）顯示 7 格
    // - seasonWeekStart：賽季週錨（W1 特例 + W2+ 週一），給每週限制計數
    /* eslint-disable react-hooks/exhaustive-deps */
    const logicalTodayStr = useMemo(() => getLogicalDateStr(), [tick]);
    const currentWeeklyMonday = useMemo(() => getWeeklyMonday(), [tick]);
    const seasonWeekStart = useMemo(() => getSeasonWeekStart(), [tick]);
    /* eslint-enable react-hooks/exhaustive-deps */
    return { logicalTodayStr, currentWeeklyMonday, seasonWeekStart };
}
