import { NextResponse } from 'next/server';

// 回傳目前部署版本，供前端偵測是否有新版本（學員瀏覽器跑舊快取時提示重新整理）。
// 正式環境用 Vercel 注入的 commit SHA；本地 dev 回傳 'dev'（前端不觸發提示）。
export const dynamic = 'force-dynamic';

export function GET() {
    const v = process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev';
    return NextResponse.json(
        { v },
        { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
}
