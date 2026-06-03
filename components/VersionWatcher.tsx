'use client';

import { useEffect, useState } from 'react';

// 偵測部署版本變更：學員瀏覽器若跑舊快取（會產生偏移打卡等問題），
// 部署新版後 5 分鐘內提示重新整理，載入最新前端。
// dev 環境版本固定為 'dev'，不會觸發提示。
export function VersionWatcher() {
    const [stale, setStale] = useState(false);

    useEffect(() => {
        let initial: string | null = null;
        let cancelled = false;

        const check = async () => {
            try {
                const res = await fetch('/api/version', { cache: 'no-store' });
                if (!res.ok) return;
                const { v } = await res.json();
                if (cancelled || !v || v === 'dev') return;
                if (initial === null) {
                    initial = v;
                } else if (v !== initial) {
                    setStale(true);
                }
            } catch {
                /* 網路暫時失敗忽略，下次再試 */
            }
        };

        check();
        const id = setInterval(check, 5 * 60 * 1000);
        const onVis = () => { if (document.visibilityState === 'visible') check(); };
        document.addEventListener('visibilitychange', onVis);
        return () => {
            cancelled = true;
            clearInterval(id);
            document.removeEventListener('visibilitychange', onVis);
        };
    }, []);

    if (!stale) return null;

    return (
        <button
            onClick={() => location.reload()}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] px-5 py-3 rounded-full bg-[#C0392B] text-white text-sm font-black shadow-2xl active:scale-95 transition-all flex items-center gap-2"
        >
            🔄 有新版本，請點此重新整理
        </button>
    );
}
