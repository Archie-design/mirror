'use client';
import React, { useRef, useEffect, useMemo, useState } from 'react';
import { X, Globe } from 'lucide-react';
import { CharacterStats } from '@/types';
import { DEFAULT_CONFIG, TERRAIN_TYPES, ROLE_CURE_MAP, ZONES } from '@/lib/constants';
import { axialToPixelPos, getHexDist, getHexRegion } from '@/lib/utils/hex';

interface WorldOverviewProps {
    isOpen: boolean;
    onClose: () => void;
    mapData: Record<string, string>;
    corridorL: number;
    corridorW: number;
    dbEntities: any[];
    userData: CharacterStats;
}

const CANVAS_SIZE = 680;
const HEX_SIZE = DEFAULT_CONFIG.HEX_SIZE_WORLD;
const CENTER_SIDE = DEFAULT_CONFIG.CENTER_SIDE;
const SUBZONE_SIDE = DEFAULT_CONFIG.SUBZONE_SIDE;

type OverviewHex = { x: number; y: number; color: string; zoneId: string };

const SIDE_DATA = (R_hub: number) => [
    { start: { q: 0, r: -R_hub }, step: { q: 1, r: 0 }, out: { q: 1, r: -1 } },
    { start: { q: R_hub, r: -R_hub }, step: { q: 0, r: 1 }, out: { q: 1, r: 0 } },
    { start: { q: R_hub, r: 0 }, step: { q: -1, r: 1 }, out: { q: 0, r: 1 } },
    { start: { q: 0, r: R_hub }, step: { q: -1, r: 0 }, out: { q: -1, r: 1 } },
    { start: { q: -R_hub, r: R_hub }, step: { q: 0, r: -1 }, out: { q: -1, r: 0 } },
    { start: { q: -R_hub, r: 0 }, step: { q: 1, r: -1 }, out: { q: 0, r: -1 } },
];

const SUB_CENTERS = (S_s: number) => [
    { q: 0, r: 0 }, { q: 2 * S_s - 1, r: -(S_s - 1) }, { q: S_s, r: S_s - 1 },
    { q: -(S_s - 1), r: 2 * S_s - 1 }, { q: -(2 * S_s - 1), r: S_s - 1 },
    { q: -S_s, r: -(S_s - 1) }, { q: S_s - 1, r: -(2 * S_s - 1) },
];

export function WorldOverview({ isOpen, onClose, mapData, corridorL, corridorW, dbEntities, userData }: WorldOverviewProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [viewPan, setViewPan] = useState({ x: 0, y: 0 });
    const [viewZoom, setViewZoom] = useState(1);
    const dragRef = useRef({ active: false, lastX: 0, lastY: 0 });
    const pinchRef = useRef({ active: false, lastDist: 0 });

    // Reset pan/zoom when modal opens
    useEffect(() => {
        if (isOpen) { setViewPan({ x: 0, y: 0 }); setViewZoom(1); }
    }, [isOpen]);

    const onPanelMouseDown = (e: React.MouseEvent) => {
        dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY };
    };
    const onPanelMouseMove = (e: React.MouseEvent) => {
        if (!dragRef.current.active) return;
        setViewPan(p => ({ x: p.x + e.clientX - dragRef.current.lastX, y: p.y + e.clientY - dragRef.current.lastY }));
        dragRef.current.lastX = e.clientX;
        dragRef.current.lastY = e.clientY;
    };
    const onPanelMouseUp = () => { dragRef.current.active = false; };
    const onPanelTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length === 1) {
            dragRef.current = { active: true, lastX: e.touches[0].clientX, lastY: e.touches[0].clientY };
            pinchRef.current.active = false;
        } else if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            pinchRef.current = { active: true, lastDist: Math.sqrt(dx * dx + dy * dy) };
            dragRef.current.active = false;
        }
    };
    const onPanelTouchMove = (e: React.TouchEvent) => {
        if (e.touches.length === 1 && dragRef.current.active) {
            const dx = e.touches[0].clientX - dragRef.current.lastX;
            const dy = e.touches[0].clientY - dragRef.current.lastY;
            setViewPan(p => ({ x: p.x + dx, y: p.y + dy }));
            dragRef.current.lastX = e.touches[0].clientX;
            dragRef.current.lastY = e.touches[0].clientY;
        } else if (e.touches.length === 2 && pinchRef.current.active) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            setViewZoom(z => Math.min(Math.max(0.3, z * (dist / pinchRef.current.lastDist)), 5));
            pinchRef.current.lastDist = dist;
        }
    };
    const onPanelTouchEnd = () => { dragRef.current.active = false; pinchRef.current.active = false; };
    const onPanelWheel = (e: React.WheelEvent) => {
        setViewZoom(z => Math.min(Math.max(0.3, z - Math.sign(e.deltaY) * 0.15), 5));
    };

    // Build full-world grid (no culling) and zone center positions
    const { overviewGrid, zoneCenters } = useMemo(() => {
        const hexes: OverviewHex[] = [];
        const hexMap = new Set<string>();
        const R_hub = CENTER_SIDE - 1;
        const S_s = SUBZONE_SIDE;
        const sideData = SIDE_DATA(R_hub);

        // Center zone
        getHexRegion(R_hub).forEach(p => {
            const pos = axialToPixelPos(p.q, p.r, HEX_SIZE);
            const terrainId = mapData[`center_0_${p.q},${p.r}`] || 'grass';
            hexes.push({ ...pos, color: TERRAIN_TYPES[terrainId]?.color || '#1a472a', zoneId: 'center' });
            hexMap.add(`${p.q},${p.r}`);
        });

        const centers: Array<{ id: string; svgX: number; svgY: number }> = [
            { id: 'center', svgX: 0, svgY: 0 },
        ];

        ZONES.forEach((zone, zIdx) => {
            const side = sideData[zIdx];
            const centerIdx = Math.floor(CENTER_SIDE / 2);
            const halfW = Math.floor(corridorW / 2);

            // Corridors
            for (let i = -halfW; i <= halfW; i++) {
                const idx = centerIdx + i;
                const startQ = side.start.q + side.step.q * idx;
                const startR = side.start.r + side.step.r * idx;
                for (let l = 1; l <= corridorL; l++) {
                    const q = startQ + side.out.q * l;
                    const r = startR + side.out.r * l;
                    const key = `${q},${r}`;
                    if (!hexMap.has(key)) {
                        const pos = axialToPixelPos(q, r, HEX_SIZE);
                        hexes.push({ ...pos, color: '#1e293b', zoneId: zone.id });
                        hexMap.add(key);
                    }
                }
            }

            // Zone subzones
            const hubExitQ = side.start.q + side.step.q * centerIdx + side.out.q * corridorL;
            const hubExitR = side.start.r + side.step.r * centerIdx + side.out.r * corridorL;
            const zCQ = hubExitQ + side.out.q * S_s;
            const zCR = hubExitR + side.out.r * S_s;
            const zoneCenterPos = axialToPixelPos(zCQ, zCR, HEX_SIZE);
            centers.push({ id: zone.id, svgX: zoneCenterPos.x, svgY: zoneCenterPos.y });

            SUB_CENTERS(S_s).forEach((sc, sIdx) => {
                const cq = zCQ + sc.q;
                const cr = zCR + sc.r;
                getHexRegion(S_s - 1).forEach(p => {
                    const q = cq + p.q;
                    const r = cr + p.r;
                    const key = `${q},${r}`;
                    if (!hexMap.has(key)) {
                        const dataKey = `${zone.id}_${sIdx}_${p.q},${p.r}`;
                        const terrainId = mapData[dataKey];
                        const pos = axialToPixelPos(q, r, HEX_SIZE);
                        hexes.push({
                            ...pos,
                            color: terrainId ? (TERRAIN_TYPES[terrainId]?.color || zone.color) : zone.color,
                            zoneId: zone.id,
                        });
                        hexMap.add(key);
                    }
                });
            });
        });

        return { overviewGrid: hexes, zoneCenters: centers };
    }, [mapData, corridorL, corridorW]);

    // Canvas coordinate transform
    const transform = useMemo(() => {
        if (overviewGrid.length === 0) return null;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const h of overviewGrid) {
            if (h.x < minX) minX = h.x;
            if (h.x > maxX) maxX = h.x;
            if (h.y < minY) minY = h.y;
            if (h.y > maxY) maxY = h.y;
        }
        const worldW = maxX - minX;
        const worldH = maxY - minY;
        const scale = Math.min(
            (CANVAS_SIZE * 0.92) / worldW,
            (CANVAS_SIZE * 0.92) / worldH
        );
        const offsetX = (CANVAS_SIZE - worldW * scale) / 2 - minX * scale;
        const offsetY = (CANVAS_SIZE - worldH * scale) / 2 - minY * scale;
        return { scale, offsetX, offsetY };
    }, [overviewGrid]);

    // Draw canvas
    useEffect(() => {
        if (!isOpen || !canvasRef.current || !transform || overviewGrid.length === 0) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const { scale, offsetX, offsetY } = transform;
        const dotSize = Math.max(scale * HEX_SIZE * 1.7, 2);

        const rafId = requestAnimationFrame(() => {
            ctx.fillStyle = '#040407';
            ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

            // Draw hexes batched by color
            const sorted = [...overviewGrid].sort((a, b) => a.color < b.color ? -1 : 1);
            let lastColor = '';
            for (const h of sorted) {
                if (h.color !== lastColor) {
                    ctx.fillStyle = h.color;
                    lastColor = h.color;
                }
                const cx = h.x * scale + offsetX;
                const cy = h.y * scale + offsetY;
                ctx.fillRect(cx - dotSize / 2, cy - dotSize / 2, dotSize, dotSize);
            }

            // Teammate dots
            const teammates = dbEntities.filter(e => e.type === 'teammate' && e.is_active !== false);
            ctx.shadowColor = '#22d3ee';
            ctx.shadowBlur = 8;
            ctx.fillStyle = '#22d3ee';
            for (const t of teammates) {
                const pos = axialToPixelPos(t.q, t.r, HEX_SIZE);
                const cx = pos.x * scale + offsetX;
                const cy = pos.y * scale + offsetY;
                ctx.beginPath();
                ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
                ctx.fill();
            }

            // Player dot
            const playerPos = axialToPixelPos(userData.CurrentQ, userData.CurrentR, HEX_SIZE);
            const px = playerPos.x * scale + offsetX;
            const py = playerPos.y * scale + offsetY;
            ctx.shadowColor = '#ffffff';
            ctx.shadowBlur = 16;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(px, py, 6.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        });

        return () => cancelAnimationFrame(rafId);
    }, [isOpen, overviewGrid, transform, userData.CurrentQ, userData.CurrentR, dbEntities]);

    // Release GPU on close
    useEffect(() => {
        if (!isOpen && canvasRef.current) {
            // eslint-disable-next-line no-self-assign
            canvasRef.current.width = canvasRef.current.width;
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const teammates = dbEntities.filter(e => e.type === 'teammate' && e.is_active !== false);
    const roleConfig = ROLE_CURE_MAP[userData.Role];

    // Zone label positions in canvas space
    const zoneLabelItems = transform
        ? [
            { id: 'center', name: '本心草原', textColor: 'text-emerald-300' },
            ...ZONES.map(z => ({ id: z.id, name: z.name, textColor: z.textColor })),
        ].map(zl => {
            const zc = zoneCenters.find(c => c.id === zl.id);
            if (!zc) return null;
            return {
                ...zl,
                canvasX: zc.svgX * transform.scale + transform.offsetX,
                canvasY: zc.svgY * transform.scale + transform.offsetY,
            };
        }).filter(Boolean as unknown as <T>(x: T | null) => x is T)
        : [];

    // Player label position
    const playerCanvasPos = transform
        ? (() => {
            const pos = axialToPixelPos(userData.CurrentQ, userData.CurrentR, HEX_SIZE);
            return {
                x: pos.x * transform.scale + transform.offsetX,
                y: pos.y * transform.scale + transform.offsetY,
            };
        })()
        : null;

    return (
        <div className="fixed inset-0 z-[200] bg-slate-950/95 backdrop-blur-sm flex flex-col animate-in fade-in duration-150">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-white/10 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-sky-600 rounded-xl text-white shadow-lg border border-sky-400/20">
                        <Globe size={18} />
                    </div>
                    <h2 className="text-white font-black text-xl tracking-widest uppercase">
                        地圖全景 <span className="opacity-40 text-xs font-normal">// World Panorama</span>
                    </h2>
                </div>
                <button
                    onClick={onClose}
                    className="p-2 rounded-xl bg-slate-800 border border-white/5 text-slate-400 hover:text-white hover:bg-slate-700 transition-all active:scale-95"
                >
                    <X size={20} />
                </button>
            </div>

            {/* Body */}
            <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
                {/* Canvas panel — fixed height on mobile so sidebar has room to scroll */}
                <div
                    className="shrink-0 h-[45vh] md:h-auto md:flex-1 flex items-center justify-center bg-[#040407] relative overflow-hidden touch-none cursor-grab active:cursor-grabbing"
                    onMouseDown={onPanelMouseDown}
                    onMouseMove={onPanelMouseMove}
                    onMouseUp={onPanelMouseUp}
                    onMouseLeave={onPanelMouseUp}
                    onTouchStart={onPanelTouchStart}
                    onTouchMove={onPanelTouchMove}
                    onTouchEnd={onPanelTouchEnd}
                    onWheel={onPanelWheel}
                >
                    <div className="relative" style={{ width: CANVAS_SIZE, height: CANVAS_SIZE, transform: `translate(${viewPan.x}px, ${viewPan.y}px) scale(${viewZoom})`, transformOrigin: 'center center' }}>
                        <canvas
                            ref={canvasRef}
                            width={CANVAS_SIZE}
                            height={CANVAS_SIZE}
                            className="rounded-2xl"
                        />

                        {/* Zone name labels */}
                        {zoneLabelItems.map(zl => (
                            <div
                                key={zl.id}
                                className="absolute pointer-events-none select-none"
                                style={{ left: zl.canvasX, top: zl.canvasY, transform: 'translate(-50%, -50%)' }}
                            >
                                <span className={`text-[10px] font-black ${zl.textColor} drop-shadow-[0_1px_4px_rgba(0,0,0,1)] bg-slate-950/60 px-1.5 py-0.5 rounded-md whitespace-nowrap`}>
                                    {zl.name}
                                </span>
                            </div>
                        ))}

                        {/* Player name label */}
                        {playerCanvasPos && (
                            <div
                                className="absolute pointer-events-none select-none"
                                style={{ left: playerCanvasPos.x, top: playerCanvasPos.y - 14, transform: 'translate(-50%, -100%)' }}
                            >
                                <span className="text-[9px] font-black text-white bg-slate-950/80 px-1.5 py-0.5 rounded-md whitespace-nowrap drop-shadow-lg border border-white/20">
                                    ▲ {userData.Name}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Sidebar — flex-1 + min-h-0 so it fills remaining space and scrolls on mobile */}
                <div className="flex-1 min-h-0 md:flex-none md:w-72 md:shrink-0 border-t md:border-t-0 md:border-l border-white/10 overflow-y-auto bg-slate-900/50 p-4 flex flex-col gap-5">
                    {/* Zone Legend */}
                    <section>
                        <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">區域圖例</div>
                        <div className="space-y-1">
                            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-emerald-900/20 border border-emerald-500/10">
                                <div className="w-3 h-3 rounded-sm shrink-0 bg-[#1a472a]" />
                                <span className="text-[11px] font-bold text-emerald-300 flex-1">本心草原</span>
                                <span className="text-[9px] text-slate-600">安全區</span>
                            </div>
                            {ZONES.map(zone => {
                                const isNativeZone = zone.char === userData.Role;
                                return (
                                    <div
                                        key={zone.id}
                                        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${isNativeZone ? 'bg-white/8 border border-white/15' : 'bg-slate-800/30'}`}
                                    >
                                        <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: zone.color }} />
                                        <span className={`text-[11px] font-bold flex-1 ${zone.textColor}`}>{zone.name}</span>
                                        <span className="text-[9px] text-slate-500">{zone.char}</span>
                                        {isNativeZone && (
                                            <span className="text-[8px] font-black text-yellow-400 ml-0.5">天命</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    {/* Role curse info */}
                    {roleConfig && (
                        <section>
                            <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">職業詛咒</div>
                            <div className="bg-slate-800/50 rounded-xl p-3 space-y-2.5 border border-white/5">
                                <div className="flex items-center gap-2">
                                    <span className={`text-[10px] px-2 py-0.5 rounded font-black text-white ${roleConfig.color}`}>{userData.Role}</span>
                                    <span className="text-xs font-black text-red-400">{roleConfig.curseName}</span>
                                </div>
                                <p className="text-[10px] text-slate-400 leading-relaxed">{roleConfig.curseEffect}</p>
                                <div className="border-t border-white/5 pt-2">
                                    <div className="text-[9px] text-slate-600 uppercase tracking-widest mb-1">天賦</div>
                                    <p className="text-[10px] text-slate-300 leading-relaxed">{roleConfig.talent}</p>
                                </div>
                            </div>
                        </section>
                    )}

                    {/* Teammates */}
                    <section>
                        <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">
                            隊伍位置 <span className="text-slate-700 normal-case">({teammates.length})</span>
                        </div>
                        {teammates.length === 0 ? (
                            <div className="text-[11px] text-slate-600 text-center py-4 bg-slate-800/20 rounded-xl">
                                目前附近無隊友
                            </div>
                        ) : (
                            <div className="space-y-1.5">
                                {teammates.map(t => {
                                    const dist = getHexDist(userData.CurrentQ, userData.CurrentR, t.q, t.r);
                                    const tRole = t.data?.role || '';
                                    const tRoleConfig = ROLE_CURE_MAP[tRole];
                                    return (
                                        <div key={t.id} className="flex items-center gap-2.5 px-2.5 py-2 bg-slate-800/40 rounded-xl border border-white/5">
                                            <span className="text-base leading-none">{tRoleConfig?.avatar || '👤'}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-[11px] font-bold text-white truncate">{t.name}</div>
                                                <div className="text-[9px] text-slate-500">{tRole || '未知職業'}</div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <div className="text-[10px] font-black text-cyan-400">{dist}</div>
                                                <div className="text-[8px] text-slate-600">格</div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </section>

                    {/* Player coordinates */}
                    <section className="mt-auto pt-3 border-t border-white/5">
                        <div className="flex items-center justify-between text-[10px]">
                            <span className="text-slate-600">目前座標</span>
                            <span className="text-slate-400 font-mono">{userData.CurrentQ}, {userData.CurrentR}</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] mt-1">
                            <span className="text-slate-600">等級</span>
                            <span className="text-yellow-500 font-black">LV.{userData.Level}</span>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
