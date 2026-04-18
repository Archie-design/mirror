export const runtime = 'nodejs';

import { NextRequest } from 'next/server';
import { ImageResponse } from 'next/og';
import { messagingApi } from '@line/bot-sdk';
import { timingSafeEqual } from 'node:crypto';

function safeEqualString(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

function isAuthorized(req: NextRequest): boolean {
    const expected = process.env.ADMIN_PASSWORD
        ?? (process.env.NODE_ENV !== 'production' ? '123' : undefined);
    if (!expected) return false;

    const auth = req.headers.get('authorization') ?? '';
    const m = /^Bearer\s+(.+)$/i.exec(auth);
    if (!m) return false;
    return safeEqualString(m[1].trim(), expected);
}

const W = 2500;
const H = 843;

const BUTTONS = [
    { label: '參加通告', sub: '查看今日通告說明', bg: '#FDF0D5', fg: '#7a4a00', border: true },
    { label: '完成通告', sub: '打卡．記錄票房', bg: '#7a5200', fg: '#FFFFFF', border: false },
    { label: '個人統計', sub: '票房與排行查詢', bg: '#FDF0D5', fg: '#7a4a00', border: true },
    { label: '今日請假', sub: '申請當日缺席', bg: '#FDF0D5', fg: '#7a4a00', border: false },
];

async function generateImage(): Promise<Buffer> {
    // Load Noto Sans TC for CJK rendering
    let fontData: ArrayBuffer | null = null;
    try {
        const res = await fetch(
            'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-tc@5.0.1/files/noto-sans-tc-chinese-traditional-900-normal.woff'
        );
        if (res.ok) fontData = await res.arrayBuffer();
    } catch { /* fall back to no CJK font */ }

    const fonts = fontData
        ? [{ name: 'NotoSansTC', data: fontData, weight: 900 as const, style: 'normal' as const }]
        : [];

    const fontFamily = fontData ? 'NotoSansTC' : 'sans-serif';

    const imageResp = new ImageResponse(
        (
            <div style={{ display: 'flex', width: W, height: H, flexWrap: 'wrap' }}>
                {BUTTONS.map((b, i) => (
                    <div
                        key={i}
                        style={{
                            display: 'flex',
                            width: W / 2,
                            height: H / 2,
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexDirection: 'column',
                            background: b.bg,
                            borderRight: b.border ? '3px solid #d4a843' : 'none',
                            borderBottom: i < 2 ? '3px solid #d4a843' : 'none',
                            gap: 20,
                        }}
                    >
                        <span style={{ fontSize: 100, fontWeight: 900, color: b.fg, fontFamily, letterSpacing: '-2px' }}>
                            {b.label}
                        </span>
                        <span style={{ fontSize: 52, color: b.fg, opacity: 0.6, fontFamily }}>
                            {b.sub}
                        </span>
                    </div>
                ))}
            </div>
        ),
        { width: W, height: H, fonts }
    );

    return Buffer.from(await imageResp.arrayBuffer());
}

export async function POST(req: NextRequest) {
    if (!isAuthorized(req)) {
        return new Response('Unauthorized', { status: 401 });
    }

    try {
        const client = new messagingApi.MessagingApiClient({
            channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
        });
        const blobClient = new messagingApi.MessagingApiBlobClient({
            channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
        });

        // Remove existing default rich menu
        try {
            const { richMenuId: existingId } = await client.getDefaultRichMenuId();
            if (existingId) {
                await client.cancelDefaultRichMenu();
                await client.deleteRichMenu(existingId);
            }
        } catch { /* no existing menu */ }

        // Create rich menu structure
        const { richMenuId } = await client.createRichMenu({
            size: { width: W, height: H },
            selected: true,
            name: '大無限開運西遊通告選單',
            chatBarText: '通告選單',
            areas: [
                { bounds: { x: 0,    y: 0,   width: 1250, height: 421 }, action: { type: 'message', text: '通告' } },
                { bounds: { x: 1250, y: 0,   width: 1250, height: 421 }, action: { type: 'message', text: '打卡' } },
                { bounds: { x: 0,    y: 422, width: 1250, height: 421 }, action: { type: 'message', text: '排行' } },
                { bounds: { x: 1250, y: 422, width: 1250, height: 421 }, action: { type: 'message', text: '請假' } },
            ],
        });

        // Generate and upload image
        const imageBuffer = await generateImage();
        const arrayBuffer = imageBuffer.buffer.slice(imageBuffer.byteOffset, imageBuffer.byteOffset + imageBuffer.byteLength) as ArrayBuffer;
        await blobClient.setRichMenuImage(richMenuId, new Blob([arrayBuffer], { type: 'image/png' }));

        // Set as default for all users
        await client.setDefaultRichMenu(richMenuId);

        return Response.json({ success: true, richMenuId });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return Response.json({ success: false, error: message }, { status: 500 });
    }
}
