export async function compressImage(
    file: File,
    opts: { maxSize?: number; quality?: number } = {},
): Promise<Blob> {
    const { maxSize = 1280, quality = 0.8 } = opts;
    if (!file.type.startsWith('image/')) throw new Error('檔案不是圖片');

    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        bitmap.close();
        throw new Error('Canvas 不可用');
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
            blob => (blob ? resolve(blob) : reject(new Error('壓縮失敗'))),
            'image/jpeg',
            quality,
        );
    });
}
