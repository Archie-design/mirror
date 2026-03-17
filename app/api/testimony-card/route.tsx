export const runtime = 'nodejs';

import { NextRequest } from 'next/server';
import { generateTestimonyCard } from '@/lib/line/testimony-card';

export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    const name     = searchParams.get('name')     ?? '匿名';
    const date     = searchParams.get('date')     || null;
    const category = searchParams.get('category') || null;
    const content  = searchParams.get('content')  ?? '';

    const buffer = await generateTestimonyCard({ name, date, category, content });

    return new Response(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer, {
        headers: { 'Content-Type': 'image/png' },
    });
}
