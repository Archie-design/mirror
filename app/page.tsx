"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import {
  AlertTriangle, CheckCircle2, Sparkles,
  Dice5, Loader2, RotateCcw
} from 'lucide-react';

import { CharacterStats, DailyLog, Quest, SystemSettings, TopicHistory, TemporaryQuest, W4Application, AdminLog, Testimony, FinePaymentRecord } from '@/types';
import { getLogicalDateStr, getWeeklyMonday } from '@/lib/utils/time';
import { standardizePhone } from '@/lib/utils/phone';
import { ROLE_CURE_MAP, DEFAULT_CONFIG, ADVENTURE_COST, ADMIN_PASSWORD, calculateLevelFromExp, ROLE_GROWTH_RATES } from '@/lib/constants';
import { WorldMap } from '@/components/Map/WorldMap';

import { Header } from '@/components/Layout/Header';
import { LoginForm } from '@/components/Login/LoginForm';
import { RegisterForm, evaluateFate } from '@/components/Login/RegisterForm';
import { DailyQuestsTab } from '@/components/Tabs/DailyQuestsTab';
import { WeeklyTopicTab } from '@/components/Tabs/WeeklyTopicTab';
import { StatsTab } from '@/components/Tabs/StatsTab';
import { RankTab } from '@/components/Tabs/RankTab';
import { CaptainTab } from '@/components/Tabs/CaptainTab';
import { CommandantTab } from '@/components/Tabs/CommandantTab';
import { ShopTab } from '@/components/Tabs/ShopTab';
import { AdminDashboard } from '@/components/Admin/AdminDashboard';
import { processCheckInTransaction } from '@/app/actions/quest';
import { triggerWeeklySnapshot, importRostersData, checkWeeklyW3Compliance, autoAssignSquadsForTesting, logAdminAction } from '@/app/actions/admin';
import { getTestimonies } from '@/app/actions/testimonies_admin';
import { drawWeeklyQuestForSquad, autoDrawAllSquads } from '@/app/actions/team';
import { submitW4Application, reviewW4BySquadLeader, reviewW4ByAdmin, getW4Applications, getAdminActivityLog } from '@/app/actions/w4';
import { generateWeeklyReview, generateCaptainBriefing } from '@/app/actions/gemini';
import { handleChestOpen } from '@/app/actions/map';
import { getSquadFineStatus, recordFinePayment, setPaidToCaptainDate, getSquadFinePaymentHistory, checkSquadW3Compliance, recordOrgSubmission, getSquadOrgSubmissions } from '@/app/actions/fines';

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
  const [lineBannerDismissed, setLineBannerDismissed] = useState(false);
  const [activeTab, setActiveTab] = useState<'daily' | 'weekly' | 'stats' | 'rank' | 'captain' | 'shop' | 'commandant'>('daily');
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
  const [mapData, setMapData] = useState<Record<string, string>>({});
  const [mapEntities, setMapEntities] = useState<any[]>([]);
  const [teamSettings, setTeamSettings] = useState<any>(null);
  const [teamMemberCount, setTeamMemberCount] = useState<number>(1);
  const [corridorL, setCorridorL] = useState<number>(DEFAULT_CONFIG.CORRIDOR_L);
  const [corridorW, setCorridorW] = useState<number>(DEFAULT_CONFIG.CORRIDOR_W);

  // States for Five Fortunes tie breaking
  const [tieBreakData, setTieBreakData] = useState<any>(null);

  // Map state
  const [stepsRemaining, setStepsRemaining] = useState(0);
  const [moveMultiplier, setMoveMultiplier] = useState(1);
  const [isRolling, setIsRolling] = useState(false);
  const [w4Applications, setW4Applications] = useState<W4Application[]>([]);
  const [pendingW4Apps, setPendingW4Apps] = useState<W4Application[]>([]);

  // AI features state
  const [weeklyReview, setWeeklyReview] = useState<import('@/types').WeeklyReview | null>(null);
  const [isLoadingReview, setIsLoadingReview] = useState(false);
  const [aiBriefing, setAiBriefing] = useState<import('@/types').CaptainBriefing | null>(null);
  const [isLoadingBriefing, setIsLoadingBriefing] = useState(false);
  const [squadApprovedW4Apps, setSquadApprovedW4Apps] = useState<W4Application[]>([]);
  const [adminLogs, setAdminLogs] = useState<AdminLog[]>([]);
  const [testimonies, setTestimonies] = useState<Testimony[]>([]);

  // 罰款管理 state
  interface SquadMemberFine { userId: string; name: string; totalFines: number; finePaid: number; balance: number; }
  const [squadFineMembers, setSquadFineMembers] = useState<SquadMemberFine[]>([]);
  const [fineHistory, setFineHistory] = useState<FinePaymentRecord[]>([]);
  const [isLoadingFines, setIsLoadingFines] = useState(false);
  const [orgSubmissions, setOrgSubmissions] = useState<import('@/types').SquadFineSubmission[]>([]);
  const [isCheckingCompliance, setIsCheckingCompliance] = useState(false);
  const [complianceResult, setComplianceResult] = useState<{ periodLabel: string; violators: { userId: string; name: string }[]; alreadyRun: boolean } | null>(null);

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

  const logicalTodayStr = useMemo(() => getLogicalDateStr(), []);
  const currentWeeklyMonday = useMemo(() => getWeeklyMonday(), []);


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
        getW4Applications({ status: 'squad_approved' }),
        getAdminActivityLog(30),
      ]);
      if (w4Res.success) setSquadApprovedW4Apps(w4Res.applications);
      if (logsRes.success) setAdminLogs(logsRes.logs as AdminLog[]);
    } else {
      setModalMessage({ text: "密令錯誤，大會禁地不可擅闖。", type: 'error' });
    }
  };

  const handleTriggerSnapshot = async () => {
    if (!confirm("確定要執行『每週業力結算』(Weekly Snapshot)？\n這將重新計算所有活躍使用者的完成率，並變更全服動態難度 (WorldState)。")) return;
    setIsSyncing(true);
    try {
      const res = await triggerWeeklySnapshot();
      if (res.success) {
        setSystemSettings(prev => ({
          ...prev,
          WorldState: res.worldState,
          WorldStateMsg: res.message
        }));
        setModalMessage({ text: `結算完成！目前的共業狀態為：${res.message}`, type: 'success' });
      } else {
        setModalMessage({ text: "結算失敗: " + res.error, type: 'error' });
      }
    } catch (e: any) {
      setModalMessage({ text: "系統異常：" + e.message, type: 'error' });
    } finally {
      setIsSyncing(false);
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

  const handleCheckW3Compliance = async () => {
    if (!confirm("確定要執行『w3 週罰款結算』？\n本週未完成「自我精進課」(w3) 的修行者將被記 NT$200 罰金。")) return;
    setIsSyncing(true);
    try {
      const res = await checkWeeklyW3Compliance();
      if (res.success) {
        const count = res.violatorCount ?? 0;
        const names = res.violators?.map((v: { name: string }) => v.name).join('、') || '（無）';
        setModalMessage({ text: `w3 結算完成！共 ${count} 人未達標，已記罰：${names}`, type: count > 0 ? 'error' : 'success' });
      } else {
        setModalMessage({ text: "結算失敗：" + res.error, type: 'error' });
      }
    } catch (e: any) {
      setModalMessage({ text: "系統異常：" + e.message, type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCaptainCheckW3Compliance = async () => {
    if (!userData?.UserID) return;
    setIsCheckingCompliance(true);
    try {
      const res = await checkSquadW3Compliance(userData.UserID);
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
        setModalMessage({ text: `本週推薦定課已抽出：「${res.questName}」`, type: 'success' });
      } else {
        setModalMessage({ text: res.error || '抽籤失敗', type: 'error' });
      }
    } catch (e: any) {
      setModalMessage({ text: '系統異常：' + e.message, type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleOpenWeeklyTab = async () => {
    setActiveTab('weekly');
    if (!userData?.UserID || weeklyReview !== null || isLoadingReview) return;
    setIsLoadingReview(true);
    try {
      const res = await generateWeeklyReview(userData.UserID);
      if (res.success && res.review) setWeeklyReview(res.review);
    } catch (_) { /* non-critical, silently skip */ } finally {
      setIsLoadingReview(false);
    }
  };

  const handleOpenCaptainTab = () => {
    setActiveTab('captain');
    // 每次切回 captain tab 時重新載入罰款資料
    if (userData?.IsCaptain || userData?.IsGM) loadFinesData();
  };

  const handleGetAIBriefing = async () => {
    if (!userData?.UserID || !userData.IsCaptain) return;
    setIsLoadingBriefing(true);
    try {
      const res = await generateCaptainBriefing(userData.UserID);
      if (res.success && res.briefing) {
        setAiBriefing(res.briefing);
      } else {
        setModalMessage({ text: res.error || 'AI 分析失敗，請稍後再試', type: 'error' });
      }
    } catch (e: any) {
      setModalMessage({ text: '系統異常：' + e.message, type: 'error' });
    } finally {
      setIsLoadingBriefing(false);
    }
  };

  const handleAutoAssignSquads = async () => {
    if (!confirm("確定要將所有玩家隨機分配大隊 / 小隊？（每隊 4 人，3 隊一大隊，會覆蓋現有編組）")) return;
    setIsSyncing(true);
    try {
      const res = await autoAssignSquadsForTesting();
      if (res.success) {
        setModalMessage({ text: `分配完成！共 ${res.totalPlayers} 位玩家，${res.squadCount} 支小隊，${res.battalionCount} 個大隊。`, type: 'success' });
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
      const [summaryRes, histRes, orgRes] = await Promise.all([
        getSquadFineStatus(userData.UserID),
        getSquadFinePaymentHistory(userData.UserID),
        getSquadOrgSubmissions(userData.UserID),
      ]);
      if (summaryRes.success && summaryRes.members) setSquadFineMembers(summaryRes.members as SquadMemberFine[]);
      if (histRes.success && histRes.records) setFineHistory(histRes.records as FinePaymentRecord[]);
      if (orgRes.success && orgRes.records) setOrgSubmissions(orgRes.records as import('@/types').SquadFineSubmission[]);
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
    if (!confirm("確定要為所有本週尚未抽籤的小隊自動抽選推薦定課？")) return;
    setIsSyncing(true);
    try {
      const res = await autoDrawAllSquads();
      if (res.success) {
        const summary = res.drawn?.map((d: { squadName: string; questName: string }) => `${d.squadName}→${d.questName}`).join('、') || '（無）';
        setModalMessage({ text: `自動抽籤完成！${res.drawnCount} 個小隊已抽選，${res.skippedCount} 個已跳過。\n${summary}`, type: 'success' });
      } else {
        setModalMessage({ text: '自動抽籤失敗：' + res.error, type: 'error' });
      }
    } catch (e: any) {
      setModalMessage({ text: '系統異常：' + e.message, type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleEntityTrigger = async (entity: any) => {
    // Optimistic UI Removal
    setMapEntities(prev => prev.filter(e => e.id !== entity.id));

    setIsSyncing(true);
    try {
      if (entity.type === 'personal') {
        // Consume in DB
        if (entity.id) await supabase.from('MapEntities').delete().eq('id', entity.id);
        const enc = entity.data;
        setModalMessage({
          text: `✨ 【${enc.encounterName}】\n\n${enc.narrative}\n\n「${enc.dialogue}」\n\n(修為影響：${enc.effect?.statToModify} ${enc.effect?.value > 0 ? '+' : ''}${enc.effect?.value})`,
          type: enc.effect?.value >= 0 ? 'success' : 'error'
        });
      } else if (entity.type === 'portal') {
        if (entity.id) await supabase.from('MapEntities').delete().eq('id', entity.id);
        // Validation already happened in WorldMap.tsx
        setModalMessage({
          text: `✨ 【歸心陣】\n\n業力清淨，陣法啟動！即將傳送回本心草原...`,
          type: 'success'
        });
        // Wait a tiny bit then jump
        setTimeout(() => {
          handleMoveCharacter(0, 0, 0, 'center', 0);
        }, 1500);
      } else if (entity.type === 'chest') {
        // handleChestOpen handles DB deletion internally
        if (!userData) throw new Error('用戶資料未載入');
        const result = await handleChestOpen(userData.UserID, entity.id);
        setUserData(prev => prev ? { ...prev, EnergyDice: (prev.EnergyDice || 0) + result.lootDice } : prev);
        setModalMessage({ text: result.message, type: result.isMimic && !result.lootDice ? 'error' : 'success' });
      } else if (entity.type !== 'monster') {
        if (entity.id) await supabase.from('MapEntities').delete().eq('id', entity.id);
        setModalMessage({
          text: `🎁 你發現了【${entity.name}】！\n「在這漫漫修行路上，天道給予了一份小驚喜。」\n(已自動拾取)`,
          type: 'success'
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSyncing(false);
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

      setModalMessage({ text: "設定已同步雲端，諸位修行者將即時感應。", type: 'success' });
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

  const handleSubmitW4 = async (data: { interviewTarget: string; interviewDate: string; description: string }) => {
    if (!userData) return;
    const res = await submitW4Application(
      userData.UserID, userData.Name,
      userData.TeamName || null, userData.SquadName || null,
      data.interviewTarget, data.interviewDate, data.description
    );
    if (res.success && res.application) {
      setW4Applications(prev => [res.application as W4Application, ...prev]);
      setModalMessage({ text: '傳愛申請已提交，待小隊長審核。', type: 'success' });
    } else {
      setModalMessage({ text: res.error || '提交失敗', type: 'error' });
    }
  };

  const handleReviewW4BySquad = async (appId: string, approve: boolean, notes: string) => {
    if (!userData) return;
    const res = await reviewW4BySquadLeader(appId, userData.UserID, approve, notes);
    if (res.success) {
      setPendingW4Apps(prev => prev.filter(a => a.id !== appId));
      setModalMessage({ text: approve ? '初審通過！' : '已駁回申請。', type: approve ? 'success' : 'info' });
    } else {
      setModalMessage({ text: res.error || '審核失敗', type: 'error' });
    }
  };

  const handleFinalReviewW4 = async (appId: string, approve: boolean, notes: string) => {
    const res = await reviewW4ByAdmin(appId, approve ? 'approve' : 'reject', notes);
    if (res.success) {
      setSquadApprovedW4Apps(prev => prev.filter(a => a.id !== appId));
      setModalMessage({ text: approve ? '已核准入帳！修為已發放。' : '已駁回申請。', type: approve ? 'success' : 'info' });
      // Refresh admin logs
      const logsRes = await getAdminActivityLog(30);
      if (logsRes.success) setAdminLogs(logsRes.logs as AdminLog[]);
    } else {
      setModalMessage({ text: (res as any).error || '審核失敗', type: 'error' });
    }
  };

  const [showGoldenDicePicker, setShowGoldenDicePicker] = useState(false);

  const handleRollDice = (amount: number = 1) => {
    if (!userData || isRolling || stepsRemaining > 0) return;

    // Golden Dice Flow triggers number picker
    if (amount === -1) {
      if ((userData.GoldenDice || 0) < 1) {
        setModalMessage({ text: "萬能奇蹟骰不足！", type: 'error' });
        return;
      }
      setShowGoldenDicePicker(true);
      return;
    }


    if (userData.EnergyDice < amount) {
      setModalMessage({ text: "能量骰子不足！", type: 'error' });
      return;
    }
    setIsRolling(true);
    const newDiceCount = userData.EnergyDice - amount;

    // Fire DB write IMMEDIATELY (not inside setTimeout) so a page refresh can't cancel it
    const dbWrite = supabase
      .from('CharacterStats')
      .update({ EnergyDice: newDiceCount })
      .eq('UserID', userData.UserID);

    setTimeout(async () => {
      const { error } = await dbWrite;
      if (error) {
        setIsRolling(false);
        setModalMessage({ text: '骰子扣除失敗，請重試。', type: 'error' });
        return;
      }

      let roll = 0;
      for (let i = 0; i < amount; i++) {
        roll += Math.floor(Math.random() * 6) + 1;
      }
      if (userData.Role === '白龍馬') roll += 2 * amount;
      if (userData.Role === '唐三藏' && roleTrait?.isCursed) roll = Math.max(1, Math.floor(roll / 2));

      // Apply multiplier
      roll = roll * moveMultiplier;

      setStepsRemaining(roll);
      setMoveMultiplier(1); // Reset after single use
      setIsRolling(false);
      // Use functional update to avoid overwriting concurrent state changes (e.g. combat dice rewards)
      setUserData(prev => prev ? { ...prev, EnergyDice: newDiceCount } : null);
      setModalMessage({ text: `修行法輪轉動完成！獲得步數：${roll}`, type: 'success' });
    }, 800);
  };

  const handleExecuteGoldenDice = async (steps: number) => {
    if (!userData || (userData.GoldenDice || 0) < 1) return;

    setShowGoldenDicePicker(false);
    setIsRolling(true);
    const newGoldenCount = (userData.GoldenDice || 0) - 1;

    // Fire DB write immediately before the animation delay
    const dbWrite = supabase
      .from('CharacterStats')
      .update({ GoldenDice: newGoldenCount })
      .eq('UserID', userData.UserID);

    setTimeout(async () => {
      const { error } = await dbWrite;
      if (error) {
        setIsRolling(false);
        setModalMessage({ text: '萬能奇蹟骰扣除失敗，請重試。', type: 'error' });
        return;
      }
      setStepsRemaining(steps);
      setUserData(prev => prev ? { ...prev, GoldenDice: newGoldenCount } : null);
      setIsRolling(false);
      setModalMessage({ text: `萬能奇蹟骰已發動！精準鎖定 ${steps} 步！`, type: 'success' });
    }, 800);
  };

  const handleMoveCharacter = async (q: number, r: number, dist: number, zoneId?: string, newFacing?: number) => {
    if (!userData) return;
    setIsSyncing(true);
    try {
      let finalQ = q;
      let finalR = r;
      let remaining = Math.max(0, stepsRemaining - dist);
      let penaltyText = "";
      let newFines = userData.TotalFines;
      let finalFacing = newFacing ?? userData.Facing ?? 0;

      // 貪區 (慾望泥沼): 強制滯留，行動力歸零
      if (zoneId === 'greed' && !todayCompletedQuestIds.includes('q6') && !todayCompletedQuestIds.includes('q7')) {
        remaining = 0;
        penaltyText = "你陷入了慾望泥沼，本回合行動力歸零！";
      }

      // 嗔區 (焦熱荒原): 熔岩灼傷，增加罰金 (修為受損)
      if (zoneId === 'anger' && !todayCompletedQuestIds.includes('q1') && !todayCompletedQuestIds.includes('q2')) {
        newFines += 50;
        penaltyText = penaltyText ? penaltyText + " 且遭到焦熱熔岩灼傷，業力增加！" : "遭到焦熱熔岩灼傷，業力增加！";
      }

      // 痴區 (虛妄流沙): 回合結束且停留在該處時，發生隨機位移
      if (remaining === 0 && zoneId === 'delusion' && !todayCompletedQuestIds.includes('q4')) {
        const drift = [
          { q: 1, r: -1 }, { q: 1, r: 0 }, { q: 0, r: 1 },
          { q: -1, r: 1 }, { q: -1, r: 0 }, { q: 0, r: -1 }
        ];
        const rand = drift[Math.floor(Math.random() * drift.length)];
        finalQ += rand.q;
        finalR += rand.r;
        penaltyText = penaltyText ? penaltyText + " 並在虛妄流沙中迷失方向！" : "在虛妄流沙中迷失方向，發生強制位移！";
      }

      const { error } = await supabase.from('CharacterStats')
        .update({ CurrentQ: finalQ, CurrentR: finalR, TotalFines: newFines, Facing: finalFacing })
        .eq('UserID', userData.UserID);
      if (error) throw error;

      setUserData(prev => prev ? { ...prev, CurrentQ: finalQ, CurrentR: finalR, TotalFines: newFines, Facing: finalFacing } : null);
      setStepsRemaining(remaining);

      if (penaltyText) {
        setModalMessage({ text: penaltyText, type: 'error' });
      }
    } catch (err) {
      setModalMessage({ text: "移動失敗，法陣傳送受阻。", type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };


  const handleCheckInAction = async (quest: Quest) => {
    if (!userData) return;
    setIsSyncing(true);
    try {
      const res = await processCheckInTransaction(userData.UserID, quest.id, quest.title, quest.reward, quest.dice);

      if (res.success && res.user) {
        const { data: newLogs } = await supabase.from('DailyLogs').select('*').eq('UserID', userData.UserID);
        const updatedLogs = (newLogs as DailyLog[]) || [];
        setUserData(res.user as CharacterStats);
        setLogs(updatedLogs);
        setModalMessage(res.rewardCapped
          ? { text: "破咒打卡完成，今日三項修為已滿，本次不計修為。", type: 'info' }
          : { text: "修為提升，法喜充滿！", type: 'success' }
        );
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

      const actualReward: number = targetLogs[0].RewardPoints ?? quest.reward;
      const newExp = Math.max(0, userData.Exp - actualReward);
      const newLevel = calculateLevelFromExp(newExp);
      const roleInfo = ROLE_CURE_MAP[userData.Role];

      const update: Partial<CharacterStats> = {
        Exp: newExp,
        Level: newLevel,
        EnergyDice: Math.max(0, userData.EnergyDice - (quest.dice || 0)),
        Coins: Math.max(0, userData.Coins - Math.floor(actualReward * 0.1)),
      };

      // Reverse level-up stat bonuses if level dropped
      if (newLevel < userData.Level) {
        const growthRates = ROLE_GROWTH_RATES[userData.Role] || {};
        const levelsLost = userData.Level - newLevel;
        for (const [stat, rate] of Object.entries(growthRates)) {
          const key = stat as keyof CharacterStats;
          const current = (userData[key] as number) ?? 0;
          (update as any)[key] = Math.max(0, current - (rate as number) * levelsLost);
        }
      }

      // Reverse cure bonus if applicable
      if (roleInfo?.cureTaskId === quest.id) {
        const statKey = roleInfo.bonusStat;
        const current = (update as any)[statKey] ?? (userData[statKey] as number);
        (update as any)[statKey] = Math.max(10, current - 2);
      }

      await supabase.from('CharacterStats').update(update).eq('UserID', userData.UserID);
      const { data: newLogs } = await supabase.from('DailyLogs').select('*').eq('UserID', userData.UserID);
      const updatedLogs = (newLogs as DailyLog[]) || [];

      setLogs(updatedLogs);
      setUserData({ ...userData, ...update } as CharacterStats);
      setUndoTarget(null);
      setModalMessage({ text: "時光回溯成功，心識已歸位。", type: 'success' });
    } catch (err) { setModalMessage({ text: "回溯失敗，業力阻擋。", type: 'error' }); } finally { setIsSyncing(false); }
  };

  const handlePurchaseSuccess = async () => {
    // Re-fetch user and team data to update UI Coins & Inventory
    if (!userData) return;
    try {
      const { data: stats } = await supabase.from('CharacterStats').select('*').eq('UserID', userData.UserID).single();
      if (stats) setUserData(prev => ({ ...prev, ...stats }));

      if (userData.TeamName) {
        const { data: tSettings } = await supabase.from('TeamSettings').select('*').eq('team_name', userData.TeamName).single();
        if (tSettings) setTeamSettings(tSettings);
      }
    } catch (e) {
      console.error("Failed to refresh store data", e);
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
        localStorage.setItem('starry_session_uid', match.UserID);
        localStorage.setItem('starry_session_expiry', String(Date.now() + 24 * 60 * 60 * 1000));
        const { data: userLogs } = await supabase.from('DailyLogs').select('*').eq('UserID', match.UserID);
        const logsArray = (userLogs as DailyLog[]) || [];

        if (match.TeamName) {
          const { data: ts } = await supabase.from('TeamSettings').select('*').eq('team_name', match.TeamName).single();
          if (ts) setTeamSettings(ts);
        }

        setUserData(match);
        setLogs(logsArray);
        setView('app');
      } else { setModalMessage({ text: "查無此修行者印記。", type: 'error' }); }
    } catch (err) { setModalMessage({ text: "靈通感應異常。", type: 'error' }); } finally { setIsSyncing(false); }
  };

  const handleRegisterInput = (data: any) => {
    // Check fortunes evaluation
    const evalRes = evaluateFate(data.fortunes);
    if (evalRes.isTie) {
      setTieBreakData({ ...data, evalRes });
    } else {
      executeRegisterFlow({ ...data, assignedRole: evalRes.assignedRole, lowestScore: evalRes.lowestScore });
    }
  };

  const executeRegisterFlow = async (data: any) => {
    setIsSyncing(true);
    const { name, phone: phoneRaw, email: emailRaw, fortunes, assignedRole, lowestScore } = data;
    const email = emailRaw?.trim()?.toLowerCase();
    const phone = standardizePhone(phoneRaw);

    // Default Starting Values
    let newLevel = 1;
    let newExp = 0;
    let newDice = 3;
    let newInventory: string[] = [];
    let ddaDiff = 'Normal';
    let welcomeMessage = `天命已定！您的守護角色為【${assignedRole}】。`;

    // Apply Compensation Logic
    if (lowestScore >= 1 && lowestScore <= 3) {
      newExp = 1970; // Equivalent to Level 5 approx
      newLevel = 5;
      newInventory.push('t_shield_3d'); // 假裝送個限時道具
      welcomeMessage += `\n星象顯示您正處於極大的考驗中。佛祖特賜您「開局修為加成 (Lv.5)」與「新手防禦罩」，請務必堅持每日定課，逆轉命運！`;
    } else if (lowestScore >= 4 && lowestScore <= 7) {
      newDice = 5; // Extra 2 dice
      welcomeMessage += `\n您的運勢正在十字路口，藉由本次親證班的定課，您將能突破現有的瓶頸。系統已額外補給 2 顆能量骰子。`;
    } else if (lowestScore >= 8 && lowestScore <= 10) {
      ddaDiff = 'Hard';
      welcomeMessage += `\n您的現實狀態極佳！系統已自動切換「菁英模式」，準備迎接更高強度的試煉吧！`;
    }

    const newChar: any = {
      UserID: phone, Name: name.trim(), Role: assignedRole,
      Level: newLevel, Exp: newExp, Coins: 0, Inventory: newInventory, EnergyDice: newDice,
      Savvy: 10, Luck: 10, Charisma: 10, Spirit: 10, Physique: 10, Potential: 10,
      Streak: 0, LastCheckIn: null, TotalFines: 0, CurrentQ: 0, CurrentR: 0,
      Email: email, InitialFortunes: fortunes, DDA_Difficulty: ddaDiff
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
      localStorage.setItem('starry_session_uid', newChar.UserID);
      localStorage.setItem('starry_session_expiry', String(Date.now() + 24 * 60 * 60 * 1000));
      setUserData(newChar);
      setModalMessage({ text: welcomeMessage, type: 'success' });
      setView('app');
    } catch (err) {
      setModalMessage({ text: "轉生受阻。可能該手機號碼已經註冊落籍。", type: 'error' });
    } finally {
      setIsSyncing(false);
      setTieBreakData(null);
    }
  };

  const handleTieBreakSelect = (role: string) => {
    executeRegisterFlow({ ...tieBreakData, assignedRole: role, lowestScore: tieBreakData.evalRes.lowestScore });
  };

  const handleStartAdventure = async () => {
    if (!userData || userData.EnergyDice < ADVENTURE_COST) {
      setModalMessage({ text: `能量不足！啟動需要 ${ADVENTURE_COST} 顆骰子。`, type: 'error' });
      return;
    }
    // Re-fetch fresh entity list (monsters, chests) every time before entering the map
    const { data: freshEntities } = await supabase.from('MapEntities').select('*').eq('is_active', true);
    if (freshEntities) {
      setMapEntities(prev => {
        const teammates = prev.filter(e => typeof e.id === 'string' && e.id.startsWith('teammate_'));
        return [...teammates, ...freshEntities];
      });
    }
    setView('map');
  };

  const handleLogout = () => { localStorage.removeItem('starry_session_uid'); localStorage.removeItem('starry_session_expiry'); setUserData(null); setView('login'); };

  // One-time static data load — world map terrain, settings, history
  // Separated from the login useEffect so userData changes don't re-fetch and potentially clobber mapData
  useEffect(() => {
    const loadStaticData = async () => {
      const { data: mapWorldData } = await supabase.from('world_maps').select('data').eq('id', 'main_world_map').single();
      if (mapWorldData?.data) {
        const fetchedData = mapWorldData.data as { terrain?: Record<string, string>, config?: { corridorL: number, corridorW: number } };
        if (fetchedData.terrain) setMapData(fetchedData.terrain);
        if (fetchedData.config) {
          setCorridorL(fetchedData.config.corridorL || DEFAULT_CONFIG.CORRIDOR_L);
          setCorridorW(fetchedData.config.corridorW || DEFAULT_CONFIG.CORRIDOR_W);
        }
      }

      const { data: settingsData } = await supabase.from('SystemSettings').select('*');
      if (settingsData) {
        const sObj = settingsData.reduce((acc: any, curr: any) => ({ ...acc, [curr.SettingName]: curr.Value }), {});
        setSystemSettings({
          TopicQuestTitle: sObj.TopicQuestTitle || '修行主題載入中',
          RegistrationMode: (sObj.RegistrationMode as 'open' | 'roster') || 'open',
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
      // Fetch teammates' positions for map interaction
      const fetchTeammates = async (teamName: string, selfId: string) => {
        try {
          const { data: mates } = await supabase
            .from('CharacterStats')
            .select('UserID, Name, Role, CurrentQ, CurrentR, EnergyDice, Level')
            .eq('TeamName', teamName)
            .neq('UserID', selfId);
          if (mates && mates.length > 0) {
            const teammateEntities = mates.map((m: any) => ({
              id: `teammate_${m.UserID}`,
              q: m.CurrentQ,
              r: m.CurrentR,
              type: 'teammate',
              icon: ROLE_CURE_MAP[m.Role]?.avatar || '👤',
              name: m.Name || m.UserID,
              is_active: true,
              data: { userId: m.UserID, role: m.Role, level: m.Level, dice: m.EnergyDice }
            }));
            setMapEntities(prev => [...prev, ...teammateEntities]);
          }
        } catch (_) { /* non-critical */ }
      };

      // LINE OAuth session handoff — handle ?line_uid, ?line_bound, ?line_error params
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const lineUid = params.get('line_uid');
        const lineBound = params.get('line_bound');
        const lineError = params.get('line_error');
        if (lineUid || lineBound || lineError) {
          window.history.replaceState({}, '', '/');
          if (lineUid) {
            localStorage.setItem('starry_session_uid', decodeURIComponent(lineUid));
            localStorage.setItem('starry_session_expiry', String(Date.now() + 24 * 60 * 60 * 1000));
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

      const savedUid = (() => {
        const uid = localStorage.getItem('starry_session_uid');
        const expiry = Number(localStorage.getItem('starry_session_expiry') || 0);
        if (uid && Date.now() < expiry) return uid;
        localStorage.removeItem('starry_session_uid');
        localStorage.removeItem('starry_session_expiry');
        return null;
      })();
      if (savedUid && !userData) {
        // Fetch map entities only once on initial login (not on every userData change)
        try {
          const { data: pEntities, error: entErr } = await supabase.from('MapEntities').select('*').eq('is_active', true);
          if (pEntities && !entErr) {
            setMapEntities(pEntities);
          }
        } catch (e) {
          console.error("Error fetching map entities:", e);
        }
        const { data: stats, error } = await supabase.from('CharacterStats').select('*').eq('UserID', savedUid).single();
        if (stats && !error) {
          const { data: userLogs } = await supabase.from('DailyLogs').select('*').eq('UserID', stats.UserID);
          const logsArray = (userLogs as DailyLog[]) || [];

          // Fetch TeamSettings if User belongs to a Team
          if (stats.TeamName) {
            const { data: tSettings } = await supabase.from('TeamSettings').select('*').eq('team_name', stats.TeamName).single();
            if (tSettings) setTeamSettings(tSettings);
            const { count } = await supabase.from('CharacterStats').select('*', { count: 'exact', head: true }).eq('TeamName', stats.TeamName);
            setTeamMemberCount(count || 1);
            await fetchTeammates(stats.TeamName, stats.UserID);

            // Auto-draw fallback: trigger for ALL squads every Monday after noon.
            // Do NOT gate on teamAlreadyDrew — if this squad drew manually but others didn't,
            // the fallback would skip those squads. autoDrawAllSquads() already skips squads that drew.
            const nowTaiwan = new Date(Date.now() + 8 * 3600 * 1000);
            const isMondayAfterNoon = nowTaiwan.getUTCDay() === 1 && nowTaiwan.getUTCHours() >= 12;
            if (isMondayAfterNoon) {
              const drawRes = await autoDrawAllSquads();
              if (drawRes.success && (drawRes.drawnCount ?? 0) > 0) {
                // Refresh teamSettings so UI reflects the newly drawn quest
                const { data: freshTS } = await supabase.from('TeamSettings').select('*').eq('team_name', stats.TeamName).single();
                if (freshTS) setTeamSettings(freshTS);
              }
            }
          }

          setUserData(stats as CharacterStats);
          setLogs(logsArray);

          // Fetch w4 applications for this user
          const w4Res = await getW4Applications({ userId: stats.UserID });
          if (w4Res.success) setW4Applications(w4Res.applications);

          // If squad leader, fetch pending apps for review
          if (stats.IsCaptain && stats.TeamName) {
            const pendingRes = await getW4Applications({ squadName: stats.TeamName, status: 'pending' });
            if (pendingRes.success) setPendingW4Apps(pendingRes.applications);
          }

          // If commandant, fetch squad_approved apps for final review
          if (stats.IsCommandant) {
            const commandantRes = await getW4Applications({ status: 'squad_approved' });
            if (commandantRes.success) setSquadApprovedW4Apps(commandantRes.applications);
          }

          setView('app');
        } else { setView(v => v === 'loading' ? 'login' : v); }
      } else if (!savedUid) { setView(v => v === 'loading' ? 'login' : v); }
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
      getW4Applications({ userId: userData.UserID }).then(res => {
        if (res.success) setW4Applications(res.applications);
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
      { label: '一般修行者', value: 'player' },
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
    <div className="min-h-screen bg-slate-950 text-slate-200 pb-40 text-center animate-in fade-in">
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

      <nav className="sticky top-0 z-20 bg-slate-950/90 backdrop-blur-md flex p-4 gap-2 border-b border-white/5 shadow-xl overflow-x-auto no-scrollbar">
        <button onClick={() => setActiveTab('daily')} className={`shrink-0 px-6 py-4 rounded-2xl text-xs font-black transition-all ${activeTab === 'daily' ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/20' : 'bg-slate-900 text-slate-50'}`}>修行定課</button>
        <button onClick={handleOpenWeeklyTab} className={`shrink-0 px-6 py-4 rounded-2xl text-xs font-black transition-all ${activeTab === 'weekly' ? 'bg-orange-600 text-white shadow-lg' : 'bg-slate-900 text-slate-50'}`}>加分副本</button>
        <button onClick={() => setActiveTab('shop')} className={`shrink-0 px-6 py-4 rounded-2xl text-xs font-black transition-all ${activeTab === 'shop' ? 'bg-yellow-600 text-white shadow-lg shadow-yellow-600/20' : 'bg-slate-900 text-slate-50'}`}>🏪藏寶閣</button>
        <button onClick={() => setActiveTab('rank')} className={`shrink-0 px-6 py-4 rounded-2xl text-xs font-black transition-all ${activeTab === 'rank' ? 'bg-orange-600 text-white shadow-lg' : 'bg-slate-900 text-slate-50'}`}>修為榜</button>
        <button onClick={() => setActiveTab('stats')} className={`shrink-0 px-6 py-4 rounded-2xl text-xs font-black transition-all ${activeTab === 'stats' ? 'bg-orange-600 text-white shadow-lg' : 'bg-slate-900 text-slate-50'}`}>六維與罰金</button>
        {showCaptainTab && (
          <button onClick={handleOpenCaptainTab} className={`shrink-0 px-6 py-4 rounded-2xl text-xs font-black transition-all ${activeTab === 'captain' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-slate-900 text-slate-50'}`}>👩‍✈️指揮所</button>
        )}
        {showCommandantTab && (
          <button onClick={() => setActiveTab('commandant')} className={`shrink-0 px-6 py-4 rounded-2xl text-xs font-black transition-all ${activeTab === 'commandant' ? 'bg-rose-700 text-white shadow-lg shadow-rose-700/20' : 'bg-slate-900 text-slate-50'}`}>⚔️指揮部</button>
        )}
      </nav>

      <main className="max-w-md mx-auto p-6 space-y-8">
        {activeTab === 'daily' && (
          <DailyQuestsTab
            weeklyQuestId={teamSettings?.mandatory_quest_id}
            logs={logs}
            logicalTodayStr={logicalTodayStr}
            userInventory={typeof userData?.Inventory === 'string' ? JSON.parse(userData.Inventory) : (userData?.Inventory || [])}
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
            temporaryQuests={temporaryQuests.filter(t => t.active)}
            userInventory={typeof userData?.Inventory === 'string' ? JSON.parse(userData.Inventory) : (userData?.Inventory || [])}
            w4Applications={w4Applications}
            weeklyReview={weeklyReview}
            isLoadingReview={isLoadingReview}
            onCheckIn={handleCheckInAction}
            onUndo={setUndoTarget}
            onSubmitW4={handleSubmitW4}
          />
        )}
        {activeTab === 'rank' && <RankTab leaderboard={leaderboard} currentUserId={userData?.UserID} />}
        {activeTab === 'stats' && userData && <StatsTab userData={userData} roleTrait={roleTrait} />}
        {activeTab === 'shop' && userData && (
          <ShopTab
            userData={userData}
            teamSettings={teamSettings}
            teamMemberCount={teamMemberCount}
            onPurchaseSuccess={handlePurchaseSuccess}
            onShowMessage={(msg, type) => setModalMessage({ text: msg, type })}
          />
        )}
        {activeTab === 'captain' && showCaptainTab && userData && (
          <CaptainTab
            teamName={userData.TeamName || '未編組'}
            teamSettings={teamSettings}
            pendingW4Apps={pendingW4Apps}
            onDrawWeeklyQuest={handleDrawWeeklyQuest}
            onReviewW4={handleReviewW4BySquad}
            onGetAIBriefing={handleGetAIBriefing}
            aiBriefing={aiBriefing}
            isLoadingBriefing={isLoadingBriefing}
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
          />
        )}
        {activeTab === 'commandant' && showCommandantTab && userData && (
          <CommandantTab
            userData={userData}
            apps={squadApprovedW4Apps}
            onRefresh={async () => {
              const res = await getW4Applications({ status: 'squad_approved' });
              if (res.success) setSquadApprovedW4Apps(res.applications);
            }}
            onShowMessage={(msg, type) => setModalMessage({ text: msg, type })}
          />
        )}
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
        <RegisterForm
          onRegister={handleRegisterInput}
          onGoToLogin={() => setView('login')}
          isSyncing={isSyncing}
        />
      )}

      {/* Tie Break Modal Overlay */}
      {tieBreakData && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6 bg-slate-950/95 backdrop-blur-md animate-in fade-in zoom-in duration-300">
          <div className="bg-slate-900 border-2 border-indigo-500/30 p-8 rounded-[2.5rem] shadow-2xl max-w-sm w-full space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-black text-white">天命抉擇</h2>
              <p className="text-sm text-indigo-400 font-bold leading-relaxed">
                五運輪盤顯示，您在多個領域遇到同等強烈的考驗。<br />請選出您此次最渴望跨越的難關：
              </p>
            </div>
            <div className="space-y-3">
              {tieBreakData.evalRes.tieOptions.map((opt: string) => (
                <button
                  key={opt}
                  onClick={() => handleTieBreakSelect(opt)}
                  disabled={isSyncing}
                  className="w-full py-4 bg-slate-800 hover:bg-indigo-600 text-white font-black rounded-2xl transition-colors disabled:opacity-50"
                >
                  選擇化身為【{opt}】
                </button>
              ))}
            </div>
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
          temporaryQuests={temporaryQuests}
          squadApprovedW4Apps={squadApprovedW4Apps}
          adminLogs={adminLogs}
          testimonies={testimonies}
          onAddTempQuest={handleAddTempQuest}
          onToggleTempQuest={handleToggleTempQuest}
          onDeleteTempQuest={handleDeleteTempQuest}
          onTriggerSnapshot={handleTriggerSnapshot}
          onCheckW3Compliance={handleCheckW3Compliance}
          onAutoDrawAllSquads={handleAutoDrawAllSquads}
          onImportRoster={handleImportRoster}
          onFinalReviewW4={handleFinalReviewW4}
          onClose={() => setView('login')}
        />
      )}

      {view === 'app' && <HomeView />}
      {view === 'map' && userData && (
        <div className="fixed inset-0 z-10 flex flex-col">
          {/* 冒險狀態列：詛咒/天賦效果 + 黃金骰子 */}
          <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-2 bg-slate-950/90 backdrop-blur-sm border-b border-slate-800">
            <span className={`text-[10px] font-black shrink-0 ${roleTrait?.isCursed ? 'text-red-400' : 'text-emerald-400'}`}>
              {roleTrait?.isCursed ? `☠️ ${roleTrait.curseName}` : '✨ 天命覺醒'}
            </span>
            <p className="text-[10px] text-white/50 leading-tight truncate flex-1 text-center">
              {roleTrait?.isCursed ? roleTrait.curseEffect : roleTrait?.talent}
            </p>
            <span className="text-[10px] font-black text-amber-400 shrink-0">⭐ {userData.GoldenDice}</span>
          </div>
          <div className="flex-1 min-h-0 relative overflow-hidden">
          <WorldMap
          userData={userData}
          mapData={mapData}
          corridorL={corridorL}
          corridorW={corridorW}
          stepsRemaining={stepsRemaining}
          moveMultiplier={moveMultiplier}
          onUpdateMultiplier={setMoveMultiplier}
          isRolling={isRolling}
          onRollDice={handleRollDice}
          onMoveCharacter={handleMoveCharacter}
          onBack={() => setView('app')}
          initialQ={userData.CurrentQ}
          initialR={userData.CurrentR}
          roleTrait={roleTrait}
          todayCompletedQuestIds={todayCompletedQuestIds}
          onShowMessage={(msg, type) => setModalMessage({ text: msg, type })}
dbEntities={mapEntities}
          worldState={systemSettings.WorldState}
          onEntityTrigger={handleEntityTrigger}
          onUpdateUserData={(data) => {
            if ((data as any).removeEntityId) {
              setMapEntities(prev => prev.filter(e => e.id !== (data as any).removeEntityId));
            }
            setUserData(prev => prev ? { ...prev, ...data } : null);
          }}
          onUpdateSteps={setStepsRemaining}
        />
          </div>
        </div>
      )}

      {showGoldenDicePicker && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center p-6 bg-slate-950/95 backdrop-blur-xl animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-yellow-500/30 p-8 rounded-[2.5rem] shadow-[0_0_50px_rgba(234,179,8,0.2)] max-w-sm w-full text-center space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-br from-yellow-300 to-amber-600">🌟 萬能奇蹟骰</h2>
              <p className="text-sm text-yellow-600/80 font-bold leading-relaxed">
                指定您的下一步。慎重選擇落點。
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3, 4, 5, 6].map(num => (
                <button
                  key={num}
                  onClick={() => handleExecuteGoldenDice(num)}
                  className="aspect-square flex items-center justify-center text-3xl font-black rounded-2xl bg-slate-800 border border-slate-700 hover:bg-yellow-500 hover:text-black hover:border-yellow-400 active:scale-95 transition-all text-slate-300"
                >
                  {num}
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowGoldenDicePicker(false)}
              className="w-full py-4 text-slate-500 font-bold hover:text-slate-300 transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}

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