'use client';

import React from 'react';
import { Save } from 'lucide-react';
import { NineGridTemplate } from '@/types';
import { getTemplates, updateTemplate } from '@/app/actions/nine-grid';
import { COMPANION_TYPES, type CompanionType } from '@/lib/constants';

export function NineGridTemplateEditor({ adminName }: { adminName: string }) {
    const [templates, setTemplates] = React.useState<NineGridTemplate[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [selectedType, setSelectedType] = React.useState<CompanionType>('事業運');
    const [cells, setCells] = React.useState<{ label: string; description: string }[]>(
        Array.from({ length: 9 }, () => ({ label: '', description: '' }))
    );
    const [cellScore, setCellScore] = React.useState(100);
    const [saving, setSaving] = React.useState(false);
    const [msg, setMsg] = React.useState('');

    const load = async () => {
        setLoading(true);
        const res = await getTemplates();
        if (res.success) setTemplates(res.templates);
        setLoading(false);
    };

    React.useEffect(() => { load(); }, []);

    // Sync cells/score when switching companion type
    React.useEffect(() => {
        const tpl = templates.find(t => t.companion_type === selectedType);
        if (tpl) {
            const filled = Array.from({ length: 9 }, (_, i) =>
                tpl.cells[i] ?? { label: '', description: '' }
            );
            setCells(filled);
            setCellScore(tpl.cell_score);
        } else {
            setCells(Array.from({ length: 9 }, () => ({ label: '', description: '' })));
            setCellScore(100);
        }
    }, [selectedType, templates]);

    const updateCell = (idx: number, field: 'label' | 'description', value: string) => {
        setCells(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
    };

    const handleSave = async () => {
        setSaving(true);
        setMsg('');
        const res = await updateTemplate(selectedType, cells, cellScore, adminName);
        if (res.success) {
            setMsg('已儲存');
            await load();
        } else {
            setMsg('儲存失敗：' + res.error);
        }
        setSaving(false);
    };

    if (loading) {
        return <p className="text-sm text-slate-500 text-center py-8">載入中...</p>;
    }

    return (
        <div className="space-y-6">
            {/* Companion type selector */}
            <div className="flex flex-wrap gap-2">
                {COMPANION_TYPES.map(type => (
                    <button
                        key={type}
                        onClick={() => setSelectedType(type)}
                        className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
                            selectedType === type
                                ? 'bg-amber-500 text-slate-900 shadow-lg shadow-amber-950/30'
                                : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                        }`}
                    >
                        {type}
                    </button>
                ))}
            </div>

            {/* Cell score input */}
            <div className="flex items-center gap-3">
                <label className="text-xs font-black text-slate-400 whitespace-nowrap">每格得分</label>
                <input
                    type="number"
                    min={0}
                    value={cellScore}
                    onChange={e => setCellScore(Number(e.target.value))}
                    className="w-24 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm font-bold text-center outline-none focus:border-amber-500"
                />
                <span className="text-xs text-slate-500">（套用至此旅伴所有格子）</span>
            </div>

            {/* 3×3 grid */}
            <div className="grid grid-cols-3 gap-3">
                {cells.map((cell, idx) => (
                    <div key={idx} className="bg-slate-800 border border-slate-700 rounded-2xl p-3 space-y-2">
                        <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-[10px] font-black text-amber-500/70 w-4 text-center">{idx + 1}</span>
                            <span className="text-[10px] text-slate-600 font-bold">
                                {idx === 4 ? '中' : ['左上', '上', '右上', '左', '', '右', '左下', '下', '右下'][idx]}
                            </span>
                        </div>
                        <input
                            type="text"
                            value={cell.label}
                            onChange={e => updateCell(idx, 'label', e.target.value)}
                            placeholder={`任務 ${idx + 1}`}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-white text-xs font-bold outline-none focus:border-amber-500 placeholder:text-slate-600"
                        />
                        <textarea
                            value={cell.description}
                            onChange={e => updateCell(idx, 'description', e.target.value)}
                            placeholder="說明（選填）"
                            rows={2}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-slate-300 text-[10px] outline-none focus:border-amber-500 placeholder:text-slate-600 resize-none"
                        />
                    </div>
                ))}
            </div>

            {/* Save */}
            <div className="flex items-center gap-4">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-3 bg-amber-500 text-slate-900 font-black rounded-2xl shadow-lg hover:bg-amber-400 active:scale-95 transition-all disabled:opacity-50 text-sm"
                >
                    <Save size={14} />
                    {saving ? '儲存中...' : `儲存「${selectedType}」公版`}
                </button>
                {msg && (
                    <span className={`text-xs font-bold ${msg.startsWith('已') ? 'text-emerald-400' : 'text-red-400'}`}>
                        {msg}
                    </span>
                )}
            </div>

            <p className="text-[10px] text-slate-600">
                * 修改模板不會影響已初始化的學員個人九宮格，僅對尚未選擇旅伴的學員生效。
            </p>
        </div>
    );
}
