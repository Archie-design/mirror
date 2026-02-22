"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import {
  AlertTriangle, CheckCircle2, Sparkles, MapIcon, ChevronLeft,
  Dice5, Footprints, Loader2, RotateCcw, UserPlus, ArrowRight
} from 'lucide-react';

import { CharacterStats, DailyLog, Quest, SystemSettings, HexData, TopicHistory } from '@/types';
import { getLogicalDateStr, getWeeklyMonday } from '@/lib/utils/time';
import { standardizePhone } from '@/lib/utils/phone';
import { ROLE_CURE_MAP, DEFAULT_CONFIG, TERRAIN_TYPES, ADVENTURE_COST, BASE_START_DATE_STR, PENALTY_PER_DAY, ADMIN_PASSWORD } from '@/lib/constants';
import { axialToPixel, getHexPointsStr, getHexRegion, getHexDist } from '@/lib/utils/hex';

import { Header } from '@/components/Layout/Header';
import { LoginForm } from '@/components/Login/LoginForm';
import { DailyQuestsTab } from '@/components/Tabs/DailyQuestsTab';
import { WeeklyTopicTab } from '@/components/Tabs/WeeklyTopicTab';
import { StatsTab } from '@/components/Tabs/StatsTab';
import { RankTab } from '@/components/Tabs/RankTab';
import { AdminDashboard } from '@/components/Admin/AdminDashboard';
import { processCheckInTransaction } from '@/app/actions/quest';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

const MessageBox = ({ message, onClose, type = 'info' }: { message: string, onClose: () => void, type?: 'info' | 'error' | 'success' }) => (
  <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-sm animate-in fade-in duration-300 mx-auto text-center">
    <div className="bg-slate-900 border-2 border-slate-800 p-8 rounded-[2.5rem] shadow-2xl max-w-sm w-full text-center space-y-6 mx-auto flex flex-col items-center">
      <div className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center ${type === 'error' ? 'bg-red-500/20 text-red-500' : type === 'success' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-blue-500/20 text-blue-500'}`}>
        {type === 'error' ? <AlertTriangle size={40} /> : type === 'success' ? <CheckCircle2 size={40} /> : <Sparkles size={40} />}
      </div>
      <p className="text-xl font-bold text-white leading-relaxed text-center mx-auto">{message}</p>
      <button onClick={onClose} className="w-full py-4 bg-orange-600 hover:bg-orange-500 text-white font-black rounded-2xl transition-all active:scale-95 shadow-lg text-center mx-auto">確認領旨</button>
    </div>
  </div>
);

export default function App() {
  const [view, setView] = useState<'login' | 'register' | 'app' | 'loading' | 'admin' | 'map'>('loading');
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<'daily' | 'weekly' | 'stats' | 'rank'>('daily');
  const [userData, setUserData] = useState<CharacterStats | null>(null);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [leaderboard, setLeaderboard] = useState<CharacterStats[]>([]);
  const [topicHistory, setTopicHistory] = useState<TopicHistory[]>([]);
  const [systemSettings, setSystemSettings] = useState<SystemSettings>({ MandatoryQuestId: 'q2', TopicQuestTitle: '載入中...' });
  const [modalMessage, setModalMessage] = useState<{ text: string, type: 'info' | 'error' | 'success' } | null>(null);
  const [undoTarget, setUndoTarget] = useState<Quest | null>(null);
  const [adminAuth, setAdminAuth] = useState(false);
  const [mapData, setMapData] = useState<Record<string, string>>({});
  const [hoveredHex, setHoveredHex] = useState<string | null>(null);

  const [camX, setCamX] = useState(0);
  const [camY, setCamY] = useState(0);
  const [stepsRemaining, setStepsRemaining] = useState(0);
  const [isRolling, setIsRolling] = useState(false);

  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const formatCheckInTime = (timestamp: string) => {
    const d = new Date(timestamp);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const logicalTodayStr = useMemo(() => getLogicalDateStr(), []);
  const currentWeeklyMonday = useMemo(() => getWeeklyMonday(), []);

  const syncUserFines = useCallback(async (currentStats: CharacterStats, userLogs: DailyLog[], currentMandatoryOption: string) => {
    // Fetch all mandatory quest history
    const { data: historyData } = await supabase.from('MandatoryQuestHistory').select('*');
    const mandatoryHistoryMap = new Map<string, string>();
    if (historyData) {
      historyData.forEach((h: any) => {
        mandatoryHistoryMap.set(getLogicalDateStr(h.effective_date), h.QuestID);
      });
    }

    const dates: string[] = [];
    const curr = new Date(`${BASE_START_DATE_STR}T12:00:00`);
    const todayLogical = getLogicalDateStr();
    let temp = new Date(curr);

    while (true) {
      const tempStr = getLogicalDateStr(temp);
      dates.push(tempStr);
      if (tempStr === todayLogical) break;
      temp.setDate(temp.getDate() + 1);
      if (dates.length > 3000) break; // sanity safeguard
    }

    // A map of dates to the user's completed quests on that date
    const checkInMap = new Map<string, Set<string>>();
    userLogs.forEach(l => {
      if (l.QuestID.startsWith('q')) {
        const dateStr = getLogicalDateStr(l.Timestamp);
        if (!checkInMap.has(dateStr)) checkInMap.set(dateStr, new Set());
        checkInMap.get(dateStr)!.add(l.QuestID);
      }
    });

    let missedDatesCount = 0;

    dates.forEach(dateStr => {
      // Find what the mandatory quest was for this specific date
      const requiredQuestId = mandatoryHistoryMap.get(dateStr) || currentMandatoryOption;

      const userQuestsOnDate = checkInMap.get(dateStr);
      // If the user did not check in at all, or did not complete the required quest for that date
      if (!userQuestsOnDate || !userQuestsOnDate.has(requiredQuestId)) {
        missedDatesCount++;
      }
    });

    const calculatedFines = missedDatesCount * PENALTY_PER_DAY;

    if (currentStats.TotalFines !== calculatedFines) {
      await supabase.from('CharacterStats').update({ TotalFines: calculatedFines }).eq('UserID', currentStats.UserID);
      return calculatedFines;
    }
    return currentStats.TotalFines;
  }, []);

  const isTopicDone = useMemo(() =>
    logs.some(l => l.QuestID === 't1' && new Date(l.Timestamp) >= currentWeeklyMonday),
    [logs, currentWeeklyMonday]
  );

  const roleTrait = useMemo(() => {
    if (!userData) return null;
    const info = ROLE_CURE_MAP[userData.Role];
    if (!info) return null;
    const isCuredToday = logs.some(l => l.QuestID === info.cureTaskId && getLogicalDateStr(l.Timestamp) === logicalTodayStr);
    return { ...info, isCursed: !isCuredToday };
  }, [userData, logs, logicalTodayStr]);

  const axialToPixelPos = useCallback((q: number, r: number, size: number) => axialToPixel(q, r, size), []);

  const handleAdminAuth = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (fd.get('password') === ADMIN_PASSWORD) {
      setAdminAuth(true);
    } else {
      setModalMessage({ text: "密令錯誤，大會禁地不可擅闖。", type: 'error' });
    }
  };

  const updateGlobalSetting = async (key: string, value: string) => {
    setIsSyncing(true);
    try {
      const { error } = await supabase.from('SystemSettings').update({ Value: value }).eq('SettingName', key);
      if (error) throw error;
      setSystemSettings(prev => ({ ...prev, [key]: value }));

      if (key === 'TopicQuestTitle') {
        const { data: newHistory, error: historyErr } = await supabase.from('TopicHistory').insert([{ TopicTitle: value }]).select();
        if (!historyErr && newHistory) {
          setTopicHistory(prev => [newHistory[0] as TopicHistory, ...prev]);
        }
      }

      // If updating MandatoryQuestId, store a snapshot for exact days going forward
      if (key === 'MandatoryQuestId') {
        const todayLogical = getLogicalDateStr();
        await supabase.from('MandatoryQuestHistory')
          .upsert({ QuestID: value, effective_date: todayLogical }, { onConflict: 'effective_date' })
          .select();

        // Re-calculate user's own fines immediately if they are logged in
        if (userData && logs) {
          const newFines = await syncUserFines(userData, logs, value);
          setUserData(prev => prev ? { ...prev, TotalFines: newFines } : null);
        }
      }

      setModalMessage({ text: "設定已同步雲端，諸位修行者將即時感應。", type: 'success' });
    } catch (err) {
      setModalMessage({ text: "同步失敗，法陣連線異常。", type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRollDice = () => {
    if (!userData || isRolling || stepsRemaining > 0) return;
    if (userData.EnergyDice <= 0) {
      setModalMessage({ text: "能量骰子已耗盡，請完成定課以補充！", type: 'error' });
      return;
    }
    setIsRolling(true);
    setTimeout(() => {
      let roll = Math.floor(Math.random() * 6) + 1;
      if (userData.Role === '白龍馬') roll += 2;
      if (userData.Role === '唐三藏' && roleTrait?.isCursed) roll = Math.max(1, Math.floor(roll / 2));
      setStepsRemaining(roll);
      setIsRolling(false);
      const newEnergy = userData.EnergyDice - 1;
      setUserData({ ...userData, EnergyDice: newEnergy });
      supabase.from('CharacterStats').update({ EnergyDice: newEnergy }).eq('UserID', userData.UserID);
      setModalMessage({ text: `修行法輪轉動完成！獲得步數：${roll}`, type: 'success' });
    }, 800);
  };

  const handleMoveCharacter = async (q: number, r: number, dist: number) => {
    if (!userData) return;
    setIsSyncing(true);
    try {
      const { error } = await supabase.from('CharacterStats').update({ CurrentQ: q, CurrentR: r }).eq('UserID', userData.UserID);
      if (error) throw error;
      setUserData({ ...userData, CurrentQ: q, CurrentR: r });
      setStepsRemaining(prev => Math.max(0, prev - dist));
      const pos = axialToPixelPos(q, r, DEFAULT_CONFIG.HEX_SIZE_WORLD);
      setCamX(pos.x); setCamY(pos.y);
    } catch (err) {
      setModalMessage({ text: "移動失敗，法陣傳送受阻。", type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleHexClick = useCallback((q: number, r: number) => {
    if (view === 'map' && stepsRemaining > 0 && userData) {
      const dist = getHexDist(userData.CurrentQ, userData.CurrentR, q, r);
      if (dist === 0) return;
      if (dist <= stepsRemaining) handleMoveCharacter(q, r, dist);
      else setModalMessage({ text: `能量不足！此步需要 ${dist} 點，目前僅餘 ${stepsRemaining}。`, type: 'error' });
    }
  }, [view, stepsRemaining, userData, handleMoveCharacter]);

  const handleCheckInAction = async (quest: Quest) => {
    if (!userData) return;
    setIsSyncing(true);
    try {
      const res = await processCheckInTransaction(userData.UserID, quest.id, quest.title, quest.reward, quest.dice);

      if (res.success) {
        const { data: newLogs } = await supabase.from('DailyLogs').select('*').eq('UserID', userData.UserID);
        const updatedLogs = (newLogs as DailyLog[]) || [];
        const finalFines = await syncUserFines(res.user as CharacterStats, updatedLogs, systemSettings.MandatoryQuestId);

        setLogs(updatedLogs);
        setUserData({ ...(res.user as CharacterStats), TotalFines: finalFines });
        setModalMessage({ text: "修為提升，法喜充滿！", type: 'success' });
      } else {
        setModalMessage({ text: res.error || "記錄失敗，靈通中斷。", type: 'error' });
      }
    } catch (err) {
      setModalMessage({ text: "記錄失敗，靈通中斷。", type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUndoCheckInAction = async (quest: Quest | null) => {
    if (!userData || !quest) return;
    setIsSyncing(true);
    try {
      const { data: targetLogs } = await supabase.from('DailyLogs').select('*').eq('UserID', userData.UserID).eq('QuestID', quest.id).order('Timestamp', { ascending: false }).limit(1);
      if (!targetLogs || targetLogs.length === 0) return;
      if (getLogicalDateStr(targetLogs[0].Timestamp) !== logicalTodayStr) {
        setModalMessage({ text: "因果已定，僅限回溯今日紀錄。", type: 'info' });
        setUndoTarget(null);
        return;
      }
      await supabase.from('DailyLogs').delete().eq('id', targetLogs[0].id);

      const roleInfo = ROLE_CURE_MAP[userData.Role];
      const update: Partial<CharacterStats> = {
        Exp: Math.max(0, userData.Exp - quest.reward),
        EnergyDice: Math.max(0, userData.EnergyDice - (quest.dice || 0))
      };

      if (roleInfo?.cureTaskId === quest.id) {
        const statKey = roleInfo.bonusStat;
        (update as any)[statKey] = Math.max(10, (userData[statKey] as number) - 2);
      }

      await supabase.from('CharacterStats').update(update).eq('UserID', userData.UserID);
      const { data: newLogs } = await supabase.from('DailyLogs').select('*').eq('UserID', userData.UserID);
      const updatedLogs = (newLogs as DailyLog[]) || [];
      const finalFines = await syncUserFines({ ...userData, ...update } as CharacterStats, updatedLogs, systemSettings.MandatoryQuestId);

      setLogs(updatedLogs);
      setUserData({ ...userData, ...update, TotalFines: finalFines } as CharacterStats);
      setUndoTarget(null);
      setModalMessage({ text: "時光回溯成功，心識已歸位。", type: 'success' });
    } catch (err) { setModalMessage({ text: "回溯失敗，業力阻擋。", type: 'error' }); } finally { setIsSyncing(false); }
  };

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSyncing(true);
    const fd = new FormData(e.currentTarget);
    const name = (fd.get('name') as string).trim();
    const phoneSuffix = (fd.get('phone') as string).trim();
    try {
      const { data: allUsers } = await supabase.from('CharacterStats').select('*');
      const match = (allUsers as CharacterStats[])?.find(u => u.Name === name && u.UserID.endsWith(phoneSuffix));
      if (match) {
        sessionStorage.setItem('starry_session_uid', match.UserID);
        const { data: userLogs } = await supabase.from('DailyLogs').select('*').eq('UserID', match.UserID);
        const logsArray = (userLogs as DailyLog[]) || [];
        const updatedFines = await syncUserFines(match, logsArray, systemSettings.MandatoryQuestId);
        setUserData({ ...match, TotalFines: updatedFines });
        setLogs(logsArray);
        setView('app');
      } else { setModalMessage({ text: "查無此修行者印記。", type: 'error' }); }
    } catch (err) { setModalMessage({ text: "靈通感應異常。", type: 'error' }); } finally { setIsSyncing(false); }
  };

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSyncing(true);
    const fd = new FormData(e.currentTarget);
    const name = (fd.get('name') as string).trim();
    const phoneRaw = (fd.get('phone') as string);
    const phone = standardizePhone(phoneRaw);
    const roles = Object.keys(ROLE_CURE_MAP);
    const assignedRole = roles[Math.floor(Math.random() * roles.length)];
    const newChar: CharacterStats = { UserID: phone, Name: name, Role: assignedRole, Level: 1, Exp: 0, EnergyDice: 3, Savvy: 10, Luck: 10, Charisma: 10, Spirit: 10, Physique: 10, Potential: 10, Streak: 0, LastCheckIn: null, TotalFines: 0, CurrentQ: 0, CurrentR: 0 };
    try {
      await supabase.from('CharacterStats').insert([newChar]);
      sessionStorage.setItem('starry_session_uid', newChar.UserID);
      setUserData(newChar);
      setView('app');
    } catch (err) { setModalMessage({ text: "轉生受阻。", type: 'error' }); } finally { setIsSyncing(false); }
  };

  const handleStartAdventure = () => {
    if (!userData || userData.EnergyDice < ADVENTURE_COST) {
      setModalMessage({ text: `能量不足！啟動需要 ${ADVENTURE_COST} 顆骰子。`, type: 'error' });
      return;
    }
    setView('map'); setCamX(0); setCamY(0);
  };

  const handleLogout = () => { sessionStorage.removeItem('starry_session_uid'); setUserData(null); setView('login'); };

  const handleMapMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
  };
  const handleMapMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = dragStart.current.x - e.clientX;
    const dy = dragStart.current.y - e.clientY;
    setCamX(prev => prev + dx * 2);
    setCamY(prev => prev + dy * 2);
    dragStart.current = { x: e.clientX, y: e.clientY };
  };
  const handleMapMouseUp = () => { isDragging.current = false; };

  const worldGrid = useMemo(() => {
    const hexes: HexData[] = [];
    getHexRegion(DEFAULT_CONFIG.CENTER_SIDE - 1).forEach(p => {
      const pos = axialToPixelPos(p.q, p.r, DEFAULT_CONFIG.HEX_SIZE_WORLD);
      const key = `center_0_${p.q},${p.r}`;
      const terrainId = mapData[key] || 'grass';
      hexes.push({ ...p, ...pos, type: 'center', terrainId, color: TERRAIN_TYPES[terrainId]?.color || '#1a472a', key });
    });
    return hexes;
  }, [mapData, axialToPixelPos]);

  const visibleGrid = useMemo(() => {
    if (view !== 'map') return worldGrid;
    const margin = 1500;
    return worldGrid.filter(h => h.x >= camX - margin && h.x <= camX + margin && h.y >= camY - margin && h.y <= camY + margin);
  }, [worldGrid, view, camX, camY]);

  const renderHexNodeInner = useCallback((hex: HexData, size: number) => {
    const isHovered = hoveredHex === hex.key;
    const isMovable = view === 'map' && stepsRemaining > 0 && userData && getHexDist(userData.CurrentQ, userData.CurrentR, hex.q, hex.r) <= stepsRemaining;

    return (
      <g key={hex.key} onMouseEnter={() => setHoveredHex(hex.key)} onMouseLeave={() => setHoveredHex(null)} onClick={() => handleHexClick(hex.q, hex.r)}>
        <polygon points={getHexPointsStr(hex.x, hex.y, size * 1.01)} fill={isMovable ? "rgba(16, 185, 129, 0.4)" : hex.color} stroke={isHovered ? "white" : "rgba(255,255,255,0.02)"} strokeWidth="1" className="cursor-pointer transition-all duration-300" />
      </g>
    );
  }, [view, hoveredHex, stepsRemaining, userData, handleHexClick]);

  useEffect(() => {
    const init = async () => {
      // Always try to fetch setting early to populate UI
      let fetchedSettings: any = {};
      const { data: settingsData } = await supabase.from('SystemSettings').select('*');
      if (settingsData) {
        const sObj = settingsData.reduce((acc: any, curr: any) => ({ ...acc, [curr.SettingName]: curr.Value }), {});
        fetchedSettings = sObj;
        setSystemSettings({
          MandatoryQuestId: sObj.MandatoryQuestId || 'q2',
          TopicQuestTitle: sObj.TopicQuestTitle || '修行主題載入中'
        });
      }

      const { data: historyData } = await supabase.from('TopicHistory').select('*').order('created_at', { ascending: false });
      if (historyData) setTopicHistory(historyData as TopicHistory[]);

      const savedUid = sessionStorage.getItem('starry_session_uid');
      if (savedUid && !userData) {
        const { data: stats, error } = await supabase.from('CharacterStats').select('*').eq('UserID', savedUid).single();
        if (stats && !error) {
          const { data: userLogs } = await supabase.from('DailyLogs').select('*').eq('UserID', stats.UserID);
          const logsArray = (userLogs as DailyLog[]) || [];

          // Fallback to the fetched setting if it exists, else default
          const fallbackMandatory = fetchedSettings?.MandatoryQuestId || 'q2';
          const updatedFines = await syncUserFines(stats as CharacterStats, logsArray, fallbackMandatory);

          setUserData({ ...stats, TotalFines: updatedFines } as CharacterStats);
          setLogs(logsArray);
          setView('app');
        } else { setView('login'); }
      } else if (!savedUid) { setView('login'); }
    };
    init();
  }, [syncUserFines, userData]);

  useEffect(() => {
    const fetchRank = async () => {
      const { data: rankData } = await supabase.from('CharacterStats').select('*').order('Exp', { ascending: false });
      if (rankData) setLeaderboard(rankData as CharacterStats[]);
    };
    if (activeTab === 'rank' || view === 'admin') fetchRank();
  }, [activeTab, view]);

  const MapView = () => {
    const playerPixel = useMemo(() => {
      if (!userData) return { x: 0, y: 0 };
      return axialToPixelPos(userData.CurrentQ, userData.CurrentR, DEFAULT_CONFIG.HEX_SIZE_WORLD);
    }, [userData]);
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col overflow-hidden relative animate-in fade-in">
        <header className="p-6 bg-slate-900 border-b border-white/10 flex justify-between items-center z-10 text-center">
          <div className="flex items-center gap-3 text-center justify-center">
            <div className="p-3 bg-orange-600 rounded-2xl text-white shadow-lg"><MapIcon size={20} /></div>
            <div className="text-left text-white font-black text-xl italic">修行世界觀測中</div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleRollDice} disabled={isRolling || stepsRemaining > 0} className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black transition-all shadow-xl active:scale-95 ${stepsRemaining > 0 ? 'bg-slate-800 text-slate-500' : 'bg-orange-600 text-white hover:bg-orange-500'}`}>
              {isRolling ? <Loader2 size={16} className="animate-spin" /> : <Dice5 size={16} />} 轉法輪
            </button>
            <button onClick={() => setView('app')} className="flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white font-black rounded-2xl transition-all border border-white/10 shadow-xl active:scale-95"><ChevronLeft size={16} /> 返回修行</button>
          </div>
        </header>

        <main
          className="flex-1 bg-black overflow-hidden relative cursor-grab active:cursor-grabbing text-center justify-center mx-auto w-full flex"
          onMouseDown={handleMapMouseDown}
          onMouseMove={handleMapMouseMove}
          onMouseUp={handleMapMouseUp}
          onMouseLeave={handleMapMouseUp}
        >
          <svg viewBox={`${camX - 800} ${camY - 800} 1600 1600`} className="w-full h-full select-none mx-auto transition-none">
            <defs><radialGradient id="mapFog"><stop offset="60%" stopColor="transparent" /><stop offset="100%" stopColor="black" stopOpacity="0.8" /></radialGradient></defs>
            <g>
              {visibleGrid.map(hex => renderHexNodeInner(hex, DEFAULT_CONFIG.HEX_SIZE_WORLD))}
              {userData && (
                <g transform={`translate(${playerPixel.x}, ${playerPixel.y})`}>
                  <circle r="12" fill="white" className="animate-pulse opacity-20" />
                  <circle r="8" fill="#ea580c" stroke="white" strokeWidth="2" />
                  <text y="5" textAnchor="middle" fontSize="12" className="select-none pointer-events-none">{ROLE_CURE_MAP[userData.Role]?.avatar || '👤'}</text>
                  <text y="22" textAnchor="middle" fontSize="8" fontWeight="bold" fill="white" className="drop-shadow-md">{userData.Name}</text>
                </g>
              )}
            </g>
            <rect x={camX - 800} y={camY - 800} width="1600" height="1600" fill="url(#mapFog)" pointerEvents="none" />
          </svg>

          <div className="absolute top-8 left-8 bg-slate-900/80 p-4 rounded-2xl border border-white/10 backdrop-blur-md">
            <div className="flex items-center gap-2 text-emerald-400 font-black text-xs uppercase tracking-widest text-left">
              <Footprints size={14} /> 靈體位置：({userData?.CurrentQ}, {userData?.CurrentR})
            </div>
          </div>
        </main>
      </div>
    );
  };

  const HomeView = () => (
    <div className="min-h-screen bg-slate-950 text-slate-200 pb-40 text-center animate-in fade-in">
      <Header userData={userData} onLogout={handleLogout} />

      <nav className="sticky top-0 z-20 bg-slate-950/90 backdrop-blur-md flex p-4 gap-2 border-b border-white/5 shadow-xl overflow-x-auto no-scrollbar justify-center">
        <button onClick={() => setActiveTab('daily')} className={`shrink-0 px-6 py-4 rounded-2xl text-xs font-black transition-all ${activeTab === 'daily' ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/20' : 'bg-slate-900 text-slate-500'}`}>修行定課</button>
        <button onClick={() => setActiveTab('weekly')} className={`shrink-0 px-6 py-4 rounded-2xl text-xs font-black transition-all ${activeTab === 'weekly' ? 'bg-orange-600 text-white shadow-lg' : 'bg-slate-900 text-slate-50'}`}>加分副本</button>
        <button onClick={() => setActiveTab('rank')} className={`shrink-0 px-6 py-4 rounded-2xl text-xs font-black transition-all ${activeTab === 'rank' ? 'bg-orange-600 text-white shadow-lg' : 'bg-slate-900 text-slate-50'}`}>修為榜</button>
        <button onClick={() => setActiveTab('stats')} className={`shrink-0 px-6 py-4 rounded-2xl text-xs font-black transition-all ${activeTab === 'stats' ? 'bg-orange-600 text-white shadow-lg' : 'bg-slate-900 text-slate-50'}`}>六維與罰金</button>
      </nav>

      <main className="max-w-md mx-auto p-6 space-y-8">
        {activeTab === 'daily' && (
          <DailyQuestsTab
            systemSettings={systemSettings}
            logs={logs}
            logicalTodayStr={logicalTodayStr}
            onCheckIn={handleCheckInAction}
            onUndo={setUndoTarget}
            formatCheckInTime={formatCheckInTime}
          />
        )}
        {activeTab === 'weekly' && (
          <WeeklyTopicTab
            systemSettings={systemSettings}
            logs={logs}
            currentWeeklyMonday={currentWeeklyMonday}
            isTopicDone={isTopicDone}
            onCheckIn={handleCheckInAction}
            onUndo={setUndoTarget}
          />
        )}
        {activeTab === 'rank' && <RankTab leaderboard={leaderboard} />}
        {activeTab === 'stats' && userData && <StatsTab userData={userData} roleTrait={roleTrait} />}
      </main>

      <footer className="fixed bottom-0 left-0 right-0 p-10 bg-gradient-to-t from-slate-950 via-slate-950 to-transparent pointer-events-none z-30 flex justify-center text-center mx-auto">
        <button
          disabled={(userData?.EnergyDice || 0) < ADVENTURE_COST}
          onClick={handleStartAdventure}
          className={`pointer-events-auto w-full max-w-md py-7 rounded-[2.5rem] font-black text-2xl shadow-xl flex items-center justify-center gap-4 transition-all mx-auto ${(userData?.EnergyDice || 0) >= ADVENTURE_COST ? 'bg-orange-600 text-white active:scale-95 shadow-orange-600/30' : 'bg-slate-800 text-slate-600 opacity-50'}`}
        >
          <Dice5 size={32} />啟動冒險 (🎲 {userData?.EnergyDice || 0})
        </button>
      </footer>
    </div>
  );

  return (
    <div className="text-center justify-center mx-auto w-full font-sans">
      {view === 'loading' && (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-10 text-center mx-auto">
          <Loader2 className="w-16 h-16 text-orange-500 animate-spin mb-6 mx-auto" />
          <p className="text-orange-500 text-xl font-black animate-pulse text-center mx-auto">正在共感法界能量...</p>
        </div>
      )}

      {view === 'login' && (
        <LoginForm
          onLogin={handleLogin}
          onGoToRegister={() => setView('register')}
          onGoToAdmin={() => setView('admin')}
          isSyncing={isSyncing}
        />
      )}

      {view === 'register' && (
        <div className="min-h-screen bg-slate-950 p-8 text-slate-200 text-center flex flex-col items-center justify-center">
          <div className="max-w-md w-full space-y-10 animate-in slide-in-from-bottom-8 duration-500 text-center mx-auto">
            <header className="space-y-4 text-center mx-auto">
              <div className="w-20 h-20 bg-yellow-500 rounded-3xl mx-auto flex items-center justify-center shadow-xl text-slate-950 text-center mx-auto"><Sparkles size={40} /></div>
              <h1 className="text-4xl font-black text-white text-center mx-auto">啟動轉生儀式</h1>
            </header>
            <form onSubmit={handleRegister} className="space-y-8 text-center mx-auto">
              <div className="space-y-4 text-center mx-auto">
                <input name="name" required className="w-full bg-slate-900 border-2 border-white/5 rounded-2xl p-5 text-white text-center outline-none focus:border-orange-500 font-bold text-center mx-auto" placeholder="真實姓名" />
                <input name="phone" required type="tel" className="w-full bg-slate-900 border-2 border-white/5 rounded-2xl p-5 text-white text-center outline-none focus:border-orange-500 font-bold text-center mx-auto" placeholder="手機號碼 (用於唯一ID)" />
              </div>
              <button disabled={isSyncing} className="w-full py-6 rounded-4xl bg-orange-600 text-white font-black text-xl shadow-2xl flex items-center justify-center gap-3 active:scale-95 transition-all text-center mx-auto">確認轉生 <ArrowRight size={24} /></button>
              <button type="button" onClick={() => setView('login')} className="text-slate-500 text-sm font-bold">返回登入</button>
            </form>
          </div>
        </div>
      )}

      {view === 'admin' && (
        <AdminDashboard
          adminAuth={adminAuth}
          onAuth={handleAdminAuth}
          systemSettings={systemSettings}
          updateGlobalSetting={updateGlobalSetting}
          leaderboard={leaderboard}
          topicHistory={topicHistory}
          onClose={() => setView('login')}
        />
      )}

      {view === 'app' && <HomeView />}
      {view === 'map' && <MapView />}

      {undoTarget && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center p-6 bg-slate-950/95 backdrop-blur-xl animate-in fade-in duration-200 text-center mx-auto">
          <div className="bg-slate-900 border-2 border-slate-800 p-8 rounded-[2.5rem] shadow-2xl max-w-sm w-full text-center space-y-6 mx-auto">
            <div className="w-20 h-20 rounded-full mx-auto flex items-center justify-center bg-orange-500/20 text-orange-500 mx-auto text-center"><RotateCcw size={40} className="animate-spin-slow" /></div>
            <h3 className="text-2xl font-black text-white text-center mx-auto">發動時光回溯？</h3><p className="text-slate-400 text-sm font-bold text-center mx-auto">這將會扣除本次修得的 {undoTarget.reward} 修為。</p>
            <div className="flex gap-4 text-center mx-auto"><button onClick={() => setUndoTarget(null)} className="flex-1 py-4 bg-slate-800 text-slate-500 font-black rounded-2xl text-center shadow-lg transition-all active:scale-95">保持現狀</button><button onClick={() => handleUndoCheckInAction(undoTarget)} className="flex-1 py-4 bg-orange-600 text-white font-black rounded-2xl shadow-xl active:scale-95 transition-all text-center mx-auto">確認回溯</button></div>
          </div>
        </div>
      )}

      {isSyncing && (
        <div className="fixed inset-0 bg-slate-950/60 z-[1100] flex flex-col items-center justify-center text-center mx-auto">
          <Loader2 className="w-12 h-12 text-orange-500 animate-spin mb-4 mx-auto" />
          <p className="text-orange-500 font-black animate-pulse tracking-widest uppercase text-center mx-auto">與法界同步中...</p>
        </div>
      )}

      {modalMessage && <MessageBox message={modalMessage.text} type={modalMessage.type} onClose={() => setModalMessage(null)} />}
    </div>
  );
}