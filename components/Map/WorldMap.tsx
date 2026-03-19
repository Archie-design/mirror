import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { ChevronLeft, MapIcon, Dice5, Loader2, Minus, Plus, Footprints, Package, Store, LocateFixed, Globe } from 'lucide-react';
import { CharacterStats, HexData } from '@/types';
import { DEFAULT_CONFIG, TERRAIN_TYPES, ROLE_CURE_MAP, ZONES } from '@/lib/constants';
import { getHexRegion, axialToPixelPos, getHexDist, pixelToAxial, getCombatMultiplier, getHexDirection, hexLineDraw } from '@/lib/utils/hex';
import HexNode from '@/components/MapEditor/HexNode';
import { GameInventoryModal } from '@/components/MapEditor/GameInventoryModal';
import { WorldOverview } from '@/components/Map/WorldOverview';
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
    const [isOverviewOpen, setIsOverviewOpen] = useState(false);
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
    const [plannedPath, setPlannedPath] = useState<{q: number, r: number}[]>([]);
    const [isPlanningMode, setIsPlanningMode] = useState(false);
    const [isStatsExpanded, setIsStatsExpanded] = useState(false);

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
    const hasDragged = useRef(false); // true only after movement exceeds tap threshold
    const dragStart = useRef({ x: 0, y: 0 });
    const tapOrigin = useRef({ x: 0, y: 0 }); // initial touch position, never updated
    const lastTouchTime = useRef(0); // suppress synthetic mouse events after touch
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const hudRef = useRef<HTMLDivElement>(null); // dice HUD ref — events from inside are ignored by map
    const statsHudRef = useRef<HTMLDivElement>(null); // stats HUD ref — tap-to-expand on mobile
    // Pinch-to-zoom state
    const isPinching = useRef(false);
    const pinchStartDist = useRef(0);
    const pinchStartZoom = useRef(1);

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

    // Reset planning state when AP runs out
    useEffect(() => {
        if (stepsRemaining === 0) {
            setPlannedPath([]);
            setIsPlanningMode(false);
        }
    }, [stepsRemaining]);

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
        // Two-finger pinch-to-zoom
        if ('touches' in e && e.touches.length === 2) {
            const t = e.touches;
            const dist = Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
            if (!isPinching.current) {
                isPinching.current = true;
                pinchStartDist.current = dist;
                pinchStartZoom.current = zoom;
                isDragging.current = false;
            } else {
                const ratio = dist / pinchStartDist.current;
                setZoom(Math.min(Math.max(0.3, pinchStartZoom.current * ratio), 6));
            }
            return;
        }
        isPinching.current = false;

        if (isDragging.current) {
            const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
            const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
            const totalDx = Math.abs(clientX - tapOrigin.current.x);
            const totalDy = Math.abs(clientY - tapOrigin.current.y);
            const panThreshold = 'touches' in e ? 14 : 5;
            // Don't pan camera until movement clearly exceeds tap threshold
            if (!hasDragged.current && totalDx < panThreshold && totalDy < panThreshold) return;
            hasDragged.current = true;
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
        const isTouch = 'touches' in e;
        // Ignore events originating from within the dice HUD panel
        const nativeTarget = ('touches' in e ? e.touches[0]?.target : (e as React.MouseEvent).target) as Node | null;
        if (nativeTarget && hudRef.current?.contains(nativeTarget)) return;
        if (nativeTarget && statsHudRef.current?.contains(nativeTarget)) return;
        // Ignore synthetic mouse events that fire after touch (within 500ms)
        if (!isTouch && Date.now() - lastTouchTime.current < 500) return;
        if (isTouch) lastTouchTime.current = Date.now();
        isDragging.current = true;
        hasDragged.current = false;
        const x = isTouch ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX;
        const y = isTouch ? (e as React.TouchEvent).touches[0].clientY : (e as React.MouseEvent).clientY;
        dragStart.current = { x, y };
        tapOrigin.current = { x, y };
    }, []);

    const handlePointerUp = useCallback((_e: React.MouseEvent | React.TouchEvent) => {
        // Always reset drag/pinch state first — prevents stuck state when early returns skip the end of function
        const wasDragging = isDragging.current;
        isDragging.current = false;
        isPinching.current = false;

        // If it was a click without dragging much, trigger Click logic
        if (wasDragging) {
            if (!hasDragged.current) {
                // Was a tap/click — use initial touch position for accurate hex detection
                // (camX/camY unchanged since no camera movement occurred)
                const hex = getCurrentPointerHex(tapOrigin.current.x, tapOrigin.current.y);
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

                    // PLANNING MODE: build path step by step
                    if (isPlanningMode && stepsRemaining > 0) {
                        const lastHex = plannedPath.length > 0
                            ? plannedPath[plannedPath.length - 1]
                            : { q: userData.CurrentQ, r: userData.CurrentR };
                        const stepDist = getHexDist(lastHex.q, lastHex.r, hex.q, hex.r);
                        // Undo last step by clicking the last planned hex
                        if (plannedPath.length > 0 && hex.q === lastHex.q && hex.r === lastHex.r) {
                            setPlannedPath(prev => prev.slice(0, -1));
                            return;
                        }
                        if (stepDist === 1) {
                            const cursedMultiplier = (roleTrait?.name === '豬八戒' && roleTrait?.isCursed) ? 1.5 : 1;
                            const newCost = Math.ceil((plannedPath.length + 1) * cursedMultiplier);
                            if (newCost <= stepsRemaining) {
                                setPlannedPath(prev => [...prev, { q: hex.q, r: hex.r }]);
                            } else {
                                onShowMessage('步數不足，無法繼續規劃！', 'error');
                            }
                        } else {
                            onShowMessage('只能逐格點選相鄰格子', 'info');
                        }
                        return;
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
    }, [getCurrentPointerHex, stepsRemaining, userData, onMoveCharacter, roleTrait, fullGrid, onShowMessage, dbEntities, isPlanningMode, plannedPath]);

    const handleExecutePlannedPath = useCallback(() => {
        if (plannedPath.length === 0) return;

        let finalPath = [...plannedPath];
        if (roleTrait?.name === '孫悟空' && roleTrait?.isCursed) {
            const drifts = [{ q: 1, r: -1 }, { q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 }, { q: -1, r: 0 }, { q: 0, r: -1 }];
            const rand = drifts[Math.floor(Math.random() * drifts.length)];
            const last = finalPath[finalPath.length - 1];
            finalPath[finalPath.length - 1] = { q: last.q + rand.q, r: last.r + rand.r };
            onShowMessage('🐒 受詛咒的悟空偏離了目標！', 'info');
        }

        const isCursedPig = roleTrait?.name === '豬八戒' && roleTrait?.isCursed;
        const activeMonsters = dbEntities.filter(e => e.is_active !== false && e.type === 'monster');
        let finalIdx = finalPath.length - 1;
        for (let i = 0; i < finalPath.length; i++) {
            const step = finalPath[i];
            const monsterNearby = activeMonsters.find(e => getHexDist(step.q, step.r, e.q, e.r) <= 1);
            if (monsterNearby) { finalIdx = i; break; }
        }

        const targetQ = finalPath[finalIdx].q;
        const targetR = finalPath[finalIdx].r;
        const rawCost = finalIdx + 1;
        const actualCost = isCursedPig ? Math.ceil(rawCost * 1.5) : rawCost;
        const finalHexData = fullGrid.find(h => h.q === targetQ && h.r === targetR);
        const newFacing = getHexDirection(userData.CurrentQ, userData.CurrentR, targetQ, targetR);

        onMoveCharacter(targetQ, targetR, actualCost, finalHexData?.zoneId, newFacing);
        setPlannedPath([]);
        setIsPlanningMode(false);
    }, [plannedPath, roleTrait, dbEntities, fullGrid, userData, onMoveCharacter, onShowMessage]);

    const handleWheel = useCallback((e: React.WheelEvent) => {
        setZoom(prev => Math.min(Math.max(0.3, prev - Math.sign(e.deltaY) * 0.1), 6));
    }, []);

    // Player Pixel
    const playerPixel = useMemo(() => {
        return axialToPixelPos(userData.CurrentQ, userData.CurrentR, HEX_SIZE_WORLD);
    }, [userData.CurrentQ, userData.CurrentR, HEX_SIZE_WORLD]);

    return (
        <div className="absolute inset-0 bg-slate-950 flex flex-col overflow-hidden animate-in fade-in">
            {/* Header — floats over map on mobile, solid bar on desktop */}
            <header className="px-3 py-2 md:px-6 md:py-4 border-b border-white/10 flex justify-between items-center z-20 shadow-2xl
                absolute top-0 left-0 right-0 bg-slate-900/80 backdrop-blur-md
                md:relative md:bg-slate-900 md:backdrop-blur-none md:shrink-0">
                <div className="hidden md:flex items-center gap-3">
                    <div className="p-3 bg-emerald-600 rounded-2xl text-white shadow-lg border border-emerald-400/20"><MapIcon size={20} /></div>
                    <div className="text-left text-white font-black text-xl tracking-widest uppercase">心蓮六瓣 <span className="opacity-50 text-xs">// World Map</span></div>
                </div>
                {/* Mobile: show map icon only */}
                <div className="flex md:hidden items-center">
                    <div className="p-2 bg-emerald-600 rounded-xl text-white shadow-lg border border-emerald-400/20"><MapIcon size={16} /></div>
                </div>
                <div className="flex gap-1.5 md:gap-2">
                    <button aria-label="世界全景" onClick={() => setIsOverviewOpen(true)} className="flex items-center justify-center p-2 md:p-3 bg-sky-600/20 text-sky-400 hover:bg-sky-600 hover:text-white rounded-xl md:rounded-2xl transition-all border border-sky-500/20 active:scale-95 shadow-lg">
                        <Globe size={18} />
                    </button>
                    <button aria-label="商店" onClick={() => setIsShopOpen(true)} className="flex items-center justify-center p-2 md:p-3 bg-orange-600/20 text-orange-400 hover:bg-orange-600 hover:text-white rounded-xl md:rounded-2xl transition-all border border-orange-500/20 active:scale-95 shadow-lg relative">
                        <Store size={18} />
                    </button>
                    <button aria-label="道具欄" onClick={() => setIsInventoryOpen(true)} className="flex items-center justify-center p-2 md:p-3 bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600 hover:text-white rounded-xl md:rounded-2xl transition-all border border-indigo-500/20 active:scale-95 shadow-lg relative">
                        <Package size={18} />
                        {userData.GameInventory && userData.GameInventory.length > 0 && (
                            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-slate-900 animate-pulse"></span>
                        )}
                    </button>
                    <button aria-label="返回定課" onClick={onBack} className="flex items-center gap-1.5 px-3 py-2 md:px-6 md:py-3 bg-slate-800 hover:bg-slate-700 text-white font-black rounded-xl md:rounded-2xl transition-all border border-white/10 shadow-xl active:scale-95 text-xs md:text-sm"><ChevronLeft size={14} /> <span className="hidden md:inline">返回定課</span><span className="md:hidden">返回</span></button>
                </div>
            </header>

            {/* Main Map Container */}
            <main
                className="flex-1 bg-[#040407] overflow-hidden relative cursor-grab active:cursor-grabbing text-neutral-100 touch-none pt-[42px] md:pt-0"
                ref={mapContainerRef}
                onMouseDown={handlePointerDown}
                onMouseMove={handlePointerMove}
                onMouseUp={handlePointerUp}
                onMouseLeave={() => { isDragging.current = false; setHoveredHexKey(null); }}
                onTouchStart={handlePointerDown}
                onTouchMove={handlePointerMove}
                onTouchEnd={handlePointerUp}
                onTouchCancel={() => { isDragging.current = false; }}
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
                            {dbEntities.filter(e => (e.type === 'monster' || !e.owner_id || e.owner_id === userData.UserID) && getHexDist(initialQ, initialR, e.q, e.r) <= 20).map((e) => {
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
                                    <text key={`db_ent_${e.id}`} x={pos.x} y={pos.y - 1} textAnchor="middle" fontSize={12} className="drop-shadow-md">
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
                                        {e.data?.role && ROLE_CURE_MAP[e.data.role] ? (
                                            <image
                                                href={`/images/map-sprites/${e.data.role}.png`}
                                                x={-12}
                                                y={-36}
                                                width={24}
                                                height={36}
                                                preserveAspectRatio="xMidYMax meet"
                                                style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.9))' }}
                                            />
                                        ) : (
                                            <>
                                                <circle r={7} fill="rgba(59, 130, 246, 0.8)" stroke="white" strokeWidth={1} />
                                                <text y={4} textAnchor="middle" fontSize={11} className="drop-shadow-lg">{e.icon}</text>
                                            </>
                                        )}
                                        <text y={11} textAnchor="middle" fontSize={7} fill="#93c5fd" fontWeight="bold" className="drop-shadow">{e.name}</text>
                                    </g>
                                );
                            })}
                        </g>

                        {/* 2.7 Planned Path Overlay */}
                        {isPlanningMode && plannedPath.map((ph, idx) => {
                            const pos = axialToPixelPos(ph.q, ph.r, DEFAULT_CONFIG.HEX_SIZE_WORLD);
                            const isLast = idx === plannedPath.length - 1;
                            return (
                                <g key={`plan_${idx}`} style={{ pointerEvents: 'none' }}>
                                    <polygon
                                        points={getHexPointsStr(pos.x, pos.y, DEFAULT_CONFIG.HEX_SIZE_WORLD * 1.01)}
                                        fill={isLast ? 'rgba(56,189,248,0.5)' : 'rgba(56,189,248,0.25)'}
                                        stroke="rgba(56,189,248,0.9)"
                                        strokeWidth="1.5"
                                    />
                                    <text x={pos.x} y={pos.y + 3} textAnchor="middle" fontSize={6} fill="white" fontWeight="900" style={{ pointerEvents: 'none' }}>
                                        {idx + 1}
                                    </text>
                                </g>
                            );
                        })}

                        {/* 3. Player Character — avatar & name only; HUD is HTML overlay below */}
                        <g transform={`translate(${playerPixel.x}, ${playerPixel.y})`}>
                            {ROLE_CURE_MAP[userData.Role] ? (
                                <image
                                    href={`/images/map-sprites/${userData.Role}.png`}
                                    x={-12}
                                    y={-36}
                                    width={24}
                                    height={36}
                                    preserveAspectRatio="xMidYMax meet"
                                    style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.9))' }}
                                />
                            ) : (
                                <text y={-4} textAnchor="middle" fontSize={18} dominantBaseline="auto" style={{ userSelect: 'none' }}>
                                    {ROLE_CURE_MAP[userData.Role]?.avatar || '👤'}
                                </text>
                            )}
                            <text y={11} textAnchor="middle" fontSize={8} fontWeight="900" fill="white" style={{ textShadow: '0 2px 4px black, 0 -1px 2px black' }}>{userData.Name}</text>
                        </g>
                    </svg>
                </div>

                {/* Player Dice HUD — fixed bottom-right, avoids covering character name */}
                {(() => {
                    return (
                        <div
                            ref={hudRef}
                            className="absolute pointer-events-auto z-20 flex flex-col items-end"
                            style={{ right: 12, bottom: 12 }}
                            onMouseDown={e => e.stopPropagation()}
                            onMouseUp={e => e.stopPropagation()}
                            onTouchStart={e => e.stopPropagation()}
                            onTouchEnd={e => e.stopPropagation()}
                        >
                            <div
                                className={`mt-6 p-3 rounded-[2rem] bg-slate-900/80 border ${moveMultiplier && moveMultiplier > 1 ? 'border-yellow-400 shadow-[0_0_30px_rgba(250,204,21,0.5)] animate-pulse' : 'border-white/10 shadow-2xl'} backdrop-blur-xl flex flex-col gap-2 md:gap-3 items-center pointer-events-auto relative`}
                                style={{ width: 'min(170px, 45vw)' }}
                            >
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
                                    <button aria-label="減少骰數" onClick={() => setRollAmount(p => Math.max(1, p - 1))} className="w-11 h-11 rounded-full bg-slate-950 border border-white/5 text-slate-400 flex items-center justify-center font-black active:scale-90 hover:bg-slate-800 hover:text-white transition-all"><Minus size={16} /></button>
                                    <div className="font-black text-emerald-400 tracking-widest text-lg">x {rollAmount}</div>
                                    <button aria-label="增加骰數" onClick={() => setRollAmount(p => Math.min(userData.EnergyDice, p + 1))} className="w-11 h-11 rounded-full bg-slate-950 border border-white/5 text-slate-400 flex items-center justify-center font-black active:scale-90 hover:bg-slate-800 hover:text-white transition-all"><Plus size={16} /></button>
                                </div>
                                {/* Movement mode toggle — only when AP available */}
                                {stepsRemaining > 0 && (
                                    <div className="flex gap-2 w-full">
                                        <button
                                            onClick={() => { setIsPlanningMode(false); setPlannedPath([]); }}
                                            className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all ${!isPlanningMode ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400'}`}
                                        >
                                            🎯 自動
                                        </button>
                                        <button
                                            onClick={() => setIsPlanningMode(true)}
                                            className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all ${isPlanningMode ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-400'}`}
                                        >
                                            🗺️ 規劃
                                        </button>
                                    </div>
                                )}
                                {/* Planning controls */}
                                {isPlanningMode && stepsRemaining > 0 && (
                                    <div className="w-full space-y-1.5">
                                        <div className="text-[9px] text-sky-400 font-black text-center tracking-widest">
                                            已規劃 {plannedPath.length} 步（點最後一格取消）
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setPlannedPath([])}
                                                className="flex-1 py-2 rounded-xl text-xs font-black bg-slate-800 text-slate-400 active:scale-95 transition-all"
                                            >
                                                🗑️ 清除
                                            </button>
                                            <button
                                                disabled={plannedPath.length === 0}
                                                onClick={handleExecutePlannedPath}
                                                className="flex-[2] py-2 rounded-xl text-xs font-black bg-sky-600 text-white shadow-lg active:scale-95 disabled:opacity-40 transition-all"
                                            >
                                                ✅ 執行移動
                                            </button>
                                        </div>
                                    </div>
                                )}
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
                        <div
                            ref={statsHudRef}
                            className="absolute bottom-4 left-3 bg-slate-900/80 p-2.5 md:p-4 rounded-2xl md:rounded-3xl border border-white/10 backdrop-blur-xl shadow-2xl select-none pointer-events-auto md:pointer-events-none z-30 space-y-2 md:space-y-3 min-w-[130px] md:min-w-[160px] cursor-pointer md:cursor-default"
                            onClick={() => setIsStatsExpanded(p => !p)}
                            onMouseDown={e => e.stopPropagation()}
                            onMouseUp={e => e.stopPropagation()}
                            onTouchStart={e => e.stopPropagation()}
                            onTouchEnd={e => e.stopPropagation()}
                        >
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
                            {/* ATK / DEF — hidden on mobile when collapsed */}
                            <div className={`${isStatsExpanded ? 'flex' : 'hidden md:flex'} items-center gap-4`}>
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
                            {/* Coordinates — hidden on mobile to save space */}
                            <div className="hidden md:flex items-center gap-1.5 text-[9px] text-slate-600 font-mono">
                                <Footprints size={10} /> {userData.CurrentQ}, {userData.CurrentR}
                            </div>
                            {/* Mobile expand hint */}
                            <div className="flex md:hidden justify-center mt-0.5">
                                <span className="text-[8px] text-slate-600">{isStatsExpanded ? '▲ 收合' : '▼ 展開'}</span>
                            </div>
                        </div>
                    );
                })()}

                {/* Recenter button — appears when player has panned away from character */}
                {(Math.abs(camX + playerPixel.x) > 10 || Math.abs(camY + playerPixel.y) > 10) && (
                    <button
                        className="absolute top-[52px] md:bottom-6 md:top-auto left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-slate-900/90 border border-white/10 text-cyan-400 text-[11px] font-black shadow-xl backdrop-blur-xl active:scale-95 transition-all"
                        onClick={() => { setCamX(-playerPixel.x); setCamY(-playerPixel.y); }}
                    >
                        <LocateFixed size={13} /> 回到角色
                    </button>
                )}
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

            <WorldOverview
                isOpen={isOverviewOpen}
                onClose={() => setIsOverviewOpen(false)}
                mapData={mapData}
                corridorL={corridorL}
                corridorW={corridorW}
                dbEntities={dbEntities ?? []}
                userData={userData}
            />
        </div>
    );
};
