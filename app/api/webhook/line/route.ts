import { validateSignature, messagingApi } from '@line/bot-sdk';
import { getLineClient } from '@/lib/line/client';
import { matchKeyword } from '@/lib/line/keywords';
import { parseTestimony } from '@/lib/line/parser';
import { saveTestimony, upsertLineGroup } from '@/app/actions/testimony';
import { generateTestimonyCard } from '@/lib/line/testimony-card';
import { uploadTestimonyCardToDrive } from '@/lib/line/google-drive';

export const runtime = 'nodejs';

export async function POST(req: Request) {
    const rawBody = await req.text();
    const signature = req.headers.get('x-line-signature') ?? '';
    const channelSecret = process.env.LINE_CHANNEL_SECRET ?? '';

    // Verify LINE webhook signature
    if (!channelSecret || !validateSignature(rawBody, channelSecret, signature)) {
        return new Response('Unauthorized', { status: 401 });
    }

    let body: { events: any[] };
    try {
        body = JSON.parse(rawBody);
    } catch {
        return new Response('Bad Request', { status: 400 });
    }

    const client = getLineClient();

    for (const event of body.events) {
        try {
            // Track group joins
            if (event.type === 'join' && event.source?.type === 'group') {
                await upsertLineGroup({
                    groupId: event.source.groupId,
                    groupName: null, // LINE doesn't provide group name in join event
                });
                continue;
            }

            // Only handle text messages
            if (event.type !== 'message' || event.message?.type !== 'text') continue;

            const text: string = event.message.text;
            const lineUserId: string = event.source?.userId ?? 'unknown';
            const groupId: string | null = event.source?.groupId ?? null;
            const replyToken: string = event.replyToken;

            // 1. Testimony format detection (priority over keyword matching)
            const testimony = parseTestimony(text);
            if (testimony) {
                // Fetch display name (best-effort)
                let displayName: string | null = null;
                try {
                    if (groupId) {
                        const profile = await client.getGroupMemberProfile(groupId, lineUserId);
                        displayName = profile.displayName;
                    } else {
                        const profile = await client.getProfile(lineUserId);
                        displayName = profile.displayName;
                    }
                } catch {
                    // Non-critical — continue without display name
                }

                const name = testimony.parsedName ?? displayName ?? '您';

                // Reply with text confirmation only (no image to group)
                await client.replyMessage({
                    replyToken,
                    messages: [{
                        type: 'text',
                        text: `✨ 親證故事已記錄！感謝 ${name} 的分享，這份親證將永久留存在班級記錄中。`,
                    }],
                });

                // Save to DB
                await saveTestimony({ lineUserId, groupId, displayName, rawMessage: text, testimony });

                // Generate card and upload to Google Drive (awaited so Vercel doesn't terminate early)
                try {
                    const buffer = await generateTestimonyCard({
                        name,
                        date: testimony.parsedDate,
                        category: testimony.parsedCategory,
                        content: testimony.content,
                    });
                    const safeName = name.replace(/[\\/:*?"<>|]/g, '_');
                    const dateStr = testimony.parsedDate ?? new Date().toISOString().slice(0, 10);
                    const filename = `${safeName}_${dateStr}_${Date.now()}.png`;
                    await uploadTestimonyCardToDrive(buffer, filename);
                } catch (err) {
                    console.error('Google Drive upload error:', err);
                }

                continue;
            }

            // Detect incomplete testimony format (has trigger but missing content)
            if ((text.includes('#親證故事') || text.includes('#親證')) && !testimony) {
                await client.replyMessage({
                    replyToken,
                    messages: [{
                        type: 'text',
                        text: '❗ 請確認訊息格式包含「內容：」欄位，故事才能被正確記錄哦！\n\n格式範例：\n#親證故事\n姓名：王小明\n日期：2026-06-01\n類別：家庭\n內容：\n[您的故事...]',
                    }],
                });
                continue;
            }

            // 2. Keyword tutorial matching
            const response = matchKeyword(text);
            if (response) {
                await client.replyMessage({
                    replyToken,
                    messages: [response],
                });
            }
            // No match → silent (avoid group noise)
        } catch (err) {
            // Log error but don't fail the whole webhook — LINE expects 200 response
            console.error('LINE webhook event error:', err);
        }
    }

    return new Response('OK', { status: 200 });
}
