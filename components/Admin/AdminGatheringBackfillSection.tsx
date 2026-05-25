'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Loader2, Upload, Crown, ImageIcon, CheckCircle2 } from 'lucide-react';
import { adminBackfillGathering } from '@/app/actions/squad-gathering';
import { listAllMembers } from '@/app/actions/admin';
import { compressImage } from '@/lib/utils/compress-image';

interface Member {
    UserID: string;
    Name: string;
    TeamName: string | null;
    SquadName: string | null;
    IsCommandant?: boolean | null;
}

interface Props {
    adminUserId: string;
}

export function AdminGatheringBackfillSection({ adminUserId }: Props) {
    const [members, setMembers] = useState<Member[]>([]);

    useEffect(() => {
        (async () => {
            const res = await listAllMembers();
            if (res.success) setMembers((res.members as Member[]) ?? []);
        })();
    }, []);

    const [teamName, setTeamName] = useState<string>('');
    const [gatheringDate, setGatheringDate] = useState<string>('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [hasCommandant, setHasCommandant] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [notes, setNotes] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState<{ rewardPerPerson: number; attendeeCount: number } | null>(null);

    const teams = useMemo(() => {
        const set = new Set<string>();
        for (const m of members) if (m.TeamName) set.add(m.TeamName);
        return Array.from(set).sort();
    }, [members]);

    const teamMembers = useMemo(() => {
        return members
            .filter(m => m.TeamName === teamName)
            .sort((a, b) => a.Name.localeCompare(b.Name, 'zh'));
    }, [members, teamName]);

    // 該大隊的大隊長(TeamName 通常為 null,但 SquadName 同)
    const squadCommandants = useMemo(() => {
        if (!teamName) return [];
        const sample = members.find(m => m.TeamName === teamName);
        if (!sample?.SquadName) return [];
        return members
            .filter(m => m.IsCommandant && m.SquadName === sample.SquadName && m.TeamName !== teamName)
            .sort((a, b) => a.Name.localeCompare(b.Name, 'zh'));
    }, [members, teamName]);

    const memberCount = teamMembers.length;
    const attendeeCount = selectedIds.size;
    const projectedReward = useMemo(() => {
        let r = 3000;
        if (memberCount > 0 && attendeeCount >= memberCount) r += 1000;
        if (hasCommandant) r += 1000;
        return r;
    }, [memberCount, attendeeCount, hasCommandant]);

    function toggleMember(id: string) {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }

    function selectAll() {
        setSelectedIds(new Set(teamMembers.map(m => m.UserID)));
    }

    function clearAll() {
        setSelectedIds(new Set());
    }

    async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const f = e.target.files?.[0];
        if (!f) return;
        if (!f.type.startsWith('image/')) {
            setError('請上傳圖片檔(JPG/PNG/WebP)');
            return;
        }
        if (f.size > 15 * 1024 * 1024) {
            setError('原圖過大(>15MB)');
            return;
        }
        setError(null);
        try {
            const compressed = await compressImage(f);
            const compressedFile = new File([compressed], 'evidence.jpg', { type: 'image/jpeg' });
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            setFile(compressedFile);
            setPreviewUrl(URL.createObjectURL(compressedFile));
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setError('圖片處理失敗:' + msg);
        }
    }

    function reset() {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setTeamName('');
        setGatheringDate('');
        setSelectedIds(new Set());
        setHasCommandant(false);
        setFile(null);
        setPreviewUrl(null);
        setNotes('');
        setError(null);
        setDone(null);
    }

    async function onSubmit() {
        setError(null);

        if (!teamName) { setError('請選小隊'); return; }
        if (!gatheringDate) { setError('請選凝聚日期'); return; }
        if (selectedIds.size === 0) { setError('至少勾選一位出席隊員'); return; }
        if (!file) { setError('請上傳截圖佐證'); return; }

        setSubmitting(true);
        try {
            // 1) 上傳截圖
            const fd = new FormData();
            fd.append('file', file);
            fd.append('userId', adminUserId);
            fd.append('folder', 'gathering');
            const uploadRes = await fetch('/api/upload/bonus-screenshot', { method: 'POST', body: fd });
            const uploadJson = await uploadRes.json();
            if (!uploadJson.success) {
                setError('截圖上傳失敗:' + (uploadJson.error ?? '未知錯誤'));
                setSubmitting(false);
                return;
            }

            // 2) 呼叫補報 action
            const res = await adminBackfillGathering({
                teamName,
                gatheringDate,
                attendeeUserIds: Array.from(selectedIds),
                hasCommandant,
                evidenceScreenshotUrl: uploadJson.url,
                notes: notes.trim() || undefined,
            });

            if (!res.success) {
                setError(res.error ?? '補報失敗');
                setSubmitting(false);
                return;
            }

            setDone({
                rewardPerPerson: res.rewardPerPerson ?? 0,
                attendeeCount: res.attendeeCount ?? 0,
            });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setError('提交失敗:' + msg);
        } finally {
            setSubmitting(false);
        }
    }

    if (done) {
        return (
            <section className="space-y-4 bg-emerald-950/30 border-2 border-emerald-700/40 rounded-3xl p-6">
                <div className="flex items-center gap-2 text-emerald-300 font-black text-sm uppercase tracking-widest">
                    <CheckCircle2 size={16} /> 補報成功
                </div>
                <p className="text-sm text-emerald-200">
                    已為 <b>{done.attendeeCount}</b> 位隊員入帳 <b>+{done.rewardPerPerson}</b> 分/人(實際入帳會受每週 5000 上限影響)
                </p>
                <button onClick={reset} className="px-4 py-2 bg-emerald-700 text-white rounded-xl text-sm font-bold">繼續補報下一場</button>
            </section>
        );
    }

    return (
        <section className="space-y-4 bg-slate-900/60 border-2 border-slate-700/40 rounded-3xl p-6">
            <div className="flex items-center gap-2 text-amber-400 font-black text-sm uppercase tracking-widest">
                <CalendarDays size={14} /> 實體凝聚補報
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed">
                適用「現場 QR 沒掃成功 / 隊長忘記送審」等補救情境。直接以已核准入帳,需上傳截圖佐證。
            </p>

            {/* 小隊 + 日期 */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="block text-[10px] text-slate-400 font-bold mb-1">小隊 *</label>
                    <select
                        value={teamName}
                        onChange={e => { setTeamName(e.target.value); setSelectedIds(new Set()); }}
                        className="w-full bg-slate-800 text-white text-sm px-3 py-2 rounded-xl border border-slate-700"
                    >
                        <option value="">請選擇…</option>
                        {teams.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-[10px] text-slate-400 font-bold mb-1">凝聚日期 *</label>
                    <input
                        type="date"
                        value={gatheringDate}
                        min="2026-05-10"
                        max={new Date().toISOString().slice(0, 10)}
                        onChange={e => setGatheringDate(e.target.value)}
                        className="w-full bg-slate-800 text-white text-sm px-3 py-2 rounded-xl border border-slate-700"
                    />
                </div>
            </div>

            {/* 出席隊員 */}
            {teamName && (
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-[10px] text-slate-400 font-bold">出席隊員 *({attendeeCount}/{memberCount})</label>
                        <div className="flex gap-2">
                            <button type="button" onClick={selectAll} className="text-[10px] text-cyan-400 hover:text-cyan-300 font-bold">全選</button>
                            <button type="button" onClick={clearAll} className="text-[10px] text-slate-500 hover:text-slate-300 font-bold">清空</button>
                        </div>
                    </div>
                    <div className="bg-slate-800/60 rounded-xl p-3 max-h-48 overflow-y-auto space-y-1">
                        {teamMembers.length === 0 ? (
                            <p className="text-xs text-slate-500 text-center py-2">此小隊無成員</p>
                        ) : teamMembers.map(m => (
                            <label key={m.UserID} className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer hover:bg-slate-700/40 px-2 py-1 rounded">
                                <input
                                    type="checkbox"
                                    checked={selectedIds.has(m.UserID)}
                                    onChange={() => toggleMember(m.UserID)}
                                />
                                <span>{m.Name}</span>
                            </label>
                        ))}
                    </div>
                </div>
            )}

            {/* 大隊長出席 */}
            {teamName && (
                <div className="bg-slate-800/40 rounded-xl p-3 space-y-2">
                    <label className="flex items-center gap-2 text-xs text-amber-300 font-bold cursor-pointer">
                        <input
                            type="checkbox"
                            checked={hasCommandant}
                            onChange={e => setHasCommandant(e.target.checked)}
                        />
                        <Crown size={12} /> 大隊長有親自出席(+1000)
                    </label>
                    {hasCommandant && squadCommandants.length > 0 && (
                        <div className="text-[10px] text-slate-400 pl-5">
                            可一併勾選此大隊的大隊長:
                            <div className="space-y-1 mt-1">
                                {squadCommandants.map(c => (
                                    <label key={c.UserID} className="flex items-center gap-2 cursor-pointer hover:text-slate-200">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(c.UserID)}
                                            onChange={() => toggleMember(c.UserID)}
                                        />
                                        <span>{c.Name}(大隊長)</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* 截圖上傳 */}
            <div>
                <label className="block text-[10px] text-slate-400 font-bold mb-1">截圖佐證 *</label>
                <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={onFileChange}
                    className="text-xs text-slate-300"
                />
                {previewUrl && (
                    <div className="mt-2 inline-block bg-slate-800 p-2 rounded-xl">
                        <img src={previewUrl} alt="截圖預覽" className="max-h-32 rounded" />
                    </div>
                )}
                {!file && (
                    <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1"><ImageIcon size={10} /> 必填,任何能證明凝聚發生的圖檔皆可(LINE 通話截圖、合照、簽到表…)</p>
                )}
            </div>

            {/* 備註 */}
            <div>
                <label className="block text-[10px] text-slate-400 font-bold mb-1">備註(選填)</label>
                <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="例:5/20 QR 系統故障,事後補報"
                    className="w-full bg-slate-800 text-white text-xs px-3 py-2 rounded-xl border border-slate-700 min-h-[60px]"
                />
            </div>

            {/* 預覽 + 送出 */}
            {teamName && attendeeCount > 0 && (
                <div className="bg-amber-950/40 border border-amber-700/40 rounded-xl p-3 text-xs text-amber-200">
                    預計入帳:<b className="text-amber-100">+{projectedReward}</b> 分/人 × <b className="text-amber-100">{attendeeCount}</b> 人
                    {memberCount > 0 && attendeeCount < memberCount && (
                        <span className="text-amber-400/60">(尚未全員,缺「全到 +1000」加成)</span>
                    )}
                </div>
            )}

            {error && (
                <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 rounded-xl px-3 py-2">
                    {error}
                </p>
            )}

            <button
                disabled={submitting || !teamName || !gatheringDate || attendeeCount === 0 || !file}
                onClick={onSubmit}
                className="w-full px-4 py-3 bg-amber-600 hover:bg-amber-500 text-white font-black text-sm rounded-xl disabled:opacity-40 flex items-center justify-center gap-2"
            >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {submitting ? '處理中…' : '送出補報'}
            </button>
        </section>
    );
}
