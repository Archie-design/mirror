'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, ChevronDown, ChevronUp, Clock, XCircle, Image as ImageIcon } from 'lucide-react';
import { CharacterStats, BonusApplication } from '@/types';
import { submitBonusApplication } from '@/app/actions/bonus';
import { compressImage } from '@/lib/utils/compress-image';

interface BonusQuestsSectionProps {
    userData: CharacterStats;
    myApplications: BonusApplication[];
    onRefresh: () => void;
}

const QUEST_LIST: { id: string; title: string; reward: number; tier: 1 | 2; desc: string }[] = [
    { id: 'o1',   title: '超越巔峰',               reward: 1000, tier: 2, desc: '小隊共同完成一項任務，每位申請成員各得分' },
    { id: 'o2_1', title: '戲劇進修－生命數字',       reward: 300,  tier: 1, desc: '完成心成課程：生命數字' },
    { id: 'o2_2', title: '戲劇進修－生命蛻變',       reward: 300,  tier: 1, desc: '完成心成課程：生命蛻變' },
    { id: 'o2_3', title: '戲劇進修－複訓大堂課',     reward: 300,  tier: 1, desc: '完成心成課程：複訓大堂課' },
    { id: 'o2_4', title: '戲劇進修－告別負債&貧窮',  reward: 300,  tier: 1, desc: '完成心成課程：告別負債&貧窮' },
    { id: 'o3',   title: '聯誼會（1年）',            reward: 500,  tier: 2, desc: '報名/續報聯誼會 1 年' },
    { id: 'o4',   title: '聯誼會（2年）',            reward: 1000, tier: 2, desc: '報名/續報聯誼會 2 年' },
    { id: 'o5',   title: '報高階（訂金）',           reward: 500,  tier: 2, desc: '報名高階課程，每階訂金各計一次' },
    { id: 'o6',   title: '報高階（完款）',           reward: 1000, tier: 2, desc: '報名高階課程完款，每階完款各計一次' },
    { id: 'o7',   title: '傳愛',                     reward: 1000, tier: 2, desc: '介紹他人參加，無上限，每人各計一次' },
];

const MULTI_SUBMIT_IDS = new Set(['o5', 'o6', 'o7']);

function targetLabel(questId: string): string {
    if (questId === 'o7') return '被介紹人姓名';
    if (questId === 'o5' || questId === 'o6') return '課程名稱/階數';
    if (questId === 'o1') return '活動說明';
    return '申請說明';
}

function StatusBadge({ status }: { status: BonusApplication['status'] }) {
    const map: Record<string, { label: string; className: string }> = {
        pending:       { label: '審核中',   className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
        squad_approved:{ label: '初審通過', className: 'bg-blue-100 text-blue-700 border-blue-200' },
        approved:      { label: '已核准',   className: 'bg-green-100 text-green-700 border-green-200' },
        rejected:      { label: '未通過',   className: 'bg-red-100 text-red-700 border-red-200' },
    };
    const s = map[status] ?? { label: status, className: 'bg-gray-100 text-gray-600 border-gray-200' };
    return (
        <span className={`text-xs font-bold px-2 py-0.5 rounded-lg border ${s.className}`}>
            {s.label}
        </span>
    );
}

export function BonusQuestsSection({ userData, myApplications, onRefresh }: BonusQuestsSectionProps) {
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [formState, setFormState] = useState<Record<string, { target: string; date: string; desc: string; file?: File; previewUrl?: string }>>({});
    const [submitting, setSubmitting] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        return () => {
            Object.values(formState).forEach(f => {
                if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
            });
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function getApps(questId: string) {
        return myApplications.filter(a => a.quest_id === questId);
    }

    function hasActive(questId: string) {
        return myApplications.some(
            a => a.quest_id === questId && ['pending', 'squad_approved', 'approved'].includes(a.status)
        );
    }

    function canApply(questId: string) {
        if (MULTI_SUBMIT_IDS.has(questId)) return true;
        return !hasActive(questId);
    }

    function getForm(questId: string) {
        return formState[questId] ?? { target: '', date: '', desc: '' };
    }

    function setField(questId: string, field: 'target' | 'date' | 'desc', value: string) {
        setFormState(prev => ({
            ...prev,
            [questId]: { ...getForm(questId), [field]: value },
        }));
    }

    async function handleFilePick(questId: string, e: React.ChangeEvent<HTMLInputElement>) {
        const raw = e.target.files?.[0];
        e.target.value = '';
        if (!raw) return;
        if (raw.size > 15 * 1024 * 1024) {
            setError('原始檔案過大（>15MB），請先在手機相簿縮小');
            return;
        }
        setError(null);
        try {
            const compressed = await compressImage(raw);
            const compressedFile = new File([compressed], 'screenshot.jpg', { type: 'image/jpeg' });
            const previewUrl = URL.createObjectURL(compressedFile);
            setFormState(prev => {
                const old = prev[questId]?.previewUrl;
                if (old) URL.revokeObjectURL(old);
                return {
                    ...prev,
                    [questId]: { ...getForm(questId), file: compressedFile, previewUrl },
                };
            });
        } catch (err: any) {
            setError('圖片處理失敗：' + (err?.message ?? ''));
        }
    }

    function clearScreenshot(questId: string) {
        setFormState(prev => {
            const url = prev[questId]?.previewUrl;
            if (url) URL.revokeObjectURL(url);
            const next = { ...getForm(questId) };
            delete next.file;
            delete next.previewUrl;
            return { ...prev, [questId]: next };
        });
    }

    async function handleSubmit(questId: string) {
        const form = getForm(questId);
        if (!form.target.trim()) { setError('請填寫必填欄位'); return; }
        if (!form.date) { setError('請選擇完成日期'); return; }
        setError(null);
        setSubmitting(true);

        let screenshotUrl: string | undefined;
        if (form.file) {
            setUploading(true);
            const fd = new FormData();
            fd.append('file', form.file);
            fd.append('userId', userData.UserID);
            fd.append('folder', 'bonus');
            try {
                const r = await fetch('/api/upload/bonus-screenshot', { method: 'POST', body: fd });
                const j = await r.json();
                if (!j.success) throw new Error(j.error ?? '上傳失敗');
                screenshotUrl = j.url;
            } catch (err: any) {
                setError('截圖上傳失敗：' + (err?.message ?? ''));
                setUploading(false);
                setSubmitting(false);
                return;
            }
            setUploading(false);
        }

        const res = await submitBonusApplication(
            userData.UserID,
            userData.Name,
            userData.TeamName || '',
            userData.SquadName || '',
            questId,
            form.target,
            form.date,
            form.desc || undefined,
            screenshotUrl,
        );
        setSubmitting(false);
        if (!res.success) {
            setError(res.error ?? '提交失敗');
            return;
        }
        if (form.previewUrl) URL.revokeObjectURL(form.previewUrl);
        setExpandedId(null);
        setFormState(prev => ({ ...prev, [questId]: { target: '', date: '', desc: '' } }));
        onRefresh();
    }

    return (
        <div className="bg-white border-2 border-[#B2DFC0] rounded-[2.5rem] shadow-md overflow-hidden">
            <div className="px-5 pt-5 pb-3 flex items-center gap-2">
                <CheckCircle size={16} className="text-[#1A6B4A]" />
                <span className="text-sm font-black text-gray-500 tracking-widest uppercase">一次性任務（截止 7/1，傳愛截止 7/11）</span>
            </div>

            <div className="divide-y divide-gray-100">
                {QUEST_LIST.map(quest => {
                    const apps = getApps(quest.id);
                    const isOpen = expandedId === quest.id;
                    const form = getForm(quest.id);
                    const approvedCount = apps.filter(a => a.status === 'approved').length;

                    return (
                        <div key={quest.id} className="px-4">
                            {/* Row */}
                            <div className="py-3 flex items-start gap-3">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-bold text-[#1A2A1A]">{quest.title}</span>
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${quest.tier === 1 ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
                                            {quest.tier === 1 ? '一級審核' : '二級審核'}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-400 mt-0.5">{quest.desc}</p>
                                    {apps.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                                            {apps.map(a => (
                                                <div key={a.id} className="flex items-center gap-1">
                                                    <StatusBadge status={a.status} />
                                                    {a.interview_target && (
                                                        <span className="text-[10px] text-gray-400 truncate max-w-[100px]">{a.interview_target}</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-sm font-black text-[#1A6B4A]">+{quest.reward}</span>
                                    {canApply(quest.id) ? (
                                        <button
                                            onClick={() => {
                                                setError(null);
                                                setExpandedId(isOpen ? null : quest.id);
                                            }}
                                            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#1A6B4A] text-white text-xs font-bold active:scale-95 transition-all min-h-[36px]"
                                        >
                                            申請
                                            {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                        </button>
                                    ) : approvedCount > 0 ? (
                                        <span className="flex items-center gap-1 text-xs font-bold text-green-600">
                                            <CheckCircle size={14} />已完成
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1 text-xs font-bold text-yellow-600">
                                            <Clock size={14} />審核中
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Inline form */}
                            {isOpen && (
                                <div className="pb-4 space-y-3">
                                    {error && (
                                        <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                                            <XCircle size={13} />
                                            {error}
                                        </div>
                                    )}
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">{targetLabel(quest.id)} *</label>
                                        <input
                                            type="text"
                                            value={form.target}
                                            onChange={e => setField(quest.id, 'target', e.target.value)}
                                            placeholder="請填寫"
                                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-base text-[#1A2A1A] focus:outline-none focus:border-[#1A6B4A]"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">完成日期 *</label>
                                        <input
                                            type="date"
                                            value={form.date}
                                            onChange={e => setField(quest.id, 'date', e.target.value)}
                                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-base text-[#1A2A1A] focus:outline-none focus:border-[#1A6B4A]"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">備註（選填）</label>
                                        <input
                                            type="text"
                                            value={form.desc}
                                            onChange={e => setField(quest.id, 'desc', e.target.value)}
                                            placeholder="補充說明"
                                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-base text-[#1A2A1A] focus:outline-none focus:border-[#1A6B4A]"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">截圖佐證（選填）</label>
                                        {form.previewUrl ? (
                                            <div className="relative inline-block">
                                                <img src={form.previewUrl} alt="預覽" className="max-h-40 rounded-xl border border-gray-200" />
                                                <button
                                                    type="button"
                                                    onClick={() => clearScreenshot(quest.id)}
                                                    className="absolute -top-2 -right-2 bg-white border border-gray-300 rounded-full w-6 h-6 flex items-center justify-center shadow"
                                                    aria-label="移除截圖"
                                                >
                                                    <XCircle size={16} className="text-red-500" />
                                                </button>
                                            </div>
                                        ) : (
                                            <label className="flex items-center justify-center gap-2 w-full border-2 border-dashed border-gray-200 rounded-xl px-3 py-3 cursor-pointer text-xs text-gray-500 hover:bg-gray-50 min-h-[44px]">
                                                <ImageIcon size={14} />
                                                <span>選擇圖片（拍照或從相簿）</span>
                                                <input
                                                    type="file"
                                                    accept="image/jpeg,image/png,image/webp"
                                                    capture="environment"
                                                    onChange={e => handleFilePick(quest.id, e)}
                                                    className="hidden"
                                                />
                                            </label>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleSubmit(quest.id)}
                                            disabled={submitting || uploading}
                                            className="flex-1 py-2.5 rounded-xl bg-[#1A6B4A] text-white font-bold text-sm active:scale-95 transition-all disabled:opacity-50 min-h-[44px]"
                                        >
                                            {uploading ? '上傳中…' : submitting ? '提交中…' : '確認提交'}
                                        </button>
                                        <button
                                            onClick={() => { setExpandedId(null); setError(null); }}
                                            className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-500 active:scale-95 transition-all min-h-[44px]"
                                        >
                                            取消
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
