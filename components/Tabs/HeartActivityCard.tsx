'use client';

import { useState, useEffect } from 'react';
import { Star, Loader2, CheckCircle2 } from 'lucide-react';
import type { BonusApplication, CharacterStats } from '@/types';
import { submitBonusApplication } from '@/app/actions/bonus';
import { compressImage } from '@/lib/utils/compress-image';
import { getTaipeiDateStr } from '@/lib/utils/time';

// 心成活動 (o9) — 一級審核 + 可申請多次
// 用 BonusApplications 表（quest_id='o9'）。提交 → status=pending →
// 小隊長/大隊長/admin 初審通過 → 直接入帳 +1000（DRAMA_TRAINING 流程）
export function HeartActivityCard({
    userData,
    myApps,
    onRefresh,
}: {
    userData: CharacterStats;
    myApps: BonusApplication[];
    onRefresh?: () => Promise<void>;
}) {
    const [expanded, setExpanded] = useState(false);
    const [target, setTarget] = useState('');
    const [date, setDate] = useState('');
    const [desc, setDesc] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const REWARD = 1000;

    useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

    const handleFile = async (raw: File) => {
        if (!raw.type.startsWith('image/')) { setErr('請上傳圖片格式'); return; }
        if (raw.size > 15 * 1024 * 1024) { setErr('檔案過大（>15MB），請先縮小'); return; }
        setErr(null);
        try {
            const compressed = await compressImage(raw);
            const f = new File([compressed], 'screenshot.jpg', { type: 'image/jpeg' });
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            setFile(f);
            setPreviewUrl(URL.createObjectURL(f));
        } catch (e) {
            setErr('圖片處理失敗：' + (e instanceof Error ? e.message : String(e)));
        }
    };

    const handleSubmit = async () => {
        if (!target.trim()) { setErr('請填寫活動名稱'); return; }
        if (!date) { setErr('請選擇活動日期'); return; }
        if (!file) { setErr('請上傳活動截圖'); return; }
        setErr(null);
        setSubmitting(true);

        let screenshotUrl: string | undefined;
        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('userId', userData.UserID);
            fd.append('folder', 'bonus');
            const r = await fetch('/api/upload/bonus-screenshot', { method: 'POST', body: fd });
            const j = await r.json();
            if (!j.success) throw new Error(j.error ?? '上傳失敗');
            screenshotUrl = j.url;
        } catch (e) {
            setErr('截圖上傳失敗：' + (e instanceof Error ? e.message : String(e)));
            setSubmitting(false);
            return;
        }

        const res = await submitBonusApplication(
            userData.UserID,
            userData.Name,
            userData.TeamName || '',
            userData.SquadName || '',
            'o9',
            target.trim(),
            date,
            desc.trim() || undefined,
            screenshotUrl,
        );
        setSubmitting(false);
        if (!res.success) { setErr(res.error ?? '提交失敗'); return; }

        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setTarget(''); setDate(''); setDesc(''); setFile(null); setPreviewUrl(null);
        setExpanded(false);
        if (onRefresh) await onRefresh();
    };

    const o9Apps = myApps.filter(a => a.quest_id === 'o9');
    const approvedCount = o9Apps.filter(a => a.status === 'approved').length;
    const pendingCount = o9Apps.filter(a => a.status === 'pending').length;

    const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
        pending:        { label: '審核中',   cls: 'bg-yellow-100 text-yellow-700' },
        squad_approved: { label: '初審通過', cls: 'bg-blue-100 text-blue-700' },
        approved:       { label: '已核准',   cls: 'bg-emerald-100 text-emerald-700' },
        rejected:       { label: '未通過',   cls: 'bg-red-100 text-red-700' },
    };

    return (
        <div className="p-5 rounded-3xl border bg-white border-[#B2DFC0] space-y-3 shadow-sm text-left">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#F5FAF7] border border-[#B2DFC0] flex items-center justify-center text-[#1A6B4A] shrink-0">
                    <Star size={22} />
                </div>
                <div className="flex-1">
                    <p className="font-bold text-[#1A2A1A] text-base">心成活動</p>
                    <p className="text-sm text-gray-500">
                        參加課後課、聯誼會、同學會等活動 · 每次 +{REWARD}（無上限）
                    </p>
                </div>
                <span className="text-xs text-gray-500">
                    已核准 {approvedCount}
                    {pendingCount > 0 && <span className="text-yellow-600"> · 審核中 {pendingCount}</span>}
                </span>
            </div>

            {!expanded && (
                <button
                    onClick={() => { setExpanded(true); setErr(null); }}
                    className="w-full py-2.5 bg-[#1A6B4A] text-white font-black text-sm rounded-2xl shadow active:scale-95 hover:brightness-110"
                >
                    新增一筆申請
                </button>
            )}

            {expanded && (
                <div className="space-y-3 pt-2 border-t border-gray-100">
                    <div>
                        <label className="text-xs font-bold text-gray-600 block mb-1">活動名稱 <span className="text-red-500">*</span></label>
                        <input
                            value={target}
                            onChange={e => setTarget(e.target.value)}
                            placeholder="例：課後課、聯誼會課程、同學會"
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#1A6B4A]"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-600 block mb-1">活動日期 <span className="text-red-500">*</span></label>
                        <input
                            type="date"
                            value={date}
                            onChange={e => setDate(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#1A6B4A]"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-600 block mb-1">心得描述（選填）</label>
                        <textarea
                            value={desc}
                            onChange={e => setDesc(e.target.value)}
                            rows={2}
                            placeholder="參加的收穫或感受"
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#1A6B4A] resize-none"
                        />
                    </div>
                    <label className="block">
                        <span className="text-xs font-bold text-gray-600 mb-1 block">活動截圖 <span className="text-red-500">*</span></span>
                        {previewUrl ? (
                            <div className="relative inline-block">
                                <img src={previewUrl} alt="預覽" className="max-h-36 rounded-xl border border-[#B2DFC0] object-cover" />
                                <button
                                    type="button"
                                    onClick={() => { if (previewUrl) URL.revokeObjectURL(previewUrl); setFile(null); setPreviewUrl(null); }}
                                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-black"
                                >✕</button>
                            </div>
                        ) : (
                            <div className="relative">
                                <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                />
                                <div className="border-2 border-dashed border-[#B2DFC0] rounded-2xl p-4 text-center text-sm text-[#5A7A5A] font-bold bg-white">
                                    📷 點此選擇或拍照上傳
                                </div>
                            </div>
                        )}
                    </label>
                    {err && <p className="text-xs text-red-600">{err}</p>}
                    <div className="flex gap-2">
                        <button
                            onClick={() => { setExpanded(false); setErr(null); }}
                            disabled={submitting}
                            className="flex-1 py-2 bg-gray-100 text-gray-600 font-bold text-sm rounded-xl active:scale-95 disabled:opacity-50"
                        >
                            取消
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={submitting}
                            className="flex-[2] py-2 bg-[#1A6B4A] text-white font-black text-sm rounded-xl shadow active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1"
                        >
                            {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                            {submitting ? '提交中…' : '送出申請'}
                        </button>
                    </div>
                </div>
            )}

            {o9Apps.length > 0 && (
                <div className="pt-2 border-t border-gray-100 space-y-1.5">
                    <p className="text-xs font-bold text-gray-500">過往申請</p>
                    {o9Apps.slice(0, 5).map(a => {
                        const s = STATUS_LABEL[a.status] ?? { label: a.status, cls: 'bg-gray-100 text-gray-600' };
                        const rejectionNote = a.status === 'rejected'
                            ? (a.final_review_notes || a.squad_review_notes)
                            : null;
                        return (
                            <div key={a.id} className="space-y-1">
                                <div className="flex items-center justify-between gap-2 text-xs">
                                    <span className="text-gray-700 truncate flex-1">
                                        {a.interview_date} · {a.interview_target}
                                    </span>
                                    <span className={`shrink-0 px-2 py-0.5 rounded-lg font-bold ${s.cls}`}>{s.label}</span>
                                </div>
                                {a.status === 'approved' && a.final_review_at && (
                                    <p className="text-[10px] text-gray-400">入帳於 {getTaipeiDateStr(a.final_review_at)}</p>
                                )}
                                {rejectionNote && (
                                    <p className="text-[10px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-2 py-1">
                                        駁回原因：{rejectionNote}
                                    </p>
                                )}
                            </div>
                        );
                    })}
                    {o9Apps.length > 5 && (
                        <p className="text-[10px] text-gray-400 text-center">…還有 {o9Apps.length - 5} 筆</p>
                    )}
                </div>
            )}
        </div>
    );
}
