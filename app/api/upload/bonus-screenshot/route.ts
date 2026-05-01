'use server';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const BUCKET = 'bonus-screenshots';

async function ensureBucket(supabase: SupabaseClient): Promise<void> {
  const { data: existing } = await supabase.storage.getBucket(BUCKET);
  if (existing) return;
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  });
  if (error && !/already exists/i.test(error.message)) throw error;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const userId = formData.get('userId') as string;
    const folder = (formData.get('folder') as string) || 'b5b6';

    if (!file || !userId) {
      return NextResponse.json(
        { success: false, error: '缺少必要參數' },
        { status: 400 }
      );
    }

    // 文件大小限制 (5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: '檔案大小不能超過 5MB' },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { success: false, error: '僅接受 JPEG / PNG / WebP 格式' },
        { status: 400 }
      );
    }

    const safeFolder = /^[a-z0-9_-]+$/i.test(folder) ? folder : 'b5b6';

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 生成唯一的檔案名稱
    const timestamp = Date.now();
    const fileExt = EXT_BY_TYPE[file.type];
    const fileName = `${safeFolder}/${userId}/${timestamp}.${fileExt}`;

    // 轉換 File 為 Buffer
    const buffer = await file.arrayBuffer();

    const upload = () => supabase.storage
      .from(BUCKET)
      .upload(fileName, buffer, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type,
      });

    let { error } = await upload();
    if (error && /bucket not found/i.test(error.message)) {
      try {
        await ensureBucket(supabase);
        ({ error } = await upload());
      } catch (e: any) {
        return NextResponse.json(
          { success: false, error: '建立儲存桶失敗：' + (e?.message ?? '未知錯誤') },
          { status: 500 }
        );
      }
    }

    if (error) {
      return NextResponse.json(
        { success: false, error: '上傳失敗：' + error.message },
        { status: 500 }
      );
    }

    // 取得公開 URL
    const { data: publicUrl } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(fileName);

    return NextResponse.json({
      success: true,
      url: publicUrl.publicUrl,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: '伺服器錯誤：' + err.message },
      { status: 500 }
    );
  }
}
