import { ImageResponse } from 'next/og';

const W = 1200;
const H = 630;
const RAW_W = 800;
const RAW_H = 1200;

export interface TestimonyCardParams {
    name: string;
    date?: string | null;
    category?: string | null;
    content: string;
}

async function loadFont(): Promise<ArrayBuffer | null> {
    try {
        const res = await fetch(
            'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-tc@5.0.1/files/noto-sans-tc-chinese-traditional-900-normal.woff'
        );
        if (res.ok) return res.arrayBuffer();
    } catch { /* render without CJK font */ }
    return null;
}

export async function generateTestimonyCard(params: TestimonyCardParams): Promise<Buffer> {
    const { name, date, category, content } = params;
    const display = content.length > 220 ? content.slice(0, 220) + '…' : content;

    const fontData = await loadFont();
    const fonts = fontData
        ? [{ name: 'NotoSansTC', data: fontData, weight: 900 as const, style: 'normal' as const }]
        : [];
    const ff = fontData ? 'NotoSansTC' : 'sans-serif';

    const imageResp = new ImageResponse(
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
                        {date && <span style={{ fontSize: 22, color: '#6b7280' }}>{date}</span>}
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
                        <span style={{ fontSize: 24, color: '#c8cde0', lineHeight: 1.85, whiteSpace: 'pre-wrap' }}>
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

    return Buffer.from(await imageResp.arrayBuffer());
}

export interface RawMessageCardParams {
    rawMessage: string;
    displayName: string | null;
    date?: string | null;
}

export async function generateRawMessageCard(params: RawMessageCardParams): Promise<Buffer> {
    const { rawMessage, displayName, date } = params;
    const sender = displayName ?? '學員';
    const today = date ?? new Date().toISOString().slice(0, 10);

    const fontData = await loadFont();
    const fonts = fontData
        ? [{ name: 'NotoSansTC', data: fontData, weight: 900 as const, style: 'normal' as const }]
        : [];
    const ff = fontData ? 'NotoSansTC' : 'sans-serif';

    const imageResp = new ImageResponse(
        (
            <div style={{
                display: 'flex', flexDirection: 'column',
                width: RAW_W, height: RAW_H,
                background: '#EAE9E4',
                fontFamily: ff,
            }}>
                {/* Title bar */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: '#ffffff', padding: '18px 24px',
                    borderBottom: '1px solid #d0cfc9',
                }}>
                    <span style={{ fontSize: 22, color: '#1a1a1a', fontWeight: 900 }}>
                        星光西遊親證班
                    </span>
                    <span style={{ fontSize: 18, color: '#888' }}>{today}</span>
                </div>

                {/* Message bubble area */}
                <div style={{
                    display: 'flex', flex: 1, padding: '28px 20px', flexDirection: 'column', gap: 8,
                }}>
                    {/* Sender name */}
                    <span style={{ fontSize: 18, color: '#4CAF50', fontWeight: 900, marginLeft: 4 }}>
                        {sender}
                    </span>

                    {/* Bubble */}
                    <div style={{
                        display: 'flex',
                        background: '#ffffff',
                        borderRadius: 18,
                        padding: '20px 24px',
                        maxWidth: 700,
                    }}>
                        <span style={{
                            fontSize: 22, color: '#1a1a1a',
                            lineHeight: 1.9, whiteSpace: 'pre-wrap',
                        }}>
                            {rawMessage}
                        </span>
                    </div>
                </div>

                {/* Watermark */}
                <div style={{
                    display: 'flex', justifyContent: 'center',
                    padding: '12px 0', background: '#deded8',
                }}>
                    <span style={{ fontSize: 16, color: '#888' }}>
                        ⭐ 星光西遊・親證存檔
                    </span>
                </div>
            </div>
        ),
        { width: RAW_W, height: RAW_H, fonts }
    );

    return Buffer.from(await imageResp.arrayBuffer());
}
