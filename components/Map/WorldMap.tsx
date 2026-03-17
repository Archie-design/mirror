import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { ChevronLeft, MapIcon, Dice5, Loader2, Minus, Plus, Footprints, Package, Store } from 'lucide-react';
import { CharacterStats, HexData } from '@/types';
import { DEFAULT_CONFIG, TERRAIN_TYPES, ROLE_CURE_MAP, ZONES } from '@/lib/constants';
import { getHexRegion, axialToPixelPos, getHexDist, pixelToAxial, getCombatMultiplier, getHexDirection, hexLineDraw } from '@/lib/utils/hex';
import HexNode from '@/components/MapEditor/HexNode';
import { GameInventoryModal } from '@/components/MapEditor/GameInventoryModal';
import { NPCShopModal } from '@/components/MapEditor/NPCShopModal';
import { CombatModal } from '@/components/MapEditor/CombatModal';
import { buyGameItem, useGameItem } from '@/app/actions/items';
import { resolveCombat } from '@/app/actions/combat';
import { donateDice } from '@/app/actions/team';

// --- Types ---
interface WorldMapProps {
    userData: CharacterStats;
    mapData: Record<string, string>;
    corridorL: number;
    corridorW: number;
    stepsRemaining: number;
    isRolling: boolean;
    onRollDice: (amount: number) => void;
    onMoveCharacter: (q: number, r: number, dist: number, zoneId?: string, newFacing?: number) => void;
    onBack: () => void;
    moveMultiplier?: number;
    onUpdateMultiplier?: (m: number) => void;
    dbEntities?: any[];
    worldState?: string;
    onEntityTrigger?: (entity: any) => void;
    initialQ: number;
    initialR: number;
    roleTrait: any;
    todayCompletedQuestIds: string[];
    onShowMessage: (msg: string, type: 'success' | 'error' | 'info') => void;
    onUpdateUserData: (data: Partial<CharacterStats>) => void;
    onUpdateSteps?: (steps: number) => void;
}

// --- Memoized Static Layer ---
const StaticMapLayer = React.memo(({ grid, className = "", style = {} }: { grid: HexData[], className?: string, style?: React.CSSProperties }) => {
    return (
        <g className={className} style={style}>
            {grid.map(hex => (
                <HexNode
                    key={hex.key}
                    hex={hex}
                    isHovered={false}
                    onHover={() => { }}
                    onClick={() => { }}
                    size={DEFAULT_CONFIG.HEX_SIZE_WORLD}
                />
            ))}
        </g>
    );
}, (prev, next) => {
    return prev.grid === next.grid && prev.className === next.className;
});
StaticMapLayer.displayName = 'StaticMapLayer';

// --- Memoized Dynamic Layer ---
const DynamicOverlayLayer = React.memo(({
    grid, userData, stepsRemaining, hoveredHexKey
}: {
    grid: HexData[],
    userData: CharacterStats,
    stepsRemaining: number,
    hoveredHexKey: string | null
}) => {
    if (stepsRemaining <= 0 && !hoveredHexKey) return null;

    return (
        <g style={{ pointerEvents: 'none' }}>
            {grid.map(hex => {
                const isHovered = hoveredHexKey === hex.key;
                const isMovable = stepsRemaining > 0 && getHexDist(userData.CurrentQ, userData.CurrentR, hex.q, hex.r) <= stepsRemaining;

                if (!isHovered && !isMovable) return null;

                return (
                    <g key={`overlay_${hex.key}`}>
                        <polygon
                            points={getHexRegion(0)[0] ? getHexPointsStr(hex.x, hex.y, DEFAULT_CONFIG.HEX_SIZE_WORLD * 1.01) : ""}
                            fill={isMovable ? "rgba(16, 185, 129, 0.4)" : "transparent"}
                            stroke={isHovered ? "rgba(255,255,255,0.8)" : "transparent"}
                            strokeWidth="2"
                        />
                    </g>
                );
            })}
        </g>
    );
});
DynamicOverlayLayer.displayName = 'DynamicOverlayLayer';

// Helper for polygon points - extracted locally to keep it pure
function getHexPointsStr(x: number, y: number, size: number) {
    const points = [];
    for (let i = 0; i < 6; i++) {
        const angle_deg = 60 * i - 30;
        const angle_rad = Math.PI / 180 * angle_deg;
        points.push(`${x + size * Math.cos(angle_rad)},${y + size * Math.sin(angle_rad)}`);
    }
    return points.join(' ');
}


export const WorldMap: React.FC<WorldMapProps> = ({
    userData, mapData, corridorL, corridorW, stepsRemaining, isRolling,
    onRollDice, onMoveCharacter, onBack, initialQ, initialR,
    roleTrait, todayCompletedQuestIds, onShowMessage,
    dbEntities = [], worldState, onEntityTrigger, moveMultiplier = 1, onUpdateMultiplier, onUpdateUserData, onUpdateSteps,
}) => {
    // Navigation & Scale — initialize camera centered on player to avoid first-render flash
    const [camX, setCamX] = useState(() => -axialToPixelPos(initialQ, initialR, DEFAULT_CONFIG.HEX_SIZE_WORLD).x);
    const [camY, setCamY] = useState(() => -axialToPixelPos(initialQ, initialR, DEFAULT_CONFIG.HEX_SIZE_WORLD).y);
    const [zoom, setZoom] = useState(1);
    // Track container dimensions reactively to avoid stale clientWidth reads during render
    const [containerSize, setContainerSize] = useState({ w: 400, h: 600 });
    const [rollAmount, setRollAmount] = useState(1);
    const [hoveredHexKey, setHoveredHexKey] = useState<string | null>(null);
    const [interceptTriggeredPos, setInterceptTriggeredPos] = useState<string | null>(null);
    const [isInventoryOpen, setIsInventoryOpen] = useState(false);
    const [isShopOpen, setIsShopOpen] = useState(false);
    const [isCombatModalOpen, setIsCombatModalOpen] = useState(false);
    const [combatTarget, setCombatTarget] = useState<any>(null);
    const [combatFlankingMultiplier, setCombatFlankingMultiplier] = useState(1.0);
    const [isProcessingItem, setIsProcessingItem] = useState(false);
    const [hoveredHexPos, setHoveredHexPos] = useState<{ q: number, r: number, x: number, y: number } | null>(null);
    const [donationTarget, setDonationTarget] = useState<any>(null);
    const [donateAmount, setDonateAmount] = useState(1);
    const [isDonating, setIsDonating] = useState(false);

    const [dismissedCombatKeys, _setDismissedCombatKeys] = useState<Set<string>>(() => {
        try {
            const data = sessionStorage.getItem('starry_dismissed');
            if (data) return new Set<string>(JSON.parse(data));
        } catch (e) { }
        return new Set<string>();
    });
    const setDismissedCombatKeys = useCallback((setter: (prev: Set<string>) => Set<string>) => {
        _setDismissedCombatKeys(prev => {
            const next = setter(prev);
            sessionStorage.setItem('starry_dismissed', JSON.stringify(Array.from(next)));
            return next;
        });
    }, []);

    // Dragging state
    const isDragging = useRef(false);
    const dragStart = useRef({ x: 0, y: 0 });
    const mapContainerRef = useRef<HTMLDivElement>(null);

    // Constants
    const { HEX_SIZE_WORLD, CENTER_SIDE, SUBZONE_SIDE } = DEFAULT_CONFIG;
    // Make the virtual canvas huge so panning works via CSS transform
    const VIRTUAL_MAP_SIZE = 6000;

    const getEntityKey = useCallback((e: any) => {
        if (!e) return '';
        if (e.id) return `db_${e.id}`;
        return e.key ?? '';
    }, []);

    // Recenter camera when player moves (initialQ/R updates from parent)
    useEffect(() => {
        const initPos = axialToPixelPos(initialQ, initialR, HEX_SIZE_WORLD);
        setCamX(-initPos.x);
        setCamY(-initPos.y);
    }, [initialQ, initialR, HEX_SIZE_WORLD]);

    // Track container size reactively for accurate HUD positioning
    useEffect(() => {
        const el = mapContainerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(entries => {
            const { width, height } = entries[0].contentRect;
            setContainerSize({ w: width, h: height });
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Full Grid Calculation (Memoized, only runs once after mapData loads)
    const fullGrid = useMemo(() => {
        const hexes: HexData[] = [];
        const hexMap = new Map<string, boolean>();
        const R_hub = CENTER_SIDE - 1;
        const S_s = SUBZONE_SIDE;

        // Culling settings 
        const RENDER_RADIUS = 20;
        const CRISP_RADIUS = 10;

        const getRenderRing = (q: number, r: number) => {
            const dist = getHexDist(initialQ, initialR, q, r);
            if (dist <= CRISP_RADIUS) return 'crisp';
            if (dist <= RENDER_RADIUS) return 'performance';
            return 'culled';
        };

        getHexRegion(R_hub).forEach(p => {
            const ring = getRenderRing(p.q, p.r);
            if (ring === 'culled') return;
            const pos = axialToPixelPos(p.q, p.r, HEX_SIZE_WORLD);
            const key = `center_0_${p.q},${p.r}`;
            const terrainId = mapData[key] || 'grass';
            hexes.push({ ...p, ...pos, type: 'center', terrainId, color: TERRAIN_TYPES[terrainId]?.color || '#1a472a', key, ring });
            hexMap.set(`${p.q},${p.r}`, true);
        });

        const sideData = [
            { start: { q: 0, r: -R_hub }, step: { q: 1, r: 0 }, out: { q: 1, r: -1 } },
            { start: { q: R_hub, r: -R_hub }, step: { q: 0, r: 1 }, out: { q: 1, r: 0 } },
            { start: { q: R_hub, r: 0 }, step: { q: -1, r: 1 }, out: { q: 0, r: 1 } },
            { start: { q: 0, r: R_hub }, step: { q: -1, r: 0 }, out: { q: -1, r: 1 } },
            { start: { q: -R_hub, r: R_hub }, step: { q: 0, r: -1 }, out: { q: -1, r: 0 } },
            { start: { q: -R_hub, r: 0 }, step: { q: 1, r: -1 }, out: { q: 0, r: -1 } },
        ];

        ZONES.forEach((zone, zIdx) => {
            const side = sideData[zIdx];
            const centerIdx = Math.floor(CENTER_SIDE / 2);
            const halfW = Math.floor(corridorW / 2);
            for (let i = -halfW; i <= halfW; i++) {
                const idx = centerIdx + i;
                const startQ = side.start.q + side.step.q * idx;
                const startR = side.start.r + side.step.r * idx;
                for (let l = 1; l <= corridorL; l++) {
                    const q = startQ + side.out.q * l;
                    const r = startR + side.out.r * l;
                    const ring = getRenderRing(q, r);
                    if (ring === 'culled') continue;

                    const key = `${q},${r}`;
                    if (!hexMap.has(key)) {
                        const pos = axialToPixelPos(q, r, HEX_SIZE_WORLD);
                        hexes.push({ q, r, ...pos, type: 'corridor', color: '#1e293b', zoneId: zone.id, key: `corridor_${zone.id}_${key}`, ring });
                        hexMap.set(key, true);
                    }
                }
            }
            const hubExitQ = side.start.q + side.step.q * centerIdx + side.out.q * corridorL;
            const hubExitR = side.start.r + side.step.r * centerIdx + side.out.r * corridorL;
            const zCQ = hubExitQ + side.out.q * S_s;
            const zCR = hubExitR + side.out.r * S_s;
            const subCenters = [
                { q: 0, r: 0 }, { q: 2 * S_s - 1, r: -(S_s - 1) }, { q: S_s, r: S_s - 1 },
                { q: -(S_s - 1), r: 2 * S_s - 1 }, { q: -(2 * S_s - 1), r: S_s - 1 },
                { q: -S_s, r: -(S_s - 1) }, { q: S_s - 1, r: -(2 * S_s - 1) }
            ];
            subCenters.forEach((sc, sIdx) => {
                const cq = zCQ + sc.q;
                const cr = zCR + sc.r;
                getHexRegion(S_s - 1).forEach(p => {
                    const q = cq + p.q;
                    const r = cr + p.r;
                    const ring = getRenderRing(q, r);
                    if (ring === 'culled') return;

                    const key = `${q},${r}`;
                    if (!hexMap.has(key)) {
                        const dataKey = `${zone.id}_${sIdx}_${p.q},${p.r}`;
                        const terrainId = mapData[dataKey];
                        const pos = axialToPixelPos(q, r, HEX_SIZE_WORLD);
                        hexes.push({
                            q, r, ...pos, type: 'subzone',
                            color: terrainId ? (TERRAIN_TYPES[terrainId]?.color || zone.color) : zone.color,
                            terrainId, zoneId: zone.id, subIdx: sIdx, key: dataKey, ring
                        });
                        hexMap.set(key, true);
                    }
                });
            });
        });

        return hexes;
    }, [mapData, corridorL, corridorW, HEX_SIZE_WORLD, initialQ, initialR]);

    const perfLayerGrid = useMemo(() => fullGrid.filter(h => h.ring === 'performance'), [fullGrid]);
    const crispLayerGrid = useMemo(() => fullGrid.filter(h => h.ring === 'crisp'), [fullGrid]);

    // Check Entity Collision after movement
    useEffect(() => {
        if (onEntityTrigger && !isCombatModalOpen) {
            const allEntities = dbEntities.filter(e => e.is_active !== false && (e.type === 'monster' || !e.owner_id || e.owner_id === userData.UserID));

            // 1. Proactive Interception: Check for monsters in adjacent hexes (dist === 1)
            const currentPosKey = `${userData.CurrentQ},${userData.CurrentR}`;
            if (interceptTriggeredPos !== currentPosKey) {
                const neighborMonster = allEntities.find(e =>
                    e.type === 'monster' &&
                    getHexDist(userData.CurrentQ, userData.CurrentR, e.q, e.r) === 1 &&
                    !dismissedCombatKeys.has(getEntityKey(e))
                );

                if (neighborMonster) {
                    const targetFacing = neighborMonster.data?.facing || 0;
                    const flanking = getCombatMultiplier({ q: userData.CurrentQ, r: userData.CurrentR }, { q: neighborMonster.q, r: neighborMonster.r }, targetFacing);
                    setCombatFlankingMultiplier(flanking);
                    setCombatTarget(neighborMonster);
                    setInterceptTriggeredPos(currentPosKey);
                    setIsCombatModalOpen(true);
                    return;
                }
            }

            // 2. Exact Match: Only for non-monster entities (like chests/encounters) when steps are finished
            if (stepsRemaining === 0) {
                const exactMatch = allEntities.find(e => e.q === userData.CurrentQ && e.r === userData.CurrentR && e.type !== 'monster');
                if (exactMatch) {
                    if (exactMatch.type === 'portal') {
                        if (!todayCompletedQuestIds || todayCompletedQuestIds.length === 0) {
                            onShowMessage('受五毒業力牽引，歸心陣無法啟動。請先完成今日定課。', 'error');
                            return;
                        }
                    }
                    onEntityTrigger(exactMatch);
                }
            }
        }
    }, [userData.CurrentQ, userData.CurrentR, stepsRemaining, isCombatModalOpen, dbEntities, onEntityTrigger, dismissedCombatKeys]);


    // --- Event Delegation ---
    const getCurrentPointerHex = useCallback((clientX: number, clientY: number) => {
        if (!mapContainerRef.current) return null;
        const rect = mapContainerRef.current.getBoundingClientRect();
        // Container center
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        // Calculate mouse position relative to center of screen
        const mouseX = clientX - rect.left - centerX;
        const mouseY = clientY - rect.top - centerY;

        // Remove the CSS transform (camX, camY) and scale (zoom) to get pure SVG coordinates
        // SVG origin is centered in the VIRTUAL_MAP_SIZE container
        const svgX = (mouseX / zoom) - camX;
        const svgY = (mouseY / zoom) - camY;

        // Convert to axial
        const { q, r } = pixelToAxial(svgX, svgY, HEX_SIZE_WORLD);
        return { q, r };
    }, [camX, camY, zoom, HEX_SIZE_WORLD]);

    const handlePointerMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        if (isDragging.current) {
            const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
            const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
            const dx = clientX - dragStart.current.x;
            const dy = clientY - dragStart.current.y;
            setCamX(prev => prev + dx / zoom);
            setCamY(prev => prev + dy / zoom);
            dragStart.current = { x: clientX, y: clientY };
            if (hoveredHexKey) setHoveredHexKey(null);
            return;
        }

        // Hover logic (desktop only)
        if ('clientX' in e && !isDragging.current) {
            const hex = getCurrentPointerHex(e.clientX, e.clientY);
            if (hex) {
                // Find if this hex is in the grid computationally to prevent hovering void
                const target = fullGrid.find(h => h.q === hex.q && h.r === hex.r);
                setHoveredHexKey(target ? target.key : null);
                if (target) {
                    setHoveredHexPos({ q: hex.q, r: hex.r, x: e.clientX, y: e.clientY });
                } else {
                    setHoveredHexPos(null);
                }
            } else {
                setHoveredHexKey(null);
                setHoveredHexPos(null);
            }
        }
    }, [getCurrentPointerHex, zoom, hoveredHexKey, fullGrid]);

    const handlePointerDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        isDragging.current = true;
        dragStart.current = {
            x: 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX,
            y: 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY
        };
    }, []);

    const handlePointerUp = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        // If it was a click without dragging much, trigger Click logic
        if (isDragging.current) {
            const clientX = 'changedTouches' in e ? e.changedTouches[0].clientX : (e as React.MouseEvent).clientX;
            const clientY = 'changedTouches' in e ? e.changedTouches[0].clientY : (e as React.MouseEvent).clientY;
            const dx = Math.abs(clientX - dragStart.current.x);
            const dy = Math.abs(clientY - dragStart.current.y);

            if (dx < 5 && dy < 5) {
                // Was a click
                const hex = getCurrentPointerHex(clientX, clientY);
                if (hex) {
                    // Check for targetable adjacent entities first
                    const allEntities = [...dbEntities];

                    // Check for adjacent teammate → open donation
                    const teammateEntity = allEntities.find(e => e.q === hex.q && e.r === hex.r && e.type === 'teammate');
                    if (teammateEntity) {
                        const dist = getHexDist(userData.CurrentQ, userData.CurrentR, hex.q, hex.r);
                        if (dist <= 2) {
                            setDonationTarget(teammateEntity);
                            setDonateAmount(1);
                            return;
                        }
                    }

                    const targetEntity = allEntities.find(e => e.q === hex.q && e.r === hex.r && e.type === 'monster');
                    if (targetEntity) {
                        const dist = getHexDist(userData.CurrentQ, userData.CurrentR, hex.q, hex.r);
                        if (dist === 1) {
                            // Adjacent monster! Calculate Flanking
                            const targetFacing = targetEntity.data?.facing || 0; // default front is 0
                            const flanking = getCombatMultiplier({ q: userData.CurrentQ, r: userData.CurrentR }, hex, targetFacing);
                            setCombatFlankingMultiplier(flanking);
                            setCombatTarget(targetEntity);
                            setIsCombatModalOpen(true);
                            return;
                        }
                    }

                    if (stepsRemaining > 0) {
                        let targetQ = hex.q;
                        let targetR = hex.r;

                        // 孫悟空 (嗔) Debuff: 暴躁狀態。移動路徑發生隨機偏移。
                        if (roleTrait?.name === '孫悟空' && roleTrait?.isCursed) {
                            const drift = [
                                { q: 1, r: -1 }, { q: 1, r: 0 }, { q: 0, r: 1 },
                                { q: -1, r: 1 }, { q: -1, r: 0 }, { q: 0, r: -1 }
                            ];
                            const rand = drift[Math.floor(Math.random() * drift.length)];
                            targetQ += rand.q;
                            targetR += rand.r;
                        }

                        // Ensure target is still within map bounds
                        const targetHexData = fullGrid.find(h => h.q === targetQ && h.r === targetR);
                        if (!targetHexData) return;

                        const dist = getHexDist(userData.CurrentQ, userData.CurrentR, targetQ, targetR);
                        if (dist === 0) return;

                        // 豬八戒 (貪) Debuff: 懶惰狀態。移動消耗加倍。
                        let finalCost = dist;
                        if (roleTrait?.name === '豬八戒' && roleTrait?.isCursed) {
                            finalCost = Math.ceil(dist * 1.5);
                        }

                        if (finalCost <= stepsRemaining) {
                            // Determine if path intercepts any monster
                            let actualTargetQ = targetQ;
                            let actualTargetR = targetR;
                            let actualCost = finalCost;

                            const path = hexLineDraw({ q: userData.CurrentQ, r: userData.CurrentR }, { q: targetQ, r: targetR });
                            const allEntitiesForCollision = [...dbEntities.filter(e => e.is_active !== false && (e.type === 'monster' || !e.owner_id || e.owner_id === userData.UserID))];

                            for (let i = 1; i < path.length; i++) {
                                const step = path[i];
                                const monsterNearby = allEntitiesForCollision.find(e => e.type === 'monster' && getHexDist(step.q, step.r, e.q, e.r) <= 1);
                                if (monsterNearby) {
                                    // Intercept! Stop at this step.
                                    actualTargetQ = step.q;
                                    actualTargetR = step.r;
                                    const stepDist = getHexDist(userData.CurrentQ, userData.CurrentR, actualTargetQ, actualTargetR);
                                    actualCost = roleTrait?.name === '豬八戒' && roleTrait?.isCursed ? Math.ceil(stepDist * 1.5) : stepDist;
                                    break;
                                }
                            }

                            // Determine facing direction based on movement
                            const newFacing = getHexDirection(userData.CurrentQ, userData.CurrentR, actualTargetQ, actualTargetR);

                            const finalHexData = fullGrid.find(h => h.q === actualTargetQ && h.r === actualTargetR) || targetHexData;
                            onMoveCharacter(actualTargetQ, actualTargetR, actualCost, finalHexData.zoneId, newFacing);

                            // Optimistically update facing locally and to parent
                            onUpdateUserData({ Facing: newFacing });

                            if (actualTargetQ !== targetQ || actualTargetR !== targetR) {
                                onShowMessage("強大的妖氣逼近！你被迫停下了腳步！", "error");
                            } else if (targetQ !== hex.q || targetR !== hex.r) {
                                onShowMessage("緊箍咒發作！暴躁的心讓你偏離了原本的路線！", "error");
                            }
                        } else {
                            onShowMessage(`能量不足！此步需要 ${finalCost} 點 (受天賦/地形影響)，目前僅餘 ${stepsRemaining}。`, 'error');
                        }
                    }
                }
            }
        }
        isDragging.current = false;
    }, [getCurrentPointerHex, stepsRemaining, userData, onMoveCharacter, roleTrait, fullGrid, onShowMessage, dbEntities]);

    const handleWheel = useCallback((e: React.WheelEvent) => {
        setZoom(prev => Math.min(Math.max(0.3, prev - Math.sign(e.deltaY) * 0.1), 3));
    }, []);

    // Player Pixel
    const playerPixel = useMemo(() => {
        return axialToPixelPos(userData.CurrentQ, userData.CurrentR, HEX_SIZE_WORLD);
    }, [userData.CurrentQ, userData.CurrentR, HEX_SIZE_WORLD]);

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col overflow-hidden relative animate-in fade-in">
            {/* Header */}
            <header className="p-6 bg-slate-900 border-b border-white/10 flex justify-between items-center z-20 shadow-2xl absolute top-0 left-0 right-0">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-emerald-600 rounded-2xl text-white shadow-lg border border-emerald-400/20"><MapIcon size={20} /></div>
                    <div className="text-left text-white font-black text-xl tracking-widest uppercase">心蓮六瓣 <span className="opacity-50 text-xs">// World Map</span></div>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setIsShopOpen(true)} className="flex items-center justify-center p-3 bg-orange-600/20 text-orange-400 hover:bg-orange-600 hover:text-white rounded-2xl transition-all border border-orange-500/20 active:scale-95 shadow-lg relative">
                        <Store size={20} />
                    </button>
                    <button onClick={() => setIsInventoryOpen(true)} className="flex items-center justify-center p-3 bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600 hover:text-white rounded-2xl transition-all border border-indigo-500/20 active:scale-95 shadow-lg relative">
                        <Package size={20} />
                        {userData.GameInventory && userData.GameInventory.length > 0 && (
                            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-slate-900 animate-pulse"></span>
                        )}
                    </button>
                    <button onClick={onBack} className="flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white font-black rounded-2xl transition-all border border-white/10 shadow-xl active:scale-95"><ChevronLeft size={16} /> 返回定課</button>
                </div>
            </header>

            {/* Main Map Container */}
            <main
                className="flex-1 bg-[#040407] overflow-hidden relative cursor-grab active:cursor-grabbing text-neutral-100 touch-none"
                ref={mapContainerRef}
                onMouseDown={handlePointerDown}
                onMouseMove={handlePointerMove}
                onMouseUp={handlePointerUp}
                onMouseLeave={() => { isDragging.current = false; setHoveredHexKey(null); }}
                onTouchStart={handlePointerDown}
                onTouchMove={handlePointerMove}
                onTouchEnd={handlePointerUp}
                onWheel={handleWheel}
            >
                {/* Hardware Accelerated Canvas Container */}
                <div
                    className="absolute top-1/2 left-1/2"
                    style={{
                        width: `${VIRTUAL_MAP_SIZE}px`,
                        height: `${VIRTUAL_MAP_SIZE}px`,
                        marginLeft: `${-VIRTUAL_MAP_SIZE / 2}px`,
                        marginTop: `${-VIRTUAL_MAP_SIZE / 2}px`,
                        transform: `translate(${camX * zoom}px, ${camY * zoom}px) scale(${zoom})`,
                        transformOrigin: '50% 50%',
                    }}
                >
                    <svg
                        className="w-full h-full select-none"
                        viewBox={`${-VIRTUAL_MAP_SIZE / 2} ${-VIRTUAL_MAP_SIZE / 2} ${VIRTUAL_MAP_SIZE} ${VIRTUAL_MAP_SIZE}`}
                    >
                        {/* 1. Static Layout Grid (Outer Performance Ring that is blurry while moving) */}
                        <g style={{ willChange: 'transform' }}>
                            <StaticMapLayer grid={perfLayerGrid} />
                        </g>

                        {/* 2. Static Layout Grid (Inner Crisp Ring) */}
                        <StaticMapLayer grid={crispLayerGrid} />

                        {/* 2. Dynamic Overlay (Hover, Move Range) */}
                        <DynamicOverlayLayer
                            grid={fullGrid}
                            userData={userData}
                            stepsRemaining={stepsRemaining}
                            hoveredHexKey={hoveredHexKey}
                        />

                        {/* 2.5 Entities Layer (Monsters, Chests, Encounters) */}
                        <g style={{ pointerEvents: 'none' }}>
                            {dbEntities.filter(e => e.type === 'monster' || !e.owner_id || e.owner_id === userData.UserID).map((e) => {
                                const pos = axialToPixelPos(e.q, e.r, DEFAULT_CONFIG.HEX_SIZE_WORLD);
                                if (e.type === 'personal') {
                                    return (
                                        <g key={`db_ent_${e.id}`} transform={`translate(${pos.x}, ${pos.y})`}>
                                            <circle r={12} fill="indigo" className="animate-ping opacity-50" />
                                            <circle r={8} fill="magenta" />
                                            <text y={4} textAnchor="middle" fontSize={14} className="drop-shadow-lg">{e.icon}</text>
                                        </g>
                                    );
                                }
                                return (
                                    <text key={`db_ent_${e.id}`} x={pos.x} y={pos.y + 4} textAnchor="middle" fontSize={12} className="drop-shadow-md">
                                        {e.icon}
                                    </text>
                                );
                            })}
                            {/* Teammates Layer */}
                            {dbEntities.filter(e => e.type === 'teammate').map((e) => {
                                const pos = axialToPixelPos(e.q, e.r, DEFAULT_CONFIG.HEX_SIZE_WORLD);
                                const dist = getHexDist(userData.CurrentQ, userData.CurrentR, e.q, e.r);
                                return (
                                    <g key={`tm_${e.id}`} transform={`translate(${pos.x}, ${pos.y})`} style={{ cursor: dist <= 2 ? 'pointer' : 'default', pointerEvents: 'auto' }}>
                                        <circle r={10} fill="rgba(96, 165, 250, 0.3)" className="animate-ping" />
                                        <circle r={7} fill="rgba(59, 130, 246, 0.8)" stroke="white" strokeWidth={1} />
                                        <text y={4} textAnchor="middle" fontSize={11} className="drop-shadow-lg">{e.icon}</text>
                                        <text y={18} textAnchor="middle" fontSize={7} fill="#93c5fd" fontWeight="bold" className="drop-shadow">{e.name}</text>
                                    </g>
                                );
                            })}
                        </g>

                        {/* 3. Player Character — avatar & name only; HUD is HTML overlay below */}
                        <g transform={`translate(${playerPixel.x}, ${playerPixel.y})`}>
                            {/* SVG text emoji: stable on all mobile browsers, no foreignObject needed */}
                            <text y={-8} textAnchor="middle" fontSize={28} dominantBaseline="auto" style={{ userSelect: 'none' }}>
                                {ROLE_CURE_MAP[userData.Role]?.avatar || '👤'}
                            </text>
                            <text y={22} textAnchor="middle" fontSize={10} fontWeight="900" fill="white" style={{ textShadow: '0 2px 4px black, 0 -1px 2px black' }}>{userData.Name}</text>
                        </g>
                    </svg>
                </div>

                {/* Player Dice HUD — HTML overlay, avoids SVG foreignObject iOS Safari bug */}
                {(() => {
                    const cw = containerSize.w;
                    const ch = containerSize.h;
                    const hudX = cw / 2 + (playerPixel.x + camX) * zoom;
                    const hudY = ch / 2 + (playerPixel.y + camY) * zoom;
                    return (
                        <div
                            className="absolute pointer-events-none z-20 flex flex-col items-center"
                            style={{ left: hudX, top: hudY, transform: 'translateX(-50%)' }}
                        >
                            <div className={`mt-6 p-3 rounded-[2rem] bg-slate-900/80 border ${moveMultiplier && moveMultiplier > 1 ? 'border-yellow-400 shadow-[0_0_30px_rgba(250,204,21,0.5)] animate-pulse' : 'border-white/10 shadow-2xl'} backdrop-blur-xl flex flex-col gap-3 items-center pointer-events-auto relative`} style={{ width: 200 }}>
                                {moveMultiplier && moveMultiplier > 1 && (
                                    <div className="absolute -top-3 bg-yellow-400 text-black px-3 py-0.5 rounded-full text-xs font-black tracking-widest flex items-center gap-1 shadow-lg shadow-yellow-500/50">
                                        ⚡ 衝刺 x{moveMultiplier}
                                    </div>
                                )}
                                {/* AP display */}
                                <div className="w-full flex flex-col items-center gap-1">
                                    <div className="flex items-center justify-between w-full px-1">
                                        <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">移動 AP</span>
                                        <span className={`text-[11px] font-black tabular-nums ${stepsRemaining > 0 ? 'text-cyan-400' : 'text-slate-600'}`}>{stepsRemaining}</span>
                                    </div>
                                    <div className="flex gap-0.5 w-full">
                                        {Array.from({ length: Math.min(10, Math.max(stepsRemaining, 1)) }).map((_, i) => (
                                            <div key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-200 ${i < stepsRemaining ? 'bg-cyan-400 shadow-[0_0_4px_rgba(34,211,238,0.7)]' : 'bg-slate-800'}`} />
                                        ))}
                                        {stepsRemaining > 10 && <div className="h-1.5 flex-1 rounded-full bg-cyan-300 opacity-60" />}
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 mt-1">
                                    <button onClick={() => setRollAmount(p => Math.max(1, p - 1))} className="w-8 h-8 rounded-full bg-slate-950 border border-white/5 text-slate-400 flex items-center justify-center font-black active:scale-90 hover:bg-slate-800 hover:text-white transition-all"><Minus size={14} /></button>
                                    <div className="font-black text-emerald-400 tracking-widest text-lg">x {rollAmount}</div>
                                    <button onClick={() => setRollAmount(p => Math.min(userData.EnergyDice, p + 1))} className="w-8 h-8 rounded-full bg-slate-950 border border-white/5 text-slate-400 flex items-center justify-center font-black active:scale-90 hover:bg-slate-800 hover:text-white transition-all"><Plus size={14} /></button>
                                </div>
                                <button
                                    onClick={() => onRollDice(rollAmount)}
                                    disabled={isRolling || stepsRemaining > 0 || userData.EnergyDice < rollAmount}
                                    className={`w-full py-2.5 rounded-2xl text-[10px] uppercase font-black flex items-center justify-center gap-2 transition-all ${(isRolling || stepsRemaining > 0 || userData.EnergyDice < rollAmount) ? 'bg-slate-950 border border-white/5 text-slate-600' : 'bg-gradient-to-tr from-emerald-600 to-teal-400 text-white shadow-lg shadow-emerald-500/20 active:scale-95'}`}
                                >
                                    {isRolling ? <Loader2 size={12} className="animate-spin" /> : <Dice5 size={12} />} 注入能量轉輪
                                </button>
                                {(userData.GoldenDice || 0) > 0 && (
                                    <button
                                        onClick={() => onRollDice(-1)}
                                        disabled={isRolling || stepsRemaining > 0}
                                        className={`w-full py-1.5 rounded-xl text-[9px] uppercase font-black flex items-center justify-center gap-1 transition-all ${(isRolling || stepsRemaining > 0) ? 'bg-slate-950 border border-yellow-700/50 text-slate-600' : 'bg-gradient-to-r from-yellow-600 to-amber-500 text-black shadow-lg shadow-yellow-500/30 active:scale-95'}`}
                                    >
                                        🌟 使用萬能奇蹟骰 ({userData.GoldenDice})
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })()}

                {/* HUD Info */}
                {(() => {
                    const roleConfig = ROLE_CURE_MAP[userData.Role] || ROLE_CURE_MAP['孫悟空'];
                    const maxHP = roleConfig.baseHP + (userData.Physique * roleConfig.hpScale);
                    const currentHP = userData.HP ?? maxHP;
                    const atk = (userData.Level * 10) + (userData.Physique * 2);
                    const def = roleConfig.baseDEF + userData.Physique;
                    const hpPct = Math.max(0, Math.min(1, currentHP / maxHP));
                    const hpColor = hpPct > 0.6 ? 'text-emerald-400' : hpPct > 0.3 ? 'text-yellow-400' : 'text-red-400';
                    return (
                        <div className="absolute bottom-6 left-6 bg-slate-900/80 p-4 rounded-3xl border border-white/10 backdrop-blur-xl shadow-2xl select-none pointer-events-none z-30 space-y-3 min-w-[160px]">
                            {/* HP bar */}
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-[9px] font-black uppercase text-slate-500 tracking-widest">❤️ 血量</span>
                                    <span className={`text-xs font-black ${hpColor}`}>{currentHP} / {maxHP}</span>
                                </div>
                                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full transition-all ${hpPct > 0.6 ? 'bg-emerald-500' : hpPct > 0.3 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${hpPct * 100}%` }} />
                                </div>
                            </div>
                            {/* ATK / DEF */}
                            <div className="flex items-center gap-4">
                                <div>
                                    <div className="text-[9px] font-black uppercase text-slate-500 tracking-widest mb-0.5">⚔️ 攻擊</div>
                                    <div className="text-sm font-black text-orange-400">{atk}</div>
                                </div>
                                <div className="h-6 w-px bg-white/10" />
                                <div>
                                    <div className="text-[9px] font-black uppercase text-slate-500 tracking-widest mb-0.5">🛡️ 防禦</div>
                                    <div className="text-sm font-black text-sky-400">{def}</div>
                                </div>
                                <div className="h-6 w-px bg-white/10" />
                                <div>
                                    <div className="text-[9px] font-black uppercase text-slate-500 tracking-widest mb-0.5"><Dice5 size={9} className="inline" /> 骰子</div>
                                    <div className="text-sm font-black text-amber-400">{userData.EnergyDice}</div>
                                </div>
                            </div>
                            {/* Coordinates */}
                            <div className="flex items-center gap-1.5 text-[9px] text-slate-600 font-mono">
                                <Footprints size={10} /> {userData.CurrentQ}, {userData.CurrentR}
                            </div>
                        </div>
                    );
                })()}
            </main>

            {/* Hover Tooltip for Entities */}
            {hoveredHexPos && (() => {
                const targetEntity = dbEntities.find(e => e.q === hoveredHexPos.q && e.r === hoveredHexPos.r);
                if (!targetEntity) return null;

                const isObscured = roleTrait?.name === '沙悟淨' && roleTrait?.isCursed;
                const monsterLevel = targetEntity.data?.level || 1;
                const monsterHP = targetEntity.data?.hp || 100;
                const monsterATK = monsterLevel * 12;

                return (
                    <div
                        className="fixed z-50 pointer-events-none bg-slate-900/95 border border-slate-700 p-4 rounded-2xl shadow-2xl backdrop-blur-md min-w-[200px]"
                        style={{
                            left: hoveredHexPos.x + 20,
                            top: hoveredHexPos.y + 20,
                            // Ensure tooltip stays on screen
                            transform: `translate(${hoveredHexPos.x > window.innerWidth - 220 ? '-120%' : '0'}, ${hoveredHexPos.y > window.innerHeight - 150 ? '-120%' : '0'})`
                        }}
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-2xl drop-shadow-md">{targetEntity.icon}</span>
                            <div className="font-black text-white">{targetEntity.name}</div>
                        </div>
                        {targetEntity.type === 'monster' ? (
                            <div className="space-y-1 mt-2 border-t border-white/10 pt-2">
                                {isObscured ? (
                                    <div className="text-slate-400 text-xs font-bold py-2 flex gap-2 items-center">
                                        ⚠️ 戰爭迷霧：數值未知
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex justify-between text-xs font-bold">
                                            <span className="text-slate-500">等級</span>
                                            <span className="text-white">Lv. {monsterLevel}</span>
                                        </div>
                                        <div className="flex justify-between text-xs font-bold">
                                            <span className="text-slate-500">血量</span>
                                            <span className="text-red-400">{monsterHP}</span>
                                        </div>
                                        <div className="flex justify-between text-xs font-bold">
                                            <span className="text-slate-500">攻擊力</span>
                                            <span className="text-orange-400">{monsterATK}</span>
                                        </div>
                                    </>
                                )}
                            </div>
                        ) : (
                            <div className="text-slate-400 text-xs font-bold py-1">點擊以互動</div>
                        )}
                    </div>
                );
            })()}

            <CombatModal
                isOpen={isCombatModalOpen}
                onClose={() => {
                    if (combatTarget) {
                        setDismissedCombatKeys(prev => new Set(prev).add(getEntityKey(combatTarget)));
                    }
                    setIsCombatModalOpen(false);
                }}
                player={userData}
                targetEntity={combatTarget}
                flankingMultiplier={combatFlankingMultiplier}
                remainingAP={Math.max(1, stepsRemaining)}
                isObscured={roleTrait?.name === '沙悟淨' && roleTrait?.isCursed}
                isProcessing={isProcessingItem}
                onAttack={async () => {
                    if (isProcessingItem || !combatTarget) return;
                    setIsProcessingItem(true);
                    try {
                        const res = await resolveCombat({
                            attackerId: userData.UserID,
                            targetId: combatTarget.id ? String(combatTarget.id) : undefined,
                            monsterData: combatTarget.data || { level: 1, hp: 100 },
                            flankingMultiplier: combatFlankingMultiplier,
                            remainingAP: Math.max(1, stepsRemaining)
                        });

                        if (res.success) {
                            onShowMessage(res.message, res.isVictory ? 'success' : 'info');

                            if (res.isVictory && combatTarget.key) {
                                setDismissedCombatKeys(prev => new Set(prev).add(getEntityKey(combatTarget)));
                            }

                            // Close modal BEFORE parent callbacks to avoid stale-state re-render race
                            setIsCombatModalOpen(false);
                            if (onUpdateSteps) onUpdateSteps(0);

                            // Now safe to call parent — local state is already queued
                            onUpdateUserData({
                                HP: res.newHP,
                                ...(res.isVictory ? {
                                    GameGold: (userData.GameGold || 0) + (res.coinReward || 0),
                                    EnergyDice: (userData.EnergyDice || 0) + (res.diceReward || 0),
                                    GoldenDice: (userData.GoldenDice || 0) + (res.goldenDiceReward || 0),
                                } : {}),
                                ...(res.isVictory && combatTarget.id ? { removeEntityId: combatTarget.id } : {})
                            } as any);
                            if (res.isVictory && onEntityTrigger) {
                                onEntityTrigger(combatTarget);
                            }
                        }
                    } catch (e: any) {
                        onShowMessage(e.message, 'error');
                    } finally {
                        setIsProcessingItem(false);
                    }
                }}
            />

            {/* Game Inventory Modal layer */}
            <GameInventoryModal
                isOpen={isInventoryOpen}
                onClose={() => setIsInventoryOpen(false)}
                userData={userData}
                onUseItem={async (itemId) => {
                    if (isProcessingItem) return;
                    setIsProcessingItem(true);
                    try {
                        const res = await useGameItem(userData.UserID, itemId);
                        if (res.success) {
                            onShowMessage(res.message, 'success');
                            // Local optimistic update for UI snappiness
                            const newInv = (userData.GameInventory || []).map(i => i.id === itemId ? { ...i, count: i.count - 1 } : i).filter(i => i.count > 0);
                            onUpdateUserData({ GameInventory: newInv });

                            // Apply specific item effects to front-end states
                            if (itemId === 'i7') {   // 神行甲馬
                                if (onUpdateMultiplier) onUpdateMultiplier(2);
                            }
                            // Close inventory automatically for convenience
                            setIsInventoryOpen(false);

                        } else {
                            onShowMessage(res.message, 'error');
                        }
                    } catch (err: any) {
                        onShowMessage(err.message, 'error');
                    } finally {
                        setIsProcessingItem(false);
                    }
                }}
            />

            {/* NPC Shop Modal layer */}
            <NPCShopModal
                isOpen={isShopOpen}
                onClose={() => setIsShopOpen(false)}
                userData={userData}
                onBuyItem={async (itemId, price) => {
                    if (isProcessingItem) return;
                    setIsProcessingItem(true);
                    try {
                        const res = await buyGameItem(userData.UserID, itemId, price);
                        if (res.success) {
                            onShowMessage(res.message, 'success');
                            const currentInv = userData.GameInventory || [];
                            const exist = currentInv.find(i => i.id === itemId);
                            const newInv = exist ? currentInv.map(i => i.id === itemId ? { ...i, count: i.count + 1 } : i) : [...currentInv, { id: itemId, count: 1 }];
                            onUpdateUserData({ GameGold: (userData.GameGold || 0) - price, GameInventory: newInv });
                        } else {
                            onShowMessage(res.message, 'error');
                        }
                    } catch (err: any) {
                        onShowMessage(err.message, 'error');
                    } finally {
                        setIsProcessingItem(false);
                    }
                }}
            />

            {/* Teammate Donation Modal */}
            {donationTarget && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setDonationTarget(null)}>
                    <div className="bg-slate-900 border border-blue-500/30 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl shadow-blue-500/10" onClick={e => e.stopPropagation()}>
                        <div className="text-center mb-4">
                            <div className="text-3xl mb-2">{donationTarget.icon}</div>
                            <div className="text-lg font-bold text-white">{donationTarget.name}</div>
                            <div className="text-xs text-slate-400">Lv.{donationTarget.data?.level || '?'} · {donationTarget.data?.role || '未知'}</div>
                        </div>
                        <div className="text-center text-sm text-slate-300 mb-4">贈送能源骰子給這位夥伴？</div>
                        <div className="flex items-center justify-center gap-3 mb-4">
                            <button onClick={() => setDonateAmount(p => Math.max(1, p - 1))} className="w-8 h-8 rounded-full bg-slate-800 border border-white/10 text-white flex items-center justify-center"><Minus size={14} /></button>
                            <div className="text-2xl font-black text-blue-400">{donateAmount}</div>
                            <button onClick={() => setDonateAmount(p => Math.min(userData.EnergyDice || 0, p + 1))} className="w-8 h-8 rounded-full bg-slate-800 border border-white/10 text-white flex items-center justify-center"><Plus size={14} /></button>
                        </div>
                        <div className="text-xs text-center text-slate-500 mb-4">你目前有 {userData.EnergyDice || 0} 個能源骰子</div>
                        <div className="flex gap-2">
                            <button onClick={() => setDonationTarget(null)} className="flex-1 py-2.5 rounded-xl bg-slate-800 border border-white/5 text-slate-400 text-sm font-bold">取消</button>
                            <button
                                disabled={isDonating || donateAmount <= 0 || (userData.EnergyDice || 0) < donateAmount}
                                onClick={async () => {
                                    setIsDonating(true);
                                    try {
                                        const res = await donateDice(userData.UserID, donationTarget.data.userId, donateAmount);
                                        onShowMessage(res.message, 'success');
                                        onUpdateUserData({ EnergyDice: (userData.EnergyDice || 0) - donateAmount });
                                        setDonationTarget(null);
                                    } catch (err: any) {
                                        onShowMessage(err.message || '捐贈失敗', 'error');
                                    } finally {
                                        setIsDonating(false);
                                    }
                                }}
                                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-sm font-bold disabled:opacity-40 active:scale-95 transition-all"
                            >
                                {isDonating ? '處理中...' : `贈送 ${donateAmount} 🎲`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
