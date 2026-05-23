// Client-side CSV download helper
// 將 UTF-8 字串轉成 UTF-16 LE + BOM 的 Blob 並觸發瀏覽器下載。
// 原因：Excel for Mac 對「UTF-8 BOM」的 CSV 識別不穩（locale 為繁中時常被當作 Big5）。
// UTF-16 LE + BOM 是 Excel Mac / Windows 都會正確識別的編碼。

function utf16LeBlob(text: string): Blob {
    // BMP-only 中文字皆為單一 code unit；非 BMP（極少數）用 surrogate pair，這裡逐 code unit 寫入即可。
    const buf = new ArrayBuffer(2 + text.length * 2);
    const view = new DataView(buf);
    // BOM: U+FEFF, little endian = FF FE
    view.setUint16(0, 0xFEFF, true);
    for (let i = 0; i < text.length; i++) {
        view.setUint16(2 + i * 2, text.charCodeAt(i), true);
    }
    return new Blob([buf], { type: 'text/csv;charset=utf-16le;' });
}

export function downloadCsv(csvText: string, filename: string) {
    // 若 csvText 開頭已含 UTF-8 BOM (U+FEFF)，剝掉以免重複 BOM
    const clean = csvText.charCodeAt(0) === 0xFEFF ? csvText.slice(1) : csvText;
    const blob = utf16LeBlob(clean);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}
