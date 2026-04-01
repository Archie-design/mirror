"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import {
  AlertTriangle, CheckCircle2, Sparkles,
  Dice5, Loader2, RotateCcw,
  CalendarDays, Clapperboard, Video
} from 'lucide-react';

import { CharacterStats, DailyLog, Quest, SystemSettings, TopicHistory, TemporaryQuest, BonusApplication, AdminLog, Testimony, FinePaymentRecord, AngelCallPairingsData } from '@/types';
import { getLogicalDateStr, getWeeklyMonday } from '@/lib/utils/time';
import { standardizePhone } from '@/lib/utils/phone';
import { ADMIN_PASSWORD, calculateLevelFromExp } from '@/lib/constants';

import { Header } from '@/components/Layout/Header';
import { LoginForm } from '@/components/Login/LoginForm';
import { RegisterForm } from '@/components/Login/RegisterForm';
import { DailyQuestsTab } from '@/components/Tabs/DailyQuestsTab';
import { WeeklyTopicTab } from '@/components/Tabs/WeeklyTopicTab';
import { StatsTab } from '@/components/Tabs/StatsTab';
import { RankTab } from '@/components/Tabs/RankTab';
import { CaptainTab } from '@/components/Tabs/CaptainTab';
import { CommandantTab } from '@/components/Tabs/CommandantTab';
import CourseTab from '@/components/Tabs/CourseTab';
import { AdminDashboard } from '@/components/Admin/AdminDashboard';
import { processCheckInTransaction, clearTodayLogs } from '@/app/actions/quest';
import { importRostersData, autoAssignSquadsForTesting, logAdminAction, runAngelCallPairing } from '@/app/actions/admin';
import { getTestimonies } from '@/app/actions/testimonies_admin';
import { drawWeeklyQuestForSquad, autoDrawAllSquads, getSquadMembersStats, getBattalionMembersStats } from '@/app/actions/team';
import { SquadMemberStats } from '@/types';
import { submitInterviewApplication, reviewBonusBySquadLeader, reviewBonusByAdmin, getBonusApplications, getAdminActivityLog, submitBonusApplication } from '@/app/actions/bonus';
import { getSquadFineStatus, recordFinePayment, setPaidToCaptainDate, getSquadFinePaymentHistory, checkSquadFineCompliance, recordOrgSubmission, getSquadOrgSubmissions, getLastComplianceRun } from '@/app/actions/fines';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder_key';
const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

const MessageBox = ({ message, onClose, type = 'info' }: { message: string, onClose: () => void, type?: 'info' | 'error' | 'success' }) => (
  <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-sm animate-in fade-in duration-300 mx-auto text-center">
    <div className="bg-slate-900 border-2 border-slate-800 p-8 rounded-[2.5rem] shadow-2xl max-w-sm w-full text-center space-y-6 mx-auto flex flex-col items-center">
      <div className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center ${type === 'error' ? 'bg-red-500/20 text-red-500' : type === 'success' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-blue-500/20 text-blue-500'}`}>
        {type === 'error' ? <AlertTriangle size={40} /> : type === 'success' ? <CheckCircle2 size={40} /> : <Sparkles size={40} />}
      </div>
      <p className="text-xl font-bold text-white leading-relaxed text-center mx-auto">{message}</p>
      <button onClick={onClose} className="w-full py-4 bg-orange-600 hover:bg-orange-500 text-white font-black rounded-2xl transition-all active:scale-95 shadow-lg text-center mx-auto">確認劇本</button>
    </div>
  </div>
);

export default function App() {
  const [view, setView] = useState<'login' | 'register' | 'app' | 'loading' | 'admin'>('loading');
  const [isSyncing, setIsSyncing] = useState(false);
  const [lineBannerDismissed, setLineBannerDismissed] = useState(false);
  const [activeTab, setActiveTab] = useState<'daily' | 'weekly' | 'stats' | 'rank' | 'captain' | 'commandant' | 'course'>('daily');
  type GmViewMode = 'all' | 'player' | 'captain' | 'commandant';
  const [gmViewMode, setGmViewMode] = useState<GmViewMode>('all');
  const [userData, setUserData] = useState<CharacterStats | null>(null);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [leaderboard, setLeaderboard] = useState<CharacterStats[]>([]);
  const [topicHistory, setTopicHistory] = useState<TopicHistory[]>([]);
  const [temporaryQuests, setTemporaryQuests] = useState<TemporaryQuest[]>([]);
  const [systemSettings, setSystemSettings] = useState<SystemSettings>({ TopicQuestTitle: '載入中...' });
  const [modalMessage, setModalMessage] = useState<{ text: string, type: 'info' | 'error' | 'success' } | null>(null);
  const [undoTarget, setUndoTarget] = useState<Quest | null>(null);
  const [adminAuth, setAdminAuth] = useState(false);
  const [angelCallPairings, setAngelCallPairings] = useState<AngelCallPairingsData | null>(null);
  const [teamSettings, setTeamSettings] = useState<any>(null);
  const [teamMemberCount, setTeamMemberCount] = useState<number>(1);

  const [myBonusApps, setMyBonusApps] = useState<BonusApplication[]>([]);
  const [pendingBonusApps, setPendingBonusApps] = useState<BonusApplication[]>([]);

  const [pendingFinalReviewApps, setPendingFinalReviewApps] = useState<BonusApplication[]>([]);
  const [adminLogs, setAdminLogs] = useState<AdminLog[]>([]);
  const [testimonies, setTestimonies] = useState<Testimony[]>([]);

  // 罰款管理 state
  interface SquadMemberFine { userId: string; name: string; totalFines: number; finePaid: number; balance: number; }
  const [squadFineMembers, setSquadFineMembers] = useState<SquadMemberFine[]>([]);
  const [fineHistory, setFineHistory] = useState<FinePaymentRecord[]>([]);
  const [isLoadingFines, setIsLoadingFines] = useState(false);
  const [orgSubmissions, setOrgSubmissions] = useState<import('@/types').SquadFineSubmission[]>([]);
  const [isCheckingCompliance, setIsCheckingCompliance] = useState(false);
  const [complianceResult, setComplianceResult] = useState<{ periodLabel: string; violators: { userId: string; name: string; missingSum?: number; fineAdded?: number }[]; alreadyRun: boolean } | null>(null);

  const [squadMembers, setSquadMembers] = useState<SquadMemberStats[]>([]);
  const [battalionMembers, setBattalionMembers] = useState<Record<string, SquadMemberStats[]>>({});

  // LINE login progress flag to prevent flash of login page during async DB work
  const lineLoginInProgress = useRef(false);

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

  const logicalTodayStr = getLogicalDateStr();
  const currentWeeklyMonday = useMemo(() => getWeeklyMonday(), []);


  const isTopicDone = useMemo(() =>
    logs.some(l => l.QuestID === 't1' && new Date(l.Timestamp) >= currentWeeklyMonday),
    [logs, currentWeeklyMonday]
  );


  const todayCompletedQuestIds = useMemo(() => {
    return logs.filter(l => getLogicalDateStr(l.Timestamp) === logicalTodayStr).map(l => l.QuestID);
  }, [logs, logicalTodayStr]);

  const handleAdminAuth = async (e: { preventDefault: () => void; currentTarget: HTMLFormElement }) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (fd.get('password') === ADMIN_PASSWORD) {
      setAdminAuth(true);
      // Fetch admin data on auth
      const [w4Res, logsRes] = await Promise.all([
        getBonusApplications({ status: 'squad_approved' }),
        getAdminActivityLog(30),
      ]);
      if (w4Res.success) setPendingFinalReviewApps(w4Res.applications);
      if (logsRes.success) setAdminLogs(logsRes.logs as AdminLog[]);
      // Load angel call pairings from SystemSettings
      const { data: pairingsSetting } = await supabase
        .from('SystemSettings')
        .select('Value')
        .eq('SettingName', 'AngelCallPairings')
        .maybeSingle();
      if (pairingsSetting?.Value) {
        try { setAngelCallPairings(JSON.parse(pairingsSetting.Value)); } catch (_) { /* ignore parse errors */ }
      }
    } else {
      setModalMessage({ text: "密令錯誤，大會禁地不可擅闖。", type: 'error' });
    }
  };

  const handleRunAngelCallPairing = async () => {
    setIsSyncing(true);
    try {
      const res = await runAngelCallPairing();
      if (res.success && res.pairings) {
        setAngelCallPairings({ weekOf: res.weekOf!, pairings: res.pairings });
        setModalMessage({ text: `配對完成！共 ${res.pairings.length} 組配對。`, type: 'success' });
      } else {
        setModalMessage({ text: '配對失敗：' + (res.error || '未知錯誤'), type: 'error' });
      }
    } catch (e: any) {
      setModalMessage({ text: '系統異常：' + e.message, type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSubmitBonusApp = async (
    bonusType: 'b3' | 'b4' | 'b5' | 'b6' | 'b7',
    target: string,
    date: string,
    desc: string,
    screenshotUrl?: string
  ) => {
    if (!userData) return;
    const res = await submitBonusApplication(
      userData.UserID, userData.Name,
      userData.TeamName || null, userData.SquadName || null,
      bonusType, target, date, desc, screenshotUrl
    );
    if (res.success && res.application) {
      setMyBonusApps(prev => [res.application as BonusApplication, ...prev]);
      if (userData.IsCaptain && userData.TeamName) {
        const pendingRes = await getBonusApplications({ squadName: userData.TeamName, status: 'pending' });
        if (pendingRes.success) setPendingBonusApps(pendingRes.applications);
      }
      if (adminAuth) {
        const finalRes = await getBonusApplications({ status: 'squad_approved' });
        if (finalRes.success) setPendingFinalReviewApps(finalRes.applications);
      }
      setModalMessage({ text: '加分申請已提交，待小隊長審核。', type: 'success' });
    } else {
      setModalMessage({ text: res.error || '提交失敗', type: 'error' });
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

  const handleCaptainCheckW3Compliance = async () => {
    if (!userData?.UserID) return;
    setIsCheckingCompliance(true);
    try {
      const res = await checkSquadFineCompliance(userData.UserID);
      if (res.success) {
        setComplianceResult({
          periodLabel: res.periodLabel ?? '',
          violators: res.violators ?? [],
          alreadyRun: res.alreadyRun ?? false,
        });
        // Refresh fine status to reflect updated TotalFines
        if (!res.alreadyRun) {
          const fineRes = await getSquadFineStatus(userData.UserID);
          if (fineRes.success && fineRes.members) setSquadFineMembers(fineRes.members);
        }
      } else {
        setModalMessage({ text: '結算失敗：' + res.error, type: 'error' });
      }
    } catch (e: any) {
      setModalMessage({ text: '系統異常：' + e.message, type: 'error' });
    } finally {
      setIsCheckingCompliance(false);
    }
  };

  const handleDrawWeeklyQuest = async () => {
    if (!userData?.TeamName || !userData.IsCaptain) return;
    setIsSyncing(true);
    try {
      const res = await drawWeeklyQuestForSquad(userData.TeamName, userData.UserID);
      if (res.success) {
        setTeamSettings((prev: any) => ({
          ...prev,
          mandatory_quest_id: res.questId,
          mandatory_quest_week: res.weekLabel,
          quest_draw_history: [...(prev?.quest_draw_history || []), res.questId],
        }));
        setModalMessage({ text: `本週推薦通告已抽出：「${res.questName}」`, type: 'success' });
      } else {
        setModalMessage({ text: res.error || '抽籤失敗', type: 'error' });
      }
    } catch (e: any) {
      setModalMessage({ text: '系統異常：' + e.message, type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };


  const handleOpenCaptainTab = () => {
    setActiveTab('captain');
    if (userData?.IsCaptain || userData?.IsGM) {
      loadFinesData();
      getSquadMembersStats(userData.UserID).then(res => {
        if (res.success && res.members) setSquadMembers(res.members);
      });
    }
  };

  const handleOpenCommandantTab = () => {
    setActiveTab('commandant');
    if ((userData?.IsCommandant || userData?.IsGM) && userData?.UserID) {
      getBattalionMembersStats(userData.UserID).then(res => {
        if (res.success && res.members) setBattalionMembers(res.members);
      });
    }
  };

  const handleAutoAssignSquads = async () => {
    if (!confirm("確定要將所有玩家隨機分配發行商 / 劇組？（每隊 4 人，3 隊一發行商，會覆蓋現有編組）")) return;
    setIsSyncing(true);
    try {
      const res = await autoAssignSquadsForTesting();
      if (res.success) {
        setModalMessage({ text: `分配完成！共 ${res.totalPlayers} 位玩家，${res.squadCount} 支劇組，${res.battalionCount} 個發行商。`, type: 'success' });
      } else {
        setModalMessage({ text: '分配失敗：' + res.error, type: 'error' });
      }
    } catch (e: any) {
      setModalMessage({ text: '系統異常：' + e.message, type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  // ── 罰款 handlers ──
  const loadFinesData = async () => {
    if (!userData?.TeamName) return;
    setIsLoadingFines(true);
    try {
      const [summaryRes, histRes, orgRes, complianceRes] = await Promise.all([
        getSquadFineStatus(userData.UserID),
        getSquadFinePaymentHistory(userData.UserID),
        getSquadOrgSubmissions(userData.UserID),
        getLastComplianceRun(userData.UserID),
      ]);
      if (summaryRes.success && summaryRes.members) setSquadFineMembers(summaryRes.members as SquadMemberFine[]);
      if (histRes.success && histRes.records) setFineHistory(histRes.records as FinePaymentRecord[]);
      if (orgRes.success && orgRes.records) setOrgSubmissions(orgRes.records as import('@/types').SquadFineSubmission[]);
      if (complianceRes.success && complianceRes.alreadyRun) {
        setComplianceResult({ periodLabel: complianceRes.periodLabel!, violators: [], alreadyRun: true });
      }
    } catch (_) { /* silent */ } finally {
      setIsLoadingFines(false);
    }
  };

  const handleRecordFinePayment = async (targetUserId: string, amount: number, periodLabel: string, paidToCaptainAt?: string) => {
    if (!userData?.TeamName) return;
    const res = await recordFinePayment(userData.UserID, targetUserId, amount, periodLabel, paidToCaptainAt);
    if (res.success) {
      setModalMessage({ text: `已記錄繳款 NT$${amount}`, type: 'success' });
      await loadFinesData();
    } else {
      setModalMessage({ text: res.error || '記錄失敗', type: 'error' });
    }
  };

  const handleSetPaidToCaptainDate = async (paymentId: string, date: string) => {
    const res = await setPaidToCaptainDate(userData?.UserID || '', paymentId, date);
    if (res.success) await loadFinesData();
    else setModalMessage({ text: res.error || '更新失敗', type: 'error' });
  };

  const handleRecordOrgSubmission = async (amount: number, submittedAt: string, notes?: string) => {
    const res = await recordOrgSubmission(userData?.UserID || '', amount, submittedAt, notes);
    if (res.success) {
      setModalMessage({ text: `已記錄上繳大會 NT$${amount}`, type: 'success' });
      await loadFinesData();
    } else {
      setModalMessage({ text: res.error || '記錄失敗', type: 'error' });
    }
  };

  const handleAutoDrawAllSquads = async () => {
    if (!confirm("確定要為所有本週尚未抽籤的劇組自動抽選推薦通告？")) return;
    setIsSyncing(true);
    try {
      const res = await autoDrawAllSquads();
      if (res.success) {
        const summary = res.drawn?.map((d: { squadName: string; questName: string }) => `${d.squadName}→${d.questName}`).join('、') || '（無）';
        setModalMessage({ text: `自動抽籤完成！${res.drawnCount} 個劇組已抽選，${res.skippedCount} 個已跳過。\n${summary}`, type: 'success' });
      } else {
        setModalMessage({ text: '自動抽籤失敗：' + res.error, type: 'error' });
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
      const { error } = await supabase.from('SystemSettings').upsert({ SettingName: key, Value: value }, { onConflict: 'SettingName' });
      if (error) throw error;
      setSystemSettings(prev => ({ ...prev, [key]: value }));

      if (key === 'TopicQuestTitle') {
        const { data: newHistory, error: historyErr } = await supabase.from('TopicHistory').insert([{ TopicTitle: value }]).select();
        if (!historyErr && newHistory) {
          setTopicHistory(prev => [newHistory[0] as TopicHistory, ...prev]);
        }
      }

      setModalMessage({ text: "設定已同步，所有成員將即時看到更新。", type: 'success' });
    } catch (err) {
      setModalMessage({ text: "同步失敗，法陣連線異常。", type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAddTempQuest = async (title: string, sub: string, desc: string, reward: number) => {
    setIsSyncing(true);
    try {
      const id = `temp_${Date.now()}`;
      const dbRow = { id, title, sub, desc, reward, limit_count: 1, active: true };
      const { error } = await supabase.from('temporaryquests').insert([dbRow]);
      if (error) throw error;
      const newQuest: TemporaryQuest = { id, title, sub, desc, reward, limit: 1, active: true };
      setTemporaryQuests(prev => [newQuest, ...prev]);
      await logAdminAction('temp_quest_add', 'admin', id, title, { reward });
    } catch (err) {
      console.error(err);
      setModalMessage({ text: "新增臨時任務失敗。", type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleToggleTempQuest = async (id: string, active: boolean) => {
    setIsSyncing(true);
    try {
      const { error } = await supabase.from('temporaryquests').update({ active }).eq('id', id);
      if (error) throw error;
      setTemporaryQuests(prev => prev.map(q => q.id === id ? { ...q, active } : q));
      await logAdminAction('temp_quest_toggle', 'admin', id, undefined, { active });
    } catch (err) {
      setModalMessage({ text: "更新臨時任務狀態失敗。", type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteTempQuest = async (id: string) => {
    if (!confirm("確定要刪除此臨時任務嗎？刪除後無法恢復。")) return;
    setIsSyncing(true);
    try {
      const { error } = await supabase.from('temporaryquests').delete().eq('id', id);
      if (error) throw error;
      setTemporaryQuests(prev => prev.filter(q => q.id !== id));
      await logAdminAction('temp_quest_delete', 'admin', id);
    } catch (err) {
      setModalMessage({ text: "刪除臨時任務失敗。", type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSubmitInterview = async (data: { interviewTarget: string; interviewDate: string; description: string }) => {
    if (!userData) return;
    const res = await submitInterviewApplication(
      userData.UserID, userData.Name,
      userData.TeamName || null, userData.SquadName || null,
      data.interviewTarget, data.interviewDate, data.description
    );
    if (res.success && res.application) {
      setMyBonusApps(prev => [res.application as BonusApplication, ...prev]);
      if (userData.IsCaptain && userData.TeamName) {
        const pendingRes = await getBonusApplications({ squadName: userData.TeamName, status: 'pending' });
        if (pendingRes.success) setPendingBonusApps(pendingRes.applications);
      }
      setModalMessage({ text: '電影推廣申請已提交，待劇組長審核。', type: 'success' });
    } else {
      setModalMessage({ text: res.error || '提交失敗', type: 'error' });
    }
  };

  const handleReviewBonusBySquad = async (appId: string, approve: boolean, notes: string) => {
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
  };

  const handleFinalReviewBonus = async (appId: string, approve: boolean, notes: string) => {
    const res = await reviewBonusByAdmin(appId, approve ? 'approve' : 'reject', notes);
    if (res.success) {
      setPendingFinalReviewApps(prev => prev.filter(a => a.id !== appId));
      setModalMessage({ text: approve ? '已核准入帳！票房已發放。' : '已駁回申請。', type: approve ? 'success' : 'info' });
      const logsRes = await getAdminActivityLog(30);
      if (logsRes.success) setAdminLogs(logsRes.logs as AdminLog[]);
    } else {
      setModalMessage({ text: (res as any).error || '審核失敗', type: 'error' });
    }
  };

  const handleCheckInAction = async (quest: Quest) => {
    if (!userData) return;
    setIsSyncing(true);
    try {
      const res = await processCheckInTransaction(userData.UserID, quest.id, quest.title, quest.reward);

      if (res.success && res.user) {
        // 樂觀更新：立即把新 log 加入 state，chip 即時顯示完成
        const optimisticLog: DailyLog = {
          Timestamp: new Date().toISOString(),
          UserID: userData.UserID,
          QuestID: quest.id,
          QuestTitle: quest.title,
          RewardPoints: quest.reward,
        };
        setUserData(res.user as CharacterStats);
        setLogs(prev => [...prev, optimisticLog]);
        // 背景同步：只有 DB 回傳的筆數 > 現有 state 才更新，避免短暫空值覆蓋樂觀更新
        supabase.from('DailyLogs').select('*').eq('UserID', userData.UserID)
          .then(({ data }) => {
            if (data && data.length > 0) setLogs(data as DailyLog[]);
          });
        setModalMessage(res.rewardCapped
          ? { text: "Action！打卡完成，今日三場已殺青，本次不計票房。", type: 'info' }
          : { text: "本場完美收鏡，票房長紅！", type: 'success' }
        );
      } else {
        // Sync logs so client state reflects server state (e.g. quest already done)
        const { data: syncedLogs } = await supabase.from('DailyLogs').select('*').eq('UserID', userData.UserID);
        if (syncedLogs) setLogs(syncedLogs as DailyLog[]);
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

      const actualReward: number = targetLogs[0].RewardPoints ?? quest.reward;
      const newExp = Math.max(0, userData.Exp - actualReward);
      const newLevel = calculateLevelFromExp(newExp);

      const update: Partial<CharacterStats> = {
        Exp: newExp,
        Level: newLevel,
      };

      await supabase.from('CharacterStats').update(update).eq('UserID', userData.UserID);
      const { data: newLogs } = await supabase.from('DailyLogs').select('*').eq('UserID', userData.UserID);
      const updatedLogs = (newLogs as DailyLog[]) || [];

      setLogs(updatedLogs);
      setUserData({ ...userData, ...update } as CharacterStats);
      setUndoTarget(null);
      setModalMessage({ text: "時光回溯成功，紀錄已取消。", type: 'success' });
    } catch (err) { setModalMessage({ text: "回溯失敗，請稍後再試。", type: 'error' }); } finally { setIsSyncing(false); }
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
        const { data: userLogs } = await supabase.from('DailyLogs').select('*').eq('UserID', userData.UserID);
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
      const { data: allUsers, error: queryError } = await supabase.from('CharacterStats').select('*');
      if (queryError) throw new Error(queryError.message);
      const match = (allUsers as CharacterStats[])?.find(u => u.Name === name && u.UserID.endsWith(phoneSuffix));
      if (match) {

        const { data: userLogs } = await supabase.from('DailyLogs').select('*').eq('UserID', match.UserID);
        const logsArray = (userLogs as DailyLog[]) || [];

        if (match.TeamName) {
          const { data: ts } = await supabase.from('TeamSettings').select('*').eq('team_name', match.TeamName).single();
          if (ts) setTeamSettings(ts);
        }

        setUserData(match);
        setLogs(logsArray);
        setView('app');
      } else { setModalMessage({ text: "查無此觀影者帳號。", type: 'error' }); }
    } catch (err) { setModalMessage({ text: "系統連線異常。", type: 'error' }); } finally { setIsSyncing(false); }
  };

  const handleRegisterInput = async (data: any) => {
    setIsSyncing(true);
    const { name, phone: phoneRaw, email: emailRaw, fortunes } = data;
    const email = emailRaw?.trim()?.toLowerCase();
    const phone = standardizePhone(phoneRaw);

    const newChar: any = {
      UserID: phone, Name: name.trim(),
      Level: 1, Exp: 0,
      Streak: 0, LastCheckIn: null, TotalFines: 0, CurrentQ: 0, CurrentR: 0,
      Email: email, InitialFortunes: fortunes
    };

    try {
      if (email) {
        const { data: rosterMatch } = await supabase.from('Rosters').select('*').eq('email', email).single();
        if (rosterMatch) {
          newChar.SquadName = rosterMatch.squad_name;
          newChar.TeamName = rosterMatch.team_name;
          newChar.IsCaptain = rosterMatch.is_captain;
        }
      }
      await supabase.from('CharacterStats').insert([newChar]);
      setUserData(newChar);
      setModalMessage({ text: '帳號建立成功，開始您的親證之旅！', type: 'success' });
      setView('app');
    } catch (err) {
      setModalMessage({ text: '註冊失敗。可能該手機號碼已經建立過帳號。', type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };



  const handleLogout = () => { setUserData(null); setView('login'); };

  // One-time static data load — settings, history
  useEffect(() => {
    const loadStaticData = async () => {
      const { data: settingsData } = await supabase.from('SystemSettings').select('*');
      if (settingsData) {
        const sObj = settingsData.reduce((acc: any, curr: any) => ({ ...acc, [curr.SettingName]: curr.Value }), {});
        let parsedFineSettings;
        try {
          if (sObj.FineSettings) parsedFineSettings = JSON.parse(sObj.FineSettings);
        } catch (_) {}

        setSystemSettings({
          TopicQuestTitle: sObj.TopicQuestTitle || '主題載入中',
          RegistrationMode: (sObj.RegistrationMode as 'open' | 'roster') || 'open',
          VolunteerPassword: sObj.VolunteerPassword,
          FineSettings: parsedFineSettings,
        });
      }

      const { data: historyData } = await supabase.from('TopicHistory').select('*').order('created_at', { ascending: false });
      if (historyData) setTopicHistory(historyData as TopicHistory[]);

      const { data: tempQuestsData } = await supabase.from('temporaryquests').select('*').order('created_at', { ascending: false });
      if (tempQuestsData) {
        const parsed = tempQuestsData.map((t: any) => ({ ...t, limit: t.limit_count }));
        setTemporaryQuests(parsed as TemporaryQuest[]);
      }
    };
    loadStaticData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const init = async () => {
      // LINE OAuth session handoff — handle ?line_uid, ?line_bound, ?line_error params
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const lineUid = params.get('line_uid');
        const lineBound = params.get('line_bound');
        const lineError = params.get('line_error');
        if (lineUid || lineBound || lineError) {
          window.history.replaceState({}, '', '/');
          if (lineUid) {
            lineLoginInProgress.current = true;
            // LINE login: auto-load user from DB then enter app
            const uid = decodeURIComponent(lineUid);
            const { data: stats, error } = await supabase.from('CharacterStats').select('*').eq('UserID', uid).single();
            if (stats && !error) {
              const { data: userLogs } = await supabase.from('DailyLogs').select('*').eq('UserID', stats.UserID);
              const logsArray = (userLogs as DailyLog[]) || [];
              if (stats.TeamName) {
                const { data: tSettings } = await supabase.from('TeamSettings').select('*').eq('team_name', stats.TeamName).single();
                if (tSettings) setTeamSettings(tSettings);
                const { count } = await supabase.from('CharacterStats').select('*', { count: 'exact', head: true }).eq('TeamName', stats.TeamName);
                setTeamMemberCount(count || 1);
              }
              setUserData(stats as CharacterStats);
              setLogs(logsArray);
              const w4Res = await getBonusApplications({ userId: stats.UserID });
              if (w4Res.success) setMyBonusApps(w4Res.applications);
              if (stats.IsCaptain && stats.TeamName) {
                const pendingRes = await getBonusApplications({ squadName: stats.TeamName, status: 'pending' });
                if (pendingRes.success) setPendingBonusApps(pendingRes.applications);
              }
              if (stats.IsCommandant) {
                const commandantRes = await getBonusApplications({ status: 'squad_approved' });
                if (commandantRes.success) setPendingFinalReviewApps(commandantRes.applications);
              }
              lineLoginInProgress.current = false;
              setView('app');
            } else {
              lineLoginInProgress.current = false;
              setView('login');
            }
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

      // 無 session 儲存，每次重整都回到登入頁
      if (!lineLoginInProgress.current) {
        setView(v => v === 'loading' ? 'login' : v);
      }
    };
    init();
  }, [userData]);


  useEffect(() => {
    const fetchRank = async () => {
      const { data: rankData } = await supabase.from('CharacterStats').select('*').order('Exp', { ascending: false });
      if (rankData) setLeaderboard(rankData as CharacterStats[]);
    };
    if (activeTab === 'rank' || view === 'admin') fetchRank();
    if (view === 'admin') getTestimonies().then(setTestimonies).catch(console.error);
  }, [activeTab, view]);

  // Refresh w4 applications whenever the weekly tab becomes active
  useEffect(() => {
    if (activeTab === 'weekly' && userData?.UserID) {
      getBonusApplications({ userId: userData.UserID }).then(res => {
        if (res.success) setMyBonusApps(res.applications);
      });
    }
  }, [activeTab, userData?.UserID]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab === 'captain' && !showCaptainTab) setActiveTab('daily');
    if (activeTab === 'commandant' && !showCommandantTab) setActiveTab('daily');
  }, [gmViewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const GmToolbar = () => {
    if (!userData?.IsGM) return null;
    const modes: { label: string; value: GmViewMode }[] = [
      { label: '全部', value: 'all' },
      { label: '一般成員', value: 'player' },
      { label: '劇組長', value: 'captain' },
      { label: '發行商長', value: 'commandant' },
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
    <div className="min-h-screen bg-black text-white pb-40 text-center animate-in fade-in">
      <Header userData={userData} onLogout={handleLogout} />
      <GmToolbar />

      {/* LINE 綁定提示 Banner */}
      {userData && !userData.LineUserId && !lineBannerDismissed && (
        <div className="flex items-center gap-3 px-4 py-3 bg-[#06C755]/10 border-b border-[#06C755]/20 text-sm">
          <span className="text-[#06C755] font-black shrink-0">LINE</span>
          <span className="flex-1 text-left text-slate-300 text-xs">尚未綁定 LINE 帳號，綁定後可直接以 LINE 登入。</span>
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

      <nav className="sticky top-0 z-20 bg-black/80 backdrop-blur-xl flex p-3 gap-2 border-b border-[#1a1a1a] shadow-xl overflow-x-auto no-scrollbar">
        {([
          { id: 'daily',   label: '每日觀影' },
          { id: 'weekly',  label: '導演報表' },
          { id: 'rank',    label: '票房榜' },
          { id: 'stats',   label: '觀影分析' },
        ] as const).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`shrink-0 px-5 py-3 rounded-full text-xs font-bold transition-all duration-200 active:scale-95 cursor-pointer
              ${activeTab === id
                ? 'bg-[#E50914] text-white shadow-[0_0_15px_rgba(229,9,20,0.4)]'
                : 'bg-[#111] text-[rgba(255,255,255,0.45)] hover:text-white hover:bg-[#1a1a1a]'}`}
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => setActiveTab('course')}
          className={`shrink-0 flex items-center gap-1.5 px-5 py-3 rounded-full text-xs font-bold transition-all duration-200 active:scale-95 cursor-pointer
            ${activeTab === 'course'
              ? 'bg-[#E50914] text-white shadow-[0_0_15px_rgba(229,9,20,0.4)]'
              : 'bg-[#111] text-[rgba(255,255,255,0.45)] hover:text-white hover:bg-[#1a1a1a]'}`}
        >
          <CalendarDays size={13} />
          首映曆
        </button>
        {showCaptainTab && (
          <button
            onClick={handleOpenCaptainTab}
            className={`shrink-0 flex items-center gap-1.5 px-5 py-3 rounded-full text-xs font-bold transition-all duration-200 active:scale-95 cursor-pointer
              ${activeTab === 'captain'
                ? 'bg-[#D4AF37] text-black shadow-[0_0_15px_rgba(212,175,55,0.4)]'
                : 'bg-[#111] text-[rgba(255,255,255,0.45)] hover:text-white hover:bg-[#1a1a1a]'}`}
          >
            <Clapperboard size={13} />
            製片總部
          </button>
        )}
        {showCommandantTab && (
          <button
            onClick={handleOpenCommandantTab}
            className={`shrink-0 flex items-center gap-1.5 px-5 py-3 rounded-full text-xs font-bold transition-all duration-200 active:scale-95 cursor-pointer
              ${activeTab === 'commandant'
                ? 'bg-[#D4AF37] text-black shadow-[0_0_15px_rgba(212,175,55,0.4)]'
                : 'bg-[#111] text-[rgba(255,255,255,0.45)] hover:text-white hover:bg-[#1a1a1a]'}`}
          >
            <Video size={13} />
            片商總部
          </button>
        )}
      </nav>

      <main className="max-w-md mx-auto p-6 space-y-8">
        {activeTab === 'daily' && (
          <DailyQuestsTab
            userId={userData?.UserID || ''}
            weeklyQuestId={teamSettings?.mandatory_quest_id}
            fineSettings={systemSettings?.FineSettings}
            logs={logs}
            logicalTodayStr={logicalTodayStr}
            onCheckIn={handleCheckInAction}
            onUndo={setUndoTarget}
            onClearTodayLogs={handleClearTodayLogs}
            formatCheckInTime={formatCheckInTime}
          />
        )}
        {activeTab === 'weekly' && userData && (
          <WeeklyTopicTab
            userId={userData.UserID}
            systemSettings={systemSettings}
            fineSettings={systemSettings?.FineSettings}
            logicalTodayStr={logicalTodayStr}
            logs={logs}
            currentWeeklyMonday={currentWeeklyMonday}
            isTopicDone={isTopicDone}
            temporaryQuests={temporaryQuests.filter(t => t.active)}
            bonusApplications={myBonusApps}
            onCheckIn={handleCheckInAction}
            onUndo={setUndoTarget}
            onSubmitInterview={handleSubmitInterview}
            onSubmitBonusApp={handleSubmitBonusApp}
          />
        )}
        {activeTab === 'rank' && <RankTab leaderboard={leaderboard} currentUserId={userData?.UserID} />}
        {activeTab === 'stats' && userData && <StatsTab userData={userData} />}
        {activeTab === 'captain' && showCaptainTab && userData && (
          <CaptainTab
            teamName={userData.TeamName || '未編組'}
            teamSettings={teamSettings}
            pendingBonusApps={pendingBonusApps}
            onDrawWeeklyQuest={handleDrawWeeklyQuest}
            onReviewBonus={handleReviewBonusBySquad}
            squadFineMembers={squadFineMembers}
            fineHistory={fineHistory}
            onRecordPayment={handleRecordFinePayment}
            onSetPaidToCaptainDate={handleSetPaidToCaptainDate}
            orgSubmissions={orgSubmissions}
            onRecordOrgSubmission={handleRecordOrgSubmission}
            isLoadingFines={isLoadingFines}
            onCheckW3Compliance={handleCaptainCheckW3Compliance}
            isCheckingCompliance={isCheckingCompliance}
            complianceResult={complianceResult}
            squadMembers={squadMembers}
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
          <CourseTab userData={userData} volunteerPassword={systemSettings.VolunteerPassword ?? ''} />
        )}
      </main>


      {/* 進入影廳按鈕已依照需求移除 */}
    </div>
  );

  return (
    <div className="text-center justify-center mx-auto w-full font-sans">
      {view === 'loading' && (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center p-10 text-center mx-auto">
          <Loader2 className="w-16 h-16 text-[#E50914] animate-spin mb-6 mx-auto" />
          <p className="text-[#E50914] text-xl font-bold animate-pulse text-center mx-auto">載入片庫中...</p>
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
          topicHistory={topicHistory}
          temporaryQuests={temporaryQuests}
          pendingFinalReviewApps={pendingFinalReviewApps}
          adminLogs={adminLogs}
          testimonies={testimonies}
          angelCallPairings={angelCallPairings}
          onAddTempQuest={handleAddTempQuest}
          onToggleTempQuest={handleToggleTempQuest}
          onDeleteTempQuest={handleDeleteTempQuest}
          onAutoDrawAllSquads={handleAutoDrawAllSquads}
          onRunAngelCallPairing={handleRunAngelCallPairing}
          onImportRoster={handleImportRoster}
          onFinalReviewBonus={handleFinalReviewBonus}
          onClose={() => setView('login')}
        />
      )}

      {view === 'app' && <HomeView />}

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
        <div className="fixed inset-0 bg-black/80 z-[1100] flex flex-col items-center justify-center text-center mx-auto backdrop-blur-sm">
          <Loader2 className="w-12 h-12 text-[#E50914] animate-spin mb-4 mx-auto" />
          <p className="text-[#E50914] font-bold animate-pulse tracking-widest uppercase text-center mx-auto">與片庫同步中...</p>
        </div>
      )}

      {modalMessage && <MessageBox message={modalMessage.text} type={modalMessage.type} onClose={() => setModalMessage(null)} />}
    </div>
  );
}