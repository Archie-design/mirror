export const runtime = 'nodejs';

import { NextRequest } from 'next/server';
import { ImageResponse } from 'next/og';

const W = 1200;
const H = 630;

export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    const name     = searchParams.get('name')     ?? '匿名';
    const date     = searchParams.get('date')     ?? '';
    const category = searchParams.get('category') ?? '';
    const content  = searchParams.get('content')  ?? '';

    // Load CJK font (best-effort)
    let fontData: ArrayBuffer | null = null;
    try {
        const res = await fetch(
            'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-tc@5.0.1/files/noto-sans-tc-chinese-traditional-900-normal.woff'
        );
        if (res.ok) fontData = await res.arrayBuffer();
    } catch { /* render without CJK font */ }

    const fonts = fontData
        ? [{ name: 'NotoSansTC', data: fontData, weight: 900 as const, style: 'normal' as const }]
        : [];
    const ff = fontData ? 'NotoSansTC' : 'sans-serif';

    // Truncate long content for display
    const display = content.length > 220 ? content.slice(0, 220) + '…' : content;

    return new ImageResponse(
        (
            <div style={{
                display: 'flex', width: W, height: H,
                background: 'linear-gradient(135deg, #1a1b2e 0%, #0d1b40 100%)',
                fontFamily: ff,
            }}>
                {/* Left gold accent bar */}
                <div style={{ display: 'flex', width: 10, background: '#d4a843', flexShrink: 0 }} />

                <div style={{ display: 'flex', flex: 1, flexDirection: 'column', padding: '44px 52px', gap: 20 }}>
                    {/* Top row: brand + date */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 26, color: '#d4a843', fontWeight: 900, letterSpacing: 1 }}>
                            ⭐ 星光西遊・親證故事
                        </span>
                        {date && (
                            <span style={{ fontSize: 22, color: '#6b7280' }}>{date}</span>
                        )}
                    </div>

                    {/* Name + category badge */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <span style={{ fontSize: 38, color: '#ffffff', fontWeight: 900 }}>{name}</span>
                        {category && (
                            <span style={{
                                fontSize: 20, color: '#d4a843',
                                background: 'rgba(212,168,67,0.15)',
                                border: '1.5px solid rgba(212,168,67,0.4)',
                                padding: '5px 18px', borderRadius: 99,
                            }}>
                                {category}
                            </span>
                        )}
                    </div>

                    {/* Divider */}
                    <div style={{ display: 'flex', height: 1.5, background: 'rgba(212,168,67,0.25)' }} />

                    {/* Content body */}
                    <div style={{ display: 'flex', flex: 1 }}>
                        <span style={{
                            fontSize: 24, color: '#c8cde0',
                            lineHeight: 1.85, whiteSpace: 'pre-wrap',
                        }}>
                            {display}
                        </span>
                    </div>

                    {/* Footer */}
                    <span style={{ fontSize: 17, color: '#3d4460' }}>
                        ✨ 感謝分享，這份親證將永久留存班級記錄中
                    </span>
                </div>
            </div>
        ),
        { width: W, height: H, fonts }
    );
}
