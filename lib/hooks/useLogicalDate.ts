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
    // - 週/賽季週錨點以「邏輯日」為基準（中午前算前一天），讓週曆不會在週一 0:00 太早翻頁；
    //   學員 5/24 晚上 ~ 5/25 中午之間做的事仍歸 W2，calendar 顯示 5/18-5/24
    /* eslint-disable react-hooks/exhaustive-deps */
    const logicalTodayStr = useMemo(() => getLogicalDateStr(), [tick]);
    const logicalAnchor = useMemo(() => new Date(`${logicalTodayStr}T00:00:00+08:00`), [logicalTodayStr]);
    const currentWeeklyMonday = useMemo(() => getWeeklyMonday(logicalAnchor), [logicalAnchor]);
    const seasonWeekStart = useMemo(() => getSeasonWeekStart(logicalAnchor), [logicalAnchor]);
    /* eslint-enable react-hooks/exhaustive-deps */
    return { logicalTodayStr, currentWeeklyMonday, seasonWeekStart };
}
