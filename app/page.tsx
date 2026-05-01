"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import {
  AlertTriangle, CheckCircle2, Sparkles,
  Loader2, RotateCcw,
  CalendarDays, LayoutGrid, Trophy
} from 'lucide-react';
import { StarWandIcon, RubySlipperIcon, EmeraldCastleIcon, FilmReelIcon, Glasses3DIcon, MegaphoneIcon } from '@/components/ui/FilmIcons';

import { CharacterStats, DailyLog, Quest, SystemSettings, TemporaryQuest, BonusApplication, AdminLog, TeamSettings } from '@/types';
import { useLogicalDate } from '@/lib/hooks/useLogicalDate';
import { loginAdmin, logoutAdmin, verifyAdminSession } from '@/app/actions/admin-auth';

import dynamic from 'next/dynamic';
import { Header } from '@/components/Layout/Header';
import { LoginForm } from '@/components/Login/LoginForm';
import { RegisterForm } from '@/components/Login/RegisterForm';
import { DailyQuestsTab } from '@/components/Tabs/DailyQuestsTab';
import { WeeklyTopicTab } from '@/components/Tabs/WeeklyTopicTab';
import { StatsTab } from '@/components/Tabs/StatsTab';
import { RankTab } from '@/components/Tabs/RankTab';
// 重型 Tab（只對特定角色載入）採用 dynamic import 降低首屏 bundle
const CaptainTab = dynamic(() => import('@/components/Tabs/CaptainTab').then(m => ({ default: m.CaptainTab })), { ssr: false });
const CommandantTab = dynamic(() => import('@/components/Tabs/CommandantTab').then(m => ({ default: m.CommandantTab })), { ssr: false });
import CourseTab from '@/components/Tabs/CourseTab';
const AdminDashboard = dynamic(() => import('@/components/Admin/AdminDashboard').then(m => ({ default: m.AdminDashboard })), { ssr: false });
import { processCheckInTransaction, clearTodayLogs, undoCheckIn } from '@/app/actions/quest';
import { importRostersData, autoAssignSquadsForTesting, updateSystemSetting, addTempQuest, toggleTempQuest, deleteTempQuest } from '@/app/actions/admin';
import { getSquadMembersStats, getBattalionMembersStats } from '@/app/actions/team';
import { SquadMemberStats } from '@/types';
import { reviewBonusBySquadLeader, reviewBonusByAdmin, getBonusApplications, getAdminActivityLog } from '@/app/actions/bonus';
import { NineGridTab } from '@/components/Tabs/NineGridTab';
import { getMemberGrid, initMemberGrid, updateUserFortunes } from '@/app/actions/nine-grid';
import { loginWithPhone, registerAccount, logoutUser } from '@/app/actions/auth';
import { FORTUNE_COMPANIONS, getLowestFortune } from '@/components/Login/RegisterForm';
import { UserNineGrid } from '@/types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder_key';
const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

const SESSION_UID_KEY = 'session_uid';
const SESSION_EXP_KEY = 'session_exp';
const SESSION_DURATION_MS = 30 * 60 * 1000; // 30 分鐘

function logsDateCutoff() {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
}

function saveSession(userId: string) {
  localStorage.setItem(SESSION_UID_KEY, userId);
  localStorage.setItem(SESSION_EXP_KEY, String(Date.now() + SESSION_DURATION_MS));
}
function clearSession() {
  localStorage.removeItem(SESSION_UID_KEY);
  localStorage.removeItem(SESSION_EXP_KEY);
}
function getStoredSession(): string | null {
  const uid = localStorage.getItem(SESSION_UID_KEY);
  const exp = localStorage.getItem(SESSION_EXP_KEY);
  if (uid && exp && Date.now() < parseInt(exp)) return uid;
  clearSession();
  return null;
}

const MessageBox = ({ message, onClose, type = 'info' }: { message: string, onClose: () => void, type?: 'info' | 'error' | 'success' }) => (
  <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-[#1A2A1A]/70 backdrop-blur-sm animate-in fade-in duration-300">
    <div className="bg-white border-2 p-8 rounded-[2.5rem] shadow-2xl max-w-sm w-full text-center space-y-6 flex flex-col items-center"
      style={{ borderColor: type === 'error' ? '#C0392B' : type === 'success' ? '#1A6B4A' : '#F5C842' }}>
      <div className={`w-20 h-20 rounded-full flex items-center justify-center ${type === 'error' ? 'bg-red-50 text-[#C0392B]' : type === 'success' ? 'bg-[#EDF7F1] text-[#1A6B4A]' : 'bg-[#FFFBEB] text-[#8B6914]'}`}>
        {type === 'error' ? <AlertTriangle size={40} /> : type === 'success' ? <CheckCircle2 size={40} /> : <Sparkles size={40} />}
      </div>
      <p className="font-display text-xl font-bold text-[#1A2A1A] leading-relaxed">{message}</p>
      <button onClick={onClose}
        className="w-full py-4 text-white font-black rounded-2xl transition-all active:scale-95 shadow-lg"
        style={{ background: type === 'error' ? '#C0392B' : type === 'success' ? '#1A6B4A' : '#F5C842', color: type === 'info' ? '#1A2A1A' : 'white' }}>
        了解，繼續旅程
      </button>
    </div>
  </div>
);

export default function App() {
  const [view, setView] = useState<'login' | 'register' | 'app' | 'loading' | 'admin'>('loading');
  const [isSyncing, setIsSyncing] = useState(false);
  const [lineBannerDismissed, setLineBannerDismissed] = useState(false);
  const [activeTab, setActiveTab] = useState<'daily' | 'weekly' | 'stats' | 'rank' | 'captain' | 'commandant' | 'course' | 'ninegrid'>('daily');
  const [userGrid, setUserGrid] = useState<UserNineGrid | null>(null);
  type GmViewMode = 'all' | 'player' | 'captain' | 'commandant';
  const [gmViewMode, setGmViewMode] = useState<GmViewMode>('all');
  const [userData, setUserData] = useState<CharacterStats | null>(null);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [leaderboard, setLeaderboard] = useState<CharacterStats[]>([]);
  const [temporaryQuests, setTemporaryQuests] = useState<TemporaryQuest[]>([]);
  const [systemSettings, setSystemSettings] = useState<SystemSettings>({});
  const [modalMessage, setModalMessage] = useState<{ text: string, type: 'info' | 'error' | 'success' } | null>(null);
  const [undoTarget, setUndoTarget] = useState<Quest | null>(null);
  const [adminAuth, setAdminAuth] = useState(false);
  const [teamSettings, setTeamSettings] = useState<TeamSettings | null>(null);
  const [teamMemberCount, setTeamMemberCount] = useState<number>(1);

  const [pendingBonusApps, setPendingBonusApps] = useState<BonusApplication[]>([]);
  const [myBonusApps, setMyBonusApps] = useState<BonusApplication[]>([]);

  const [pendingFinalReviewApps, setPendingFinalReviewApps] = useState<BonusApplication[]>([]);
  const [adminLogs, setAdminLogs] = useState<AdminLog[]>([]);

  const [squadMembers, setSquadMembers] = useState<SquadMemberStats[]>([]);
  const [squadMembersLoaded, setSquadMembersLoaded] = useState(false);
  const [battalionMembers, setBattalionMembers] = useState<Record<string, SquadMemberStats[]>>({});

  // LINE login progress flag to prevent flash of login page during async DB work
  const lineLoginInProgress = useRef(false);
  const rankFetchedAt = useRef(0);

  const showCaptainTab = userData?.IsGM
    ? (gmViewMode === 'all' || gmViewMode === 'captain')
    : !!userData?.IsCaptain;
  const showCommandantTab = userData?.IsGM
    ? (gmViewMode === 'all' || gmViewMode === 'commandant')
    : !!userData?.IsCommandant;

  const formatCheckInTime = (timestamp: string) => {
    const d = new Date(timestamp);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  // 每分鐘自動刷新「今天 / 本週一」的邏輯日期（跨午夜不需手動 reload）
  const { logicalTodayStr, currentWeeklyMonday } = useLogicalDate();


  const isTopicDone = useMemo(() =>
    logs.some(l => l.QuestID === 't1' && new Date(l.Timestamp) >= currentWeeklyMonday),
    [logs, currentWeeklyMonday]
  );


  const refreshBonusApps = useCallback(async (stats: CharacterStats) => {
    const tasks: Promise<void>[] = [];
    if (stats.IsCaptain && stats.TeamName) {
      tasks.push(
        getBonusApplications({ squadName: stats.TeamName, status: 'pending' })
          .then(r => { if (r.success) setPendingBonusApps(r.applications); })
      );
    }
    if (stats.IsCommandant) {
      tasks.push(
        getBonusApplications({ status: 'squad_approved' })
          .then(r => { if (r.success) setPendingFinalReviewApps(r.applications); })
      );
    }
    await Promise.all(tasks);
  }, []);

  const refreshAdminLogs = useCallback(async () => {
    const res = await getAdminActivityLog(30);
    if (res.success) setAdminLogs(res.logs as AdminLog[]);
  }, []);

  const loadAdminData = useCallback(async () => {
    const [w4Res, logsRes] = await Promise.all([
      getBonusApplications({ status: 'squad_approved' }),
      getAdminActivityLog(30),
    ]);
    if (w4Res.success) setPendingFinalReviewApps(w4Res.applications);
    if (logsRes.success) setAdminLogs(logsRes.logs as AdminLog[]);
  }, []);

  const handleAdminAuth = async (e: { preventDefault: () => void; currentTarget: HTMLFormElement }) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const pw = String(fd.get('password') ?? '');
    const res = await loginAdmin(pw);
    if (res.success) {
      setAdminAuth(true);
      await loadAdminData();
    } else {
      setModalMessage({ text: "密令錯誤，大會禁地不可擅闖。", type: 'error' });
    }
  };

  const handleImportRoster = async (csvData: string) => {
    setIsSyncing(true);
    try {
      const res = await importRostersData(csvData);
      if (res.success) {
        setModalMessage({ text: `成功匯入！共新增/更新了 ${res.count} 筆名冊資料。`, type: 'success' });
      } else {
        setModalMessage({ text: `匯入失敗：${res.error}`, type: 'error' });
      }
    } catch (err: any) {
      setModalMessage({ text: `系統異常：${err.message}`, type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleOpenCaptainTab = () => {
    // 已在 captain tab 且資料已載入 → 只切換不重抓，避免重複點擊重發 server action
    const alreadyLoaded = activeTab === 'captain' && squadMembersLoaded;
    setActiveTab('captain');
    if (alreadyLoaded) return;
    if ((userData?.IsCaptain || userData?.IsGM) && userData?.UserID) {
      setSquadMembersLoaded(false);
      getSquadMembersStats(userData.UserID).then(res => {
        if (res.success && res.members) setSquadMembers(res.members);
        setSquadMembersLoaded(true);
      });
      if (userData.TeamName) {
        getBonusApplications({ squadName: userData.TeamName, status: 'pending' })
          .then(r => { if (r.success) setPendingBonusApps(r.applications); });
      }
    }
  };

  const handleOpenCommandantTab = () => {
    // 同 captain：避免重複點擊
    const alreadyLoaded = activeTab === 'commandant' && Object.keys(battalionMembers).length > 0;
    setActiveTab('commandant');
    if (alreadyLoaded) return;
    if ((userData?.IsCommandant || userData?.IsGM) && userData?.UserID) {
      getBattalionMembersStats(userData.UserID).then(res => {
        if (res.success && res.members) setBattalionMembers(res.members);
      });
    }
  };

  const handleAutoAssignSquads = async () => {
    if (!confirm("確定要將所有旅人隨機分配大隊 / 小隊？（每隊 4 人，3 隊一大隊，會覆蓋現有編組）")) return;
    setIsSyncing(true);
    try {
      const res = await autoAssignSquadsForTesting();
      if (res.success) {
        setModalMessage({ text: `分配完成！共 ${res.totalPlayers} 位旅人，${res.squadCount} 支小隊，${res.battalionCount} 個大隊。`, type: 'success' });
      } else {
        setModalMessage({ text: '分配失敗：' + res.error, type: 'error' });
      }
    } catch (e: any) {
      setModalMessage({ text: '系統異常：' + e.message, type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  const updateGlobalSetting = async (key: string, value: string) => {
    setIsSyncing(true);
    try {
      const res = await updateSystemSetting(key, value);
      if (!res.success) throw new Error(res.error);
      setSystemSettings(prev => ({ ...prev, [key]: value }));
      setModalMessage({ text: "設定已同步，所有成員將即時看到更新。", type: 'success' });
    } catch (err: any) {
      setModalMessage({ text: "同步失敗：" + (err?.message ?? '法陣連線異常'), type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAddAnnouncement = async (text: string) => {
    const newItem = {
      id: `ann_${Date.now()}`,
      text: text.trim(),
      created_at: new Date().toISOString(),
    };
    const newList = [newItem, ...(systemSettings.Announcements ?? [])];
    setIsSyncing(true);
    try {
      const res = await updateSystemSetting('Announcements', JSON.stringify(newList));
      if (!res.success) throw new Error(res.error);
      setSystemSettings(prev => ({ ...prev, Announcements: newList }));
      setModalMessage({ text: '公告已發布。', type: 'success' });
    } catch (err: any) {
      setModalMessage({ text: '同步失敗：' + (err?.message ?? '法陣連線異常'), type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    const newList = (systemSettings.Announcements ?? []).filter(a => a.id !== id);
    setIsSyncing(true);
    try {
      const res = await updateSystemSetting('Announcements', JSON.stringify(newList));
      if (!res.success) throw new Error(res.error);
      setSystemSettings(prev => ({ ...prev, Announcements: newList }));
      setModalMessage({ text: '公告已刪除。', type: 'success' });
    } catch (err: any) {
      setModalMessage({ text: '同步失敗：' + (err?.message ?? '法陣連線異常'), type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAddTempQuest = async (title: string, sub: string, desc: string, reward: number) => {
    setIsSyncing(true);
    try {
      const res = await addTempQuest(title, sub, desc, reward);
      if (!res.success || !res.id) throw new Error(res.error);
      const newQuest: TemporaryQuest = { id: res.id, title, sub, desc, reward, limit: 1, active: true };
      setTemporaryQuests(prev => [newQuest, ...prev]);
    } catch (err: any) {
      console.error(err);
      setModalMessage({ text: "新增臨時任務失敗：" + (err?.message ?? ''), type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleToggleTempQuest = async (id: string, active: boolean) => {
    setIsSyncing(true);
    try {
      const res = await toggleTempQuest(id, active);
      if (!res.success) throw new Error(res.error);
      setTemporaryQuests(prev => prev.map(q => q.id === id ? { ...q, active } : q));
    } catch (err: any) {
      setModalMessage({ text: "更新臨時任務狀態失敗：" + (err?.message ?? ''), type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteTempQuest = async (id: string) => {
    if (!confirm("確定要刪除此臨時任務嗎？刪除後無法恢復。")) return;
    setIsSyncing(true);
    try {
      const res = await deleteTempQuest(id);
      if (!res.success) throw new Error(res.error);
      setTemporaryQuests(prev => prev.filter(q => q.id !== id));
    } catch (err: any) {
      setModalMessage({ text: "刪除臨時任務失敗：" + (err?.message ?? ''), type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleReviewBonusBySquad = useCallback(async (appId: string, approve: boolean, notes: string) => {
    if (!userData) return;
    const res = await reviewBonusBySquadLeader(appId, userData.UserID, approve, notes);
    if (res.success) {
      setPendingBonusApps(prev => prev.filter(a => a.id !== appId));
      if (approve) {
        const finalRes = await getBonusApplications({ status: 'squad_approved' });
        if (finalRes.success) setPendingFinalReviewApps(finalRes.applications);
      }
      setModalMessage({ text: approve ? '初審通過！' : '已駁回申請。', type: approve ? 'success' : 'info' });
    } else {
      setModalMessage({ text: res.error || '審核失敗', type: 'error' });
    }
  }, [userData]);

  const handleFinalReviewBonus = useCallback(async (appId: string, approve: boolean, notes: string) => {
    const res = await reviewBonusByAdmin(appId, approve ? 'approve' : 'reject', notes);
    if (res.success) {
      setPendingFinalReviewApps(prev => prev.filter(a => a.id !== appId));
      setModalMessage({ text: approve ? '已核准！積分已發放。' : '已駁回申請。', type: approve ? 'success' : 'info' });
      await refreshAdminLogs();
    } else {
      setModalMessage({ text: (res as any).error || '審核失敗', type: 'error' });
    }
  }, [refreshAdminLogs]);

  const handleCheckInAction = useCallback(async (quest: Quest) => {
    if (!userData) return;
    setIsSyncing(true);
    try {
      const res = await processCheckInTransaction(userData.UserID, quest.id, quest.title, quest.reward);

      if (res.success) {
        // 樂觀更新：立即把新 log 加入 state，chip 即時顯示完成
        const optimisticLog: DailyLog = {
          Timestamp: new Date().toISOString(),
          UserID: userData.UserID,
          QuestID: quest.id,
          QuestTitle: quest.title,
          RewardPoints: quest.reward,
        };
        if (res.user) setUserData(res.user as CharacterStats);
        setLogs(prev => [...prev, optimisticLog]);
        // 背景同步：只有 DB 回傳的筆數 > 現有 state 才更新，避免短暫空值覆蓋樂觀更新
        supabase.from('DailyLogs').select('*').eq('UserID', userData.UserID).gte('Timestamp', logsDateCutoff())
          .then(({ data }) => {
            if (data && data.length > 0) setLogs(data as DailyLog[]);
          });
        setModalMessage(res.rewardCapped
          ? { text: "今日積分已達上限，本次不計分。", type: 'info' }
          : { text: "旅程已記錄，積分入帳！", type: 'success' }
        );
      } else {
        // Sync logs so client state reflects server state (e.g. quest already done)
        const { data: syncedLogs } = await supabase.from('DailyLogs').select('*').eq('UserID', userData.UserID).gte('Timestamp', logsDateCutoff());
        if (syncedLogs) setLogs(syncedLogs as DailyLog[]);
        setModalMessage({ text: res.error || "記錄失敗，請稍後再試。", type: 'error' });
      }
    } catch (err: any) {
      setModalMessage({ text: err?.message ? `記錄失敗：${err.message}` : "記錄失敗，請稍後再試。", type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  }, [userData]);

  const handleUndoCheckInAction = async (quest: Quest | null) => {
    if (!userData || !quest) return;
    setIsSyncing(true);
    try {
      const res = await undoCheckIn(userData.UserID, quest.id);
      if (res.success) {
        const { data: newLogs } = await supabase.from('DailyLogs').select('*')
          .eq('UserID', userData.UserID).gte('Timestamp', logsDateCutoff());
        setLogs((newLogs as DailyLog[]) || []);
        setUserData(prev => prev ? { ...prev, Score: res.newScore! } : prev);
        setUndoTarget(null);
        setModalMessage({ text: "時光回溯成功，紀錄已取消。", type: 'success' });
      } else {
        setModalMessage({ text: res.error || "回溯失敗，請稍後再試。", type: res.error?.includes('今日') ? 'info' : 'error' });
        setUndoTarget(null);
      }
    } catch (err) {
      setModalMessage({ text: "回溯失敗，請稍後再試。", type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleClearTodayLogs = async () => {
    if (!userData) return;
    if (!confirm("確定要清除今日所有打卡紀錄重新填寫嗎？\n注意：這會清空今天已送出的所有通告。")) return;
    
    // Check if after 12:00 PM
    const now = new Date();
    if (now.getHours() >= 12 && now.getHours() < 24) {
       setModalMessage({ text: "今日截稿時間已過 (12:00)，無法重新填寫。", type: 'error' });
       return;
    }

    setIsSyncing(true);
    try {
      const res = await clearTodayLogs(userData.UserID);
      if (res.success) {
        // Fetch fresh stats and logs
        const { data: stats } = await supabase.from('CharacterStats').select('*').eq('UserID', userData.UserID).single();
        const { data: userLogs } = await supabase.from('DailyLogs').select('*').eq('UserID', userData.UserID).gte('Timestamp', logsDateCutoff());
        if (stats) setUserData(stats as CharacterStats);
        if (userLogs) setLogs(userLogs as DailyLog[]);
        setModalMessage({ text: "今日紀錄已清空，可重新一鍵填寫。", type: 'success' });
      } else {
        setModalMessage({ text: "清除失敗：" + res.error, type: 'error' });
      }
    } catch (err) {
      setModalMessage({ text: "系統異常", type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSyncing(true);
    const fd = new FormData(e.currentTarget);
    const name = (fd.get('name') as string).trim();
    const phoneSuffix = (fd.get('phone') as string).trim();
    try {
      const res = await loginWithPhone(name, phoneSuffix);
      if (res.success && res.stats) {
        await loadUserSession(res.stats);
        saveSession(res.stats.UserID);
        setView('app');
      } else {
        setModalMessage({ text: res.error || '查無此觀影者帳號。', type: 'error' });
      }
    } catch (err) { setModalMessage({ text: "系統連線異常。", type: 'error' }); } finally { setIsSyncing(false); }
  };

  const handleRegisterInput = async (data: any) => {
    setIsSyncing(true);
    const { name, phone: phoneRaw, email: emailRaw, fortunes } = data;

    try {
      const res = await registerAccount({
        name,
        phone: phoneRaw,
        email: emailRaw,
        fortunes,
      });
      if (!res.success || !res.stats || !res.userId) {
        setModalMessage({ text: res.error || '註冊失敗', type: 'error' });
        return;
      }

      if (fortunes) {
        const gridRes = await getMemberGrid(res.userId);
        if (gridRes.success) setUserGrid(gridRes.grid);
      }

      saveSession(res.userId);
      setUserData(res.stats);
      setModalMessage({ text: '帳號建立成功，開始你的黃磚路旅程！', type: 'success' });
      setView('app');
    } catch (err) {
      setModalMessage({ text: '註冊失敗。可能該手機號碼已經建立過帳號。', type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };



  const handleLogout = async () => {
    await logoutUser();
    clearSession();
    setUserData(null);
    setView('login');
  };

  const handleAdminClose = async () => {
    await logoutAdmin();
    setAdminAuth(false);
    setView(userData ? 'app' : 'login');
  };

  // Restore admin session from HttpOnly cookie when entering admin view
  useEffect(() => {
    if (view !== 'admin' || adminAuth) return;
    let cancelled = false;
    (async () => {
      const ok = await verifyAdminSession();
      if (cancelled || !ok) return;
      setAdminAuth(true);
      await loadAdminData();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // One-time static data load — settings, history
  useEffect(() => {
    const loadStaticData = async () => {
      const { data: settingsData } = await supabase.from('SystemSettings').select('*');
      if (settingsData) {
        type SettingRow = { SettingName: string; Value: string };
        const sObj = (settingsData as SettingRow[]).reduce<Record<string, string>>(
          (acc, curr) => ({ ...acc, [curr.SettingName]: curr.Value }),
          {}
        );

        const tryParseJson = <T,>(raw: string | undefined): T | undefined => {
          if (!raw) return undefined;
          try { return JSON.parse(raw) as T; } catch { return undefined; }
        };

        // 字串欄位以 spread 自動帶入（將來新增字串型 setting 無需修這裡）；
        // JSON 欄位顯式 parse；型別受限的 enum 欄位顯式 cast。
        setSystemSettings({
          ...(sObj as Partial<SystemSettings>),
          RegistrationMode: (sObj.RegistrationMode as 'open' | 'roster') || 'open',
          QuestRewardOverrides: tryParseJson<SystemSettings['QuestRewardOverrides']>(sObj.QuestRewardOverrides),
          DisabledQuests: tryParseJson<SystemSettings['DisabledQuests']>(sObj.DisabledQuests),
          CourseEvents: tryParseJson<SystemSettings['CourseEvents']>(sObj.CourseEvents),
          Announcements: tryParseJson<SystemSettings['Announcements']>(sObj.Announcements),
        });
      }

      const { data: tempQuestsData } = await supabase.from('temporaryquests').select('*').order('created_at', { ascending: false });
      if (tempQuestsData) {
        const parsed = tempQuestsData.map((t: any) => ({ ...t, limit: t.limit_count }));
        setTemporaryQuests(parsed as TemporaryQuest[]);
      }
    };
    loadStaticData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 載入使用者資料並進入 app 視圖的共用邏輯
  const loadUserSession = useCallback(async (stats: CharacterStats) => {
    // 基本資料全部並行：DailyLogs + 小隊人數 + TeamSettings
    const [logsRes, teamCountRes, tSettingsRes] = await Promise.all([
      supabase.from('DailyLogs').select('*').eq('UserID', stats.UserID).gte('Timestamp', logsDateCutoff()),
      stats.TeamName
        ? supabase.from('CharacterStats').select('*', { count: 'exact', head: true }).eq('TeamName', stats.TeamName)
        : Promise.resolve({ count: null }),
      stats.TeamName
        ? supabase.from('TeamSettings').select('*').eq('team_name', stats.TeamName).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    setLogs((logsRes.data as DailyLog[]) || []);
    if (stats.TeamName) {
      setTeamMemberCount(teamCountRes.count || 1);
      if (tSettingsRes.data) setTeamSettings(tSettingsRes.data as TeamSettings);
    }
    // 立即顯示 app，不等 bonus apps
    setUserData(stats);
    // BonusApplications 在背景非同步載入（不阻塞進入主畫面）
    Promise.all([
      refreshBonusApps(stats),
      getBonusApplications({ userId: stats.UserID, questIdPrefix: 'o' })
        .then(r => { if (r.success) setMyBonusApps(r.applications); }),
    ]).catch(() => {});
  }, [refreshBonusApps]);

  // LINE OAuth callback 處理：?line_auth=1
  const handleLineOAuthCallback = useCallback(async (): Promise<boolean> => {
    lineLoginInProgress.current = true;
    const sessionRes = await fetch('/api/auth/session');
    if (!sessionRes.ok) {
      lineLoginInProgress.current = false;
      setView('login');
      return true;
    }
    const { userId } = await sessionRes.json();
    const { data: stats, error } = await supabase.from('CharacterStats').select('*').eq('UserID', userId).single();
    if (stats && !error) {
      await loadUserSession(stats as CharacterStats);
      saveSession(userId);
      lineLoginInProgress.current = false;
      setView('app');
    } else {
      lineLoginInProgress.current = false;
      setView('login');
    }
    return true;
  }, [loadUserSession]);

  // localStorage session 恢復
  const restoreSessionFromStorage = useCallback(async (): Promise<boolean> => {
    const storedUid = getStoredSession();
    if (!storedUid) return false;
    const { data: stats, error } = await supabase.from('CharacterStats').select('*').eq('UserID', storedUid).single();
    if (stats && !error) {
      await loadUserSession(stats as CharacterStats);
      saveSession(storedUid);
      setView('app');
      return true;
    }
    clearSession();
    return false;
  }, [loadUserSession]);

  useEffect(() => {
    const init = async () => {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const lineAuth = params.get('line_auth');
        const lineBound = params.get('line_bound');
        const lineError = params.get('line_error');
        if (lineAuth || lineBound || lineError) {
          window.history.replaceState({}, '', '/');
          if (lineAuth === '1') {
            await handleLineOAuthCallback();
            return;
          } else if (lineBound === 'success') {
            setModalMessage({ text: '✅ LINE 帳號綁定成功！下次可直接以 LINE 登入。', type: 'success' });
          } else if (lineError === 'not_bound') {
            setModalMessage({ text: '此 LINE 帳號尚未綁定任何遊戲帳號，請先以姓名 + 手機末三碼登入後再進行綁定。', type: 'error' });
          } else if (lineError === 'already_bound') {
            setModalMessage({ text: '此 LINE 帳號已綁定其他玩家帳號。', type: 'error' });
          } else if (lineError === 'cancelled') {
            // User cancelled LINE auth — silent, no message
          } else if (lineError) {
            setModalMessage({ text: `LINE 登入發生錯誤（${lineError}），請稍後再試。`, type: 'error' });
          }
        }
      }

      if (!lineLoginInProgress.current) {
        const restored = await restoreSessionFromStorage();
        if (!restored) setView(v => v === 'loading' ? 'login' : v);
      }
    };
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  // 排行榜：5 分鐘快取（舊值仍可顯示，避免高峰期頻繁重拉）；活動規模 200 人，加 limit 防萬一
  useEffect(() => {
    const shouldFetch = activeTab === 'rank' || view === 'admin';
    if (!shouldFetch) return;
    if (Date.now() - rankFetchedAt.current < 5 * 60_000) return;
    rankFetchedAt.current = Date.now();
    supabase
      .from('CharacterStats')
      .select('UserID, Name, Score, Streak, SquadName, TeamName, IsCaptain, IsCommandant, IsGM, LineUserId')
      .order('Score', { ascending: false })
      .limit(500)
      .then(({ data }) => { if (data) setLeaderboard(data as CharacterStats[]); });
  }, [activeTab, view]);

  useEffect(() => {
    if (activeTab === 'captain' && !showCaptainTab) setActiveTab('daily');
    if (activeTab === 'commandant' && !showCommandantTab) setActiveTab('daily');
  }, [gmViewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (userData?.Score != null) {
      localStorage.setItem('oz_score', String(userData.Score));
    }
  }, [userData?.Score]);

  useEffect(() => {
    if (!userData?.UserID) return;
    getMemberGrid(userData.UserID).then(r => { if (r.success) setUserGrid(r.grid); });
  }, [userData?.UserID]);

  const GmToolbar = () => {
    if (!userData?.IsGM) return null;
    const modes: { label: string; value: GmViewMode }[] = [
      { label: '全部', value: 'all' },
      { label: '一般成員', value: 'player' },
      { label: '小隊長', value: 'captain' },
      { label: '大隊長', value: 'commandant' },
    ];
    return (
      <div className="bg-amber-950/80 border-b-2 border-amber-500/60 px-4 py-2 flex items-center gap-3 flex-wrap">
        <span className="text-amber-400 text-[10px] font-black tracking-widest shrink-0">⚙ GM模式</span>
        <div className="flex gap-2 flex-wrap">
          {modes.map(m => (
            <button
              key={m.value}
              onClick={() => setGmViewMode(m.value)}
              className={`px-3 py-1 rounded-xl text-[10px] font-black transition-all ${
                gmViewMode === m.value
                  ? 'bg-amber-500 text-black'
                  : 'bg-slate-800 text-amber-400/70 hover:bg-slate-700'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const HomeView = () => (
    <div className="min-h-screen bg-[#FFFEF5] text-[#1A2A1A] pb-40 text-center animate-in fade-in">
      <Header userData={userData} onLogout={handleLogout} companionType={userGrid?.companion_type} />
      {GmToolbar()}

      {/* LINE 綁定提示 Banner */}
      {userData && !userData.LineUserId && !lineBannerDismissed && (
        <div className="flex items-center gap-3 px-4 py-3 bg-[#06C755]/10 border-b border-[#06C755]/20 text-sm">
          <span className="text-[#06C755] font-black shrink-0">LINE</span>
          <span className="flex-1 text-left text-gray-700 text-xs">尚未綁定 LINE 帳號，綁定後可直接以 LINE 登入。</span>
          <a
            href={`/api/auth/line?action=bind&uid=${encodeURIComponent(userData.UserID)}`}
            className="shrink-0 px-3 py-1 rounded-lg bg-[#06C755] text-white text-xs font-black active:scale-95 transition-all"
          >
            立即綁定
          </a>
          <button
            onClick={() => setLineBannerDismissed(true)}
            className="shrink-0 text-slate-600 hover:text-slate-400 text-lg leading-none"
          >
            ×
          </button>
        </div>
      )}

      <nav className="sticky top-0 z-20 bg-[#1A6B4A] flex p-3 gap-2 border-b border-[#0F4A30] shadow-xl overflow-x-auto no-scrollbar">
        {([
          { id: 'daily',    label: '每日踏程', icon: <RubySlipperIcon size={13} /> },
          { id: 'weekly',   label: '旅伴週報', icon: <MegaphoneIcon size={13} /> },
          { id: 'ninegrid', label: '人生大戲', icon: <LayoutGrid size={13} /> },
          { id: 'rank',     label: '旅人榜',   icon: <Trophy size={13} /> },
          { id: 'stats',    label: '我的旅程', icon: <Glasses3DIcon size={13} /> },
        ] as const).map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`shrink-0 flex items-center gap-1.5 px-5 py-3 rounded-full text-xs font-bold transition-all duration-200 active:scale-95 cursor-pointer
              ${activeTab === id
                ? 'bg-[#C0392B] text-white shadow-[0_0_15px_rgba(192,57,43,0.4)]'
                : 'bg-[#1A6B4A]/70 text-white/80 hover:text-white hover:bg-[#0F4A30]'}`}
          >
            {icon}
            {label}
          </button>
        ))}
        <button
          onClick={() => setActiveTab('course')}
          className={`shrink-0 flex items-center gap-1.5 px-5 py-3 rounded-full text-xs font-bold transition-all duration-200 active:scale-95 cursor-pointer
            ${activeTab === 'course'
              ? 'bg-[#C0392B] text-white shadow-[0_0_15px_rgba(192,57,43,0.4)]'
              : 'bg-[#1A6B4A]/70 text-white/80 hover:text-white hover:bg-[#0F4A30]'}`}
        >
          <CalendarDays size={13} />
          親證曆
        </button>
        {showCaptainTab && (
          <button
            onClick={handleOpenCaptainTab}
            className={`shrink-0 flex items-center gap-1.5 px-5 py-3 rounded-full text-xs font-bold transition-all duration-200 active:scale-95 cursor-pointer
              ${activeTab === 'captain'
                ? 'bg-[#F5C842] text-black shadow-[0_0_15px_rgba(245,200,66,0.4)]'
                : 'bg-[#1A6B4A]/70 text-white/80 hover:text-white hover:bg-[#0F4A30]'}`}
          >
            <StarWandIcon size={13} />
            隊長基地
          </button>
        )}
        {showCommandantTab && (
          <button
            onClick={handleOpenCommandantTab}
            className={`shrink-0 flex items-center gap-1.5 px-5 py-3 rounded-full text-xs font-bold transition-all duration-200 active:scale-95 cursor-pointer
              ${activeTab === 'commandant'
                ? 'bg-[#F5C842] text-black shadow-[0_0_15px_rgba(245,200,66,0.4)]'
                : 'bg-[#1A6B4A]/70 text-white/80 hover:text-white hover:bg-[#0F4A30]'}`}
          >
            <EmeraldCastleIcon size={13} />
            大隊長總部
          </button>
        )}
      </nav>

      <main className="max-w-md mx-auto p-6 space-y-8">
        {systemSettings?.Announcements && systemSettings.Announcements.length > 0 && (
          <div className="space-y-2">
            {systemSettings.Announcements.map(item => (
              <div
                key={item.id}
                className="flex items-start gap-2 bg-amber-400/20 border border-amber-500/50 rounded-2xl px-4 py-3 text-sm text-amber-900"
              >
                <span className="shrink-0 mt-0.5">📢</span>
                <span className="leading-relaxed">{item.text}</span>
              </div>
            ))}
          </div>
        )}
        {activeTab === 'daily' && (
          <DailyQuestsTab
            userId={userData?.UserID || ''}
            logs={logs}
            logicalTodayStr={logicalTodayStr}
            onCheckIn={handleCheckInAction}
            onUndo={setUndoTarget}
            onClearTodayLogs={handleClearTodayLogs}
            formatCheckInTime={formatCheckInTime}
            questRewardOverrides={systemSettings?.QuestRewardOverrides}
            disabledQuests={systemSettings?.DisabledQuests}
          />
        )}
        {activeTab === 'weekly' && userData && (
          <WeeklyTopicTab
            logs={logs}
            currentWeeklyMonday={currentWeeklyMonday}
            temporaryQuests={temporaryQuests.filter(t => t.active)}
            onCheckIn={handleCheckInAction}
            onUndo={setUndoTarget}
            questRewardOverrides={systemSettings?.QuestRewardOverrides}
            disabledQuests={systemSettings?.DisabledQuests}
            userId={userData.UserID}
          />
        )}
        {activeTab === 'ninegrid' && userData && (
          <NineGridTab
            userId={userData.UserID}
            userName={userData.Name}
            userData={userData}
            grid={userGrid}
            onFortuneSave={async (fortunes) => {
              const updates: Record<string, number> = {};
              for (const f of FORTUNE_COMPANIONS) updates[f.dbCol] = fortunes[f.key] ?? 0;
              const res = await updateUserFortunes(userData.UserID, updates);
              if (!res.success) {
                setModalMessage({ text: '五運更新失敗：' + (res.error ?? ''), type: 'error' });
                return;
              }
              const lowestFortune = getLowestFortune(fortunes);
              await initMemberGrid(userData.UserID, lowestFortune.companion);
              const gridRes = await getMemberGrid(userData.UserID);
              if (gridRes.success) setUserGrid(gridRes.grid);
              setUserData(prev => prev ? { ...prev, ...updates } : prev);
            }}
            onRefresh={async () => {
              const [gridRes, statsRes] = await Promise.all([
                getMemberGrid(userData.UserID),
                supabase.from('CharacterStats').select('*').eq('UserID', userData.UserID).single(),
              ]);
              if (gridRes.success) setUserGrid(gridRes.grid);
              if (statsRes.data) setUserData(statsRes.data as CharacterStats);
            }}
            logs={logs}
            currentWeeklyMonday={currentWeeklyMonday}
            onCheckIn={handleCheckInAction}
            onUndo={setUndoTarget}
            questRewardOverrides={systemSettings?.QuestRewardOverrides}
            disabledQuests={systemSettings?.DisabledQuests}
          />
        )}
        {activeTab === 'rank' && <RankTab leaderboard={leaderboard} currentUserId={userData?.UserID} currentUser={userData ?? undefined} />}
        {activeTab === 'stats' && userData && (
          <StatsTab
            userData={userData}
            myBonusApps={myBonusApps}
            onBonusRefresh={() =>
              getBonusApplications({ userId: userData.UserID, questIdPrefix: 'o' })
                .then(r => { if (r.success) setMyBonusApps(r.applications); })
            }
          />
        )}
        {activeTab === 'captain' && showCaptainTab && userData && (
          <CaptainTab
            teamName={userData.TeamName || '未編組'}
            captainId={userData.UserID}
            captainName={userData.Name}
            teamSettings={teamSettings ?? undefined}
            pendingBonusApps={pendingBonusApps}
            onReviewBonus={handleReviewBonusBySquad}
            squadMembers={squadMembers}
            squadMembersLoaded={squadMembersLoaded}
          />
        )}
        {activeTab === 'commandant' && showCommandantTab && userData && (
          <CommandantTab
            userData={userData}
            apps={pendingFinalReviewApps}
            onRefresh={async () => {
              const res = await getBonusApplications({ status: 'squad_approved' });
              if (res.success) setPendingFinalReviewApps(res.applications);
            }}
            onShowMessage={(msg, type) => setModalMessage({ text: msg, type })}
            battalionMembers={battalionMembers}
          />
        )}
        {activeTab === 'course' && userData && (
          <CourseTab userData={userData} volunteerPassword={systemSettings.VolunteerPassword ?? ''} courseEvents={systemSettings.CourseEvents} />
        )}
      </main>


      {/* 進入影廳按鈕已依照需求移除 */}
    </div>
  );

  return (
    <div className="text-center justify-center mx-auto w-full font-sans">
      {view === 'loading' && (
        <div className="min-h-screen flex flex-col items-center justify-center p-10 text-center relative overflow-hidden"
          style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, #C8EDD5 0%, #E8F5EC 40%, #FFFEF5 100%)' }}>
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-[#F5C842]/[0.08] blur-3xl" />
            <div className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full bg-[#1A6B4A]/[0.06] blur-3xl" />
          </div>
          <div className="relative z-10 flex flex-col items-center gap-5">
            <StarWandIcon size={80} className="text-[#F5C842] animate-spin-slow drop-shadow-lg" />
            <div className="space-y-2">
              <p className="font-display text-2xl font-black text-[#1A6B4A]">踏上黃磚路…</p>
              <p className="text-sm text-[#5A7A5A] font-bold tracking-widest">旅程資料召喚中</p>
            </div>
          </div>
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
        <RegisterForm
          onRegister={handleRegisterInput}
          onGoToLogin={() => setView('login')}
          isSyncing={isSyncing}
        />
      )}


      {view === 'admin' && (
        <AdminDashboard
          adminAuth={adminAuth}
          onAuth={handleAdminAuth}
          systemSettings={systemSettings}
          updateGlobalSetting={updateGlobalSetting}
          leaderboard={leaderboard}
          temporaryQuests={temporaryQuests}
          pendingFinalReviewApps={pendingFinalReviewApps}
          adminLogs={adminLogs}
          onAddTempQuest={handleAddTempQuest}
          onToggleTempQuest={handleToggleTempQuest}
          onDeleteTempQuest={handleDeleteTempQuest}
          onImportRoster={handleImportRoster}
          onFinalReviewBonus={handleFinalReviewBonus}
          onAddAnnouncement={handleAddAnnouncement}
          onDeleteAnnouncement={handleDeleteAnnouncement}
          onClose={handleAdminClose}
        />
      )}

      {view === 'app' && HomeView()}

      {undoTarget && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center p-6 bg-slate-950/95 backdrop-blur-xl animate-in fade-in duration-200 text-center mx-auto">
          <div className="bg-slate-900 border-2 border-slate-800 p-8 rounded-[2.5rem] shadow-2xl max-w-sm w-full text-center space-y-6 mx-auto">
            <div className="w-20 h-20 rounded-full mx-auto flex items-center justify-center bg-orange-500/20 text-orange-500 mx-auto text-center"><RotateCcw size={40} className="animate-spin-slow" /></div>
            <h3 className="text-2xl font-black text-white text-center mx-auto">發動時光回溯？</h3><p className="text-slate-400 text-sm font-bold text-center mx-auto">這將會扣除本次獲得的 {undoTarget?.reward} 積分。</p>
            <div className="flex gap-4 text-center mx-auto"><button onClick={() => setUndoTarget(null)} className="flex-1 py-4 bg-slate-800 text-slate-500 font-black rounded-2xl text-center shadow-lg transition-all active:scale-95">保持現狀</button><button onClick={() => handleUndoCheckInAction(undoTarget)} className="flex-1 py-4 bg-orange-600 text-white font-black rounded-2xl shadow-xl active:scale-95 transition-all text-center mx-auto">確認回溯</button></div>
          </div>
        </div>
      )}

      {isSyncing && (
        <div className="fixed inset-0 bg-[#1A6B4A]/75 z-[1100] flex flex-col items-center justify-center gap-4 backdrop-blur-md">
          <StarWandIcon size={56} className="text-[#F5C842] animate-spin-slow drop-shadow-lg" />
          <p className="font-display text-[#F5C842] font-black tracking-widest text-lg">旅程同步中…</p>
        </div>
      )}

      {modalMessage && <MessageBox message={modalMessage.text} type={modalMessage.type} onClose={() => setModalMessage(null)} />}
    </div>
  );
}