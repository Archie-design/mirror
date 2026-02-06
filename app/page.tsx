"use client";

import React, { useState, useEffect, useMemo } from 'react';
// 使用 ESM CDN 匯入以解決預覽環境中的模組解析錯誤
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { 
  Flame, Trophy, LogOut, Shield, Brain, Heart, Zap, Sparkles, Dice5,
  AlertTriangle, CheckCircle2, Target, Crown, UserPlus, ArrowRight,
  User as UserIcon, HeartPulse, Home, Briefcase, Coins, Wallet, History,
  Loader2, Trash2, RefreshCw, Lock, X, Save, BarChart3, RotateCcw,
  Users, Activity, MessageSquare, ChevronRight, Settings
} from 'lucide-react';

// --- 0. 型別定義 ---

interface CharacterStats {
  UserID: string;
  Name: string;
  Role: string;
  Level: number;
  Exp: number; // 系統內稱為「修為」
  EnergyDice: number; // 「能量骰子」
  Spirit: number; // 神識
  Physique: number; // 根骨
  Charisma: number; // 魅力
  Savvy: number; // 悟性
  Luck: number; // 機緣
  Potential: number; // 潛力
  Streak: number;
  LastCheckIn: string | null;
  TotalFines: number; // 「定課罰金」
}

interface DailyLog {
  id: string;
  Timestamp: string;
  UserID: string;
  QuestID: string;
  QuestTitle: string;
  RewardPoints: number;
}

interface Quest {
  id: string;
  title: string;
  sub?: string; // 設為選填以符合動態任務物件
  reward: number;
  dice?: number;
  icon?: string;
  limit?: number;
}

interface SystemSettings {
  MandatoryQuestId: string;
  TopicQuestTitle: string;
}

// --- 1. 初始化 Supabase (依據環境變數) ---

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

const ADMIN_PASSWORD = "123"; 

// --- 2. 常數與設定 (對標《星光西遊》技術規格手冊) ---

const ROLE_CURE_MAP: Record<string, { poison: string; color: string; cureTaskId: string; bonusStat: keyof CharacterStats }> = {
  '孫悟空': { poison: '破嗔', color: 'bg-red-500', cureTaskId: 'q2', bonusStat: 'Spirit' },
  '豬八戒': { poison: '破貪', color: 'bg-emerald-500', cureTaskId: 'q6', bonusStat: 'Physique' },
  '沙悟淨': { poison: '破痴', color: 'bg-purple-500', cureTaskId: 'q4', bonusStat: 'Savvy' },
  '白龍馬': { poison: '破慢', color: 'bg-orange-500', cureTaskId: 'q5', bonusStat: 'Charisma' },
  '唐三藏': { poison: '破疑', color: 'bg-blue-500', cureTaskId: 'q3', bonusStat: 'Potential' }
};

const DAILY_QUEST_CONFIG: Quest[] = [
  { id: 'q1', title: '打拳', sub: '身體開發', reward: 200, dice: 1 },
  { id: 'q2', title: '感恩冥想', sub: '對治嗔心', reward: 100, dice: 1 },
  { id: 'q3', title: '當下之舞', sub: '對治疑心', reward: 100, dice: 1 },
  { id: 'q4', title: '嗯啊吽七次', sub: '覺醒痴念', reward: 100, dice: 1 },
  { id: 'q5', title: '五感恩', sub: '放下傲慢', reward: 100, dice: 1 },
  { id: 'q6', title: '海鮮素', sub: '節制貪慾', reward: 100, dice: 1 },
  { id: 'q7', title: '子時入睡', sub: '能量補給', reward: 100, dice: 1 }
];

const WEEKLY_QUEST_CONFIG: Quest[] = [
  { id: 'w1', title: '小天使通話', sub: '關心夥伴 (15min)', reward: 500, limit: 1, icon: '👼' },
  { id: 'w2', title: '參加心成活動', sub: '聚會、培訓、活動', reward: 500, limit: 2, icon: '🏛️' },
  { id: 'w3', title: '家人互動親證', sub: '視訊或品質陪伴', reward: 500, limit: 1, icon: '🏠' },
  { id: 'w4', title: '傳愛分數', sub: '訪談成功加分', reward: 1000, limit: 99, icon: '❤️' }
];

// --- 3. UI 子組件 ---

const StatCard = ({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) => (
  <div className="bg-slate-900 border-2 border-slate-800 p-5 rounded-4xl shadow-xl text-left">
    <div className="flex items-center gap-2 mb-2">
      {icon}
      <span className="text-[10px] font-black text-slate-500 tracking-widest uppercase">{label}</span>
    </div>
    <div className="flex items-center gap-4">
      <span className="text-4xl font-black text-white">{value || 0}</span>
      <div className="h-2.5 flex-1 bg-slate-800 rounded-full overflow-hidden shadow-inner">
        <div 
          className={`h-full ${color} opacity-70 transition-all duration-1000`} 
          style={{ width: `${Math.min(100, ((value || 0) / 50) * 100)}%` }}
        ></div>
      </div>
    </div>
  </div>
);

const MessageBox = ({ message, onClose, type = 'info' }: { message: string, onClose: () => void, type?: 'info' | 'error' | 'success' }) => (
  <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-sm animate-in fade-in duration-300">
    <div className="bg-slate-900 border-2 border-slate-800 p-8 rounded-4xl shadow-2xl max-w-sm w-full text-center space-y-6">
      <div className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center ${type === 'error' ? 'bg-red-500/20 text-red-500' : type === 'success' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-blue-500/20 text-blue-500'}`}>
        {type === 'error' ? <AlertTriangle size={40} /> : type === 'success' ? <CheckCircle2 size={40} /> : <Sparkles size={40} />}
      </div>
      <p className="text-xl font-bold text-white leading-relaxed">{message}</p>
      <button onClick={onClose} className="w-full py-4 bg-orange-600 hover:bg-orange-500 text-white font-black rounded-2xl transition-all active:scale-95">確認領旨</button>
    </div>
  </div>
);

// --- 4. 主要 App 元件 ---

export default function App() {
  const [view, setView] = useState<'login' | 'register' | 'app' | 'loading' | 'admin'>('loading');
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<'daily' | 'weekly' | 'stats' | 'rank'>('daily');
  const [userData, setUserData] = useState<CharacterStats | null>(null);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [leaderboard, setLeaderboard] = useState<CharacterStats[]>([]);
  const [systemSettings, setSystemSettings] = useState<SystemSettings>({ MandatoryQuestId: 'q2', TopicQuestTitle: '載入中...' });
  const [modalMessage, setModalMessage] = useState<{ text: string, type: 'info' | 'error' | 'success' } | null>(null);
  const [undoTarget, setUndoTarget] = useState<Quest | null>(null);
  const [adminAuth, setAdminAuth] = useState(false);
  const [allPlayers, setAllPlayers] = useState<CharacterStats[]>([]);
  
  // 管理員編輯用暫存狀態
  const [editTopicTitle, setEditTopicTitle] = useState('');

  const todayStr = new Date().toDateString();

  // 雙週週期判定
  const currentBiWeeklyMonday = useMemo(() => {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() || 7) - 1));
    monday.setHours(0, 0, 0, 0);
    return monday;
  }, []);

  const isTopicDone = useMemo(() => 
    logs.some(l => l.QuestID === 't1' && new Date(l.Timestamp) >= currentBiWeeklyMonday),
    [logs, currentBiWeeklyMonday]
  );

  // 1. 初始化與工作階段管理
  useEffect(() => {
    const init = async () => {
      const savedUid = sessionStorage.getItem('starry_session_uid');
      if (savedUid) {
        try {
          const { data, error } = await supabase.from('CharacterStats').select('*').eq('UserID', savedUid).single();
          if (data && !error) {
            setUserData(data as CharacterStats);
            const { data: userLogs } = await supabase.from('DailyLogs').select('*').eq('UserID', data.UserID);
            setLogs((userLogs as DailyLog[]) || []);
            setView('app');
            return;
          }
        } catch (e) { console.error("Session Init Error:", e); }
      }
      setView('login');
    };
    init();
  }, []);

  // 2. 同步法界數據
  useEffect(() => {
    async function fetchData() {
      if (!supabase || view === 'loading') return;
      
      try {
        const { data: settingsData } = await supabase.from('SystemSettings').select('*');
        if (settingsData) {
          const settingsObj = settingsData.reduce((acc: any, curr: any) => ({ ...acc, [curr.SettingName]: curr.Value }), {});
          const currentSettings = {
            MandatoryQuestId: settingsObj.MandatoryQuestId || 'q2',
            TopicQuestTitle: settingsObj.TopicQuestTitle || '未公佈主題'
          };
          setSystemSettings(currentSettings);
          setEditTopicTitle(currentSettings.TopicQuestTitle);
        }

        const { data: rankData } = await supabase.from('CharacterStats').select('*').order('Exp', { ascending: false });
        if (rankData) {
          setLeaderboard(rankData as CharacterStats[]);
          setAllPlayers(rankData as CharacterStats[]);
        }
      } catch (e) { console.error("Global Data Sync Error:", e); }
    }
    fetchData();
  }, [view, activeTab, isSyncing]);

  // 3. 修行打卡邏輯
  const handleCheckIn = async (quest: Quest) => {
    if (!supabase || !userData) return;
    
    const dailyCount = logs.filter(l => l.QuestID.startsWith('q') && new Date(l.Timestamp).toDateString() === todayStr).length;
    if (dailyCount >= 3 && quest.id.startsWith('q')) {
      setModalMessage({ text: "今日修為已達 3 項定課上限，請保持覺察。", type: 'info' });
      return;
    }

    setIsSyncing(true);
    const now = new Date();
    const roleInfo = ROLE_CURE_MAP[userData.Role];
    const isCure = roleInfo?.cureTaskId === quest.id;

    try {
      const logEntry = { 
        Timestamp: now.toISOString(), 
        UserID: userData.UserID, 
        QuestID: quest.id, 
        QuestTitle: quest.title + (isCure ? " (天命對治)" : ""), 
        RewardPoints: quest.reward 
      };

      await supabase.from('DailyLogs').insert([logEntry]);

      let newExp = (userData.Exp || 0) + quest.reward;
      let newLevel = Math.max(1, Math.floor(newExp / 1000) + 1);
      const update: Partial<CharacterStats> = { 
        Exp: newExp, 
        Level: newLevel, 
        EnergyDice: (userData.EnergyDice || 0) + (quest.dice || 0), 
        LastCheckIn: todayStr 
      };
      
      if (isCure && roleInfo) { 
        const f = roleInfo.bonusStat; 
        update[f] = ((userData[f] as number) || 10) + 2; 
      }

      await supabase.from('CharacterStats').update(update).eq('UserID', userData.UserID);
      
      const { data: newLogs } = await supabase.from('DailyLogs').select('*').eq('UserID', userData.UserID);
      setLogs((newLogs as DailyLog[]) || []);
      setUserData({ ...userData, ...update });
    } catch (err) { 
      setModalMessage({ text: "法印刻印失敗，請檢查靈通連線。", type: 'error' }); 
    } finally { 
      setIsSyncing(false); 
    }
  };

  // 4. 時光回溯機制
  const handleUndoCheckIn = async (quest: Quest) => {
    if (!supabase || !userData || !quest) return;
    setIsSyncing(true);
    try {
      const { data: targetLogs } = await supabase
        .from('DailyLogs')
        .select('*')
        .eq('UserID', userData.UserID)
        .eq('QuestID', quest.id)
        .order('Timestamp', { ascending: false })
        .limit(1);

      if (!targetLogs || (targetLogs as DailyLog[]).length === 0) {
        setUndoTarget(null);
        return;
      }

      const logToUndo = targetLogs[0] as DailyLog;
      if (new Date(logToUndo.Timestamp).toDateString() !== todayStr) {
        setModalMessage({ text: "因果已定，僅限回溯今日之修行。", type: 'info' });
        setUndoTarget(null);
        return;
      }

      await supabase.from('DailyLogs').delete().eq('id', logToUndo.id);

      const roleInfo = ROLE_CURE_MAP[userData.Role];
      const isCure = roleInfo?.cureTaskId === quest.id;
      let newExp = Math.max(0, userData.Exp - quest.reward);
      let newLevel = Math.max(1, Math.floor(newExp / 1000) + 1);
      const update: Partial<CharacterStats> = { 
        Exp: newExp, 
        Level: newLevel, 
        EnergyDice: Math.max(0, userData.EnergyDice - (quest.dice || 0)) 
      };
      if (isCure && roleInfo) { 
        const f = roleInfo.bonusStat; 
        update[f] = Math.max(10, (userData[f] as number) - 2); 
      }
      
      await supabase.from('CharacterStats').update(update).eq('UserID', userData.UserID);
      
      const { data: newLogs } = await supabase.from('DailyLogs').select('*').eq('UserID', userData.UserID);
      setLogs((newLogs as DailyLog[]) || []);
      setUserData({ ...userData, ...update });
      setUndoTarget(null);
      setModalMessage({ text: "時光回溯成功，修為與增益已歸還法界。", type: 'success' });
    } catch (err) {
      setModalMessage({ text: "法力干擾，回溯失敗。", type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  // 5. 管理員邏輯
  const handleAdminAuth = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const pw = (new FormData(e.currentTarget)).get('password');
    if (pw === ADMIN_PASSWORD) {
      setAdminAuth(true);
    } else {
      setModalMessage({ text: "密令錯誤。", type: 'error' });
    }
  };

  const updateGlobalSetting = async (key: string, value: string) => {
    setIsSyncing(true);
    try {
      const { error } = await supabase.from('SystemSettings').update({ Value: value }).eq('SettingName', key);
      if (error) throw error;
      setSystemSettings(prev => ({ ...prev, [key]: value }));
      setModalMessage({ text: "大會規則已即時同步。", type: 'success' });
    } catch (err) {
      setModalMessage({ text: "同步失敗。", type: 'error' });
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
      const { data: allUsers } = await supabase.from('CharacterStats').select('*');
      const match = (allUsers as CharacterStats[])?.find(u => u.Name === name && u.UserID.endsWith(phoneSuffix));

      if (match) {
        sessionStorage.setItem('starry_session_uid', match.UserID);
        setUserData(match);
        const { data: userLogs } = await supabase.from('DailyLogs').select('*').eq('UserID', match.UserID);
        setLogs((userLogs as DailyLog[]) || []);
        setView('app');
      } else {
        setModalMessage({ text: "查無此修行者印記，請確認姓名與代碼。", type: 'error' });
      }
    } catch (err) {
      setModalMessage({ text: "法動開示失敗，請檢查連線。", type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('starry_session_uid');
    setUserData(null);
    setAdminAuth(false);
    setView('login');
  };

  // --- 視圖呈現 ---

  if (view === 'loading') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-10 text-center">
        <Loader2 className="w-16 h-16 text-orange-500 animate-spin mb-6 mx-auto" />
        <p className="text-orange-500 text-xl font-black tracking-widest animate-pulse">正在共感法界能量...</p>
      </div>
    );
  }

  if (view === 'login') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-10 space-y-12 text-center">
        <div className="animate-in zoom-in duration-700 flex flex-col items-center">
          <div className="w-32 h-32 bg-orange-600 rounded-4xl flex items-center justify-center shadow-2xl border-4 border-white/20 mb-6 text-white text-7xl italic text-center">🕉️</div>
          <h1 className="text-5xl font-black tracking-widest mb-2 text-white">星光西遊</h1>
          <p className="text-orange-400 text-lg font-bold uppercase tracking-[0.4em]">修行者轉生入口</p>
        </div>
        <form onSubmit={handleLogin} className="w-full max-w-sm space-y-6 text-center">
          <input name="name" required className="w-full bg-slate-900 border-2 border-slate-800 rounded-2xl p-6 text-white text-center text-xl focus:border-orange-500 outline-none transition-all placeholder:text-slate-600 font-bold" placeholder="冒險者姓名" />
          {/* 修正點：加入 maxLength, inputMode 與數字過濾邏輯 */}
          <input 
            name="phone" 
            required 
            type="password" 
            maxLength={3}
            inputMode="numeric"
            onInput={(e) => {
              (e.target as HTMLInputElement).value = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 3);
            }}
            className="w-full bg-slate-900 border-2 border-slate-800 rounded-2xl p-6 text-white text-center text-xl focus:border-orange-500 outline-none transition-all placeholder:text-slate-600 font-bold" 
            placeholder="手機末三碼" 
          />
          <button disabled={isSyncing} className="w-full py-7 rounded-4xl bg-orange-600 text-white font-black text-2xl shadow-xl active:scale-95 transition-all">連結靈魂印記</button>
          <div className="text-center">
            <button type="button" onClick={() => setView('admin')} className="text-slate-700 text-xs font-black uppercase tracking-widest hover:text-slate-500">大會中樞入口</button>
          </div>
        </form>
        {modalMessage && <MessageBox message={modalMessage.text} type={modalMessage.type} onClose={() => setModalMessage(null)} />}
      </div>
    );
  }

  if (view === 'admin') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 p-8">
        {!adminAuth ? (
          <div className="max-w-sm mx-auto mt-32 space-y-8 animate-in zoom-in-95">
             <header className="text-center space-y-4 text-center mx-auto">
               <div className="w-20 h-20 bg-slate-800 rounded-3xl mx-auto flex items-center justify-center shadow-xl border border-slate-700 text-orange-500"><Lock size={40} /></div>
               <h1 className="text-3xl font-black text-white text-center">管理員驗證</h1>
               <p className="text-slate-500 font-bold text-sm text-center">請輸入修行中樞密令</p>
             </header>
             <form onSubmit={handleAdminAuth} className="space-y-6 text-center">
                <input name="password" type="password" required className="w-full bg-slate-900 border-2 border-slate-800 rounded-2xl p-5 text-white text-center text-xl outline-none focus:border-orange-500 transition-all font-bold" placeholder="密令" autoFocus />
                <div className="flex gap-4 text-center">
                  <button type="button" onClick={() => setView('login')} className="flex-1 py-4 bg-slate-800 text-slate-400 font-bold rounded-2xl text-center">取消</button>
                  <button className="flex-2 py-4 bg-orange-600 text-white font-black rounded-2xl shadow-lg active:scale-95 transition-all text-center">驗證登入</button>
                </div>
             </form>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-12 animate-in fade-in pb-20">
             <header className="flex justify-between items-center text-center">
               <div className="flex items-center gap-3">
                 <div className="p-3 bg-orange-600 rounded-2xl text-white shadow-lg"><Settings size={24} /></div>
                 <h1 className="text-3xl font-black text-white">大會管理後台</h1>
               </div>
               <button onClick={handleLogout} className="p-3 bg-slate-900 rounded-2xl text-slate-500 border border-slate-800 hover:text-red-400"><X size={20} /></button>
             </header>

             <section className="space-y-6 text-center">
                <div className="flex items-center gap-2 text-orange-500 font-black text-sm uppercase tracking-widest justify-center"><BarChart3 size={16} /> 修行大會全域設定</div>
                <div className="bg-slate-900 border-2 border-slate-800 p-8 rounded-4xl shadow-xl space-y-8">
                  <div className="space-y-4">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1 block text-center">本週指定必修項目</label>
                    <select 
                      value={systemSettings.MandatoryQuestId} 
                      onChange={(e) => updateGlobalSetting('MandatoryQuestId', e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:border-orange-500 cursor-pointer text-center"
                    >
                      {DAILY_QUEST_CONFIG.map(q => <option key={q.id} value={q.id}>{q.title}</option>)}
                    </select>
                  </div>
                  <div className="space-y-4">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest ml-1 block text-center">雙週加分主題名稱</label>
                    <div className="flex gap-2 text-center">
                      <input 
                        value={editTopicTitle}
                        onChange={(e) => setEditTopicTitle(e.target.value)}
                        placeholder="主題標題"
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl p-4 text-white font-bold outline-none focus:border-orange-500 text-center"
                      />
                      <button 
                        onClick={() => updateGlobalSetting('TopicQuestTitle', editTopicTitle)}
                        className="bg-orange-600 p-4 rounded-2xl text-white font-black"
                      >
                        <Save size={20} />
                      </button>
                    </div>
                  </div>
                </div>
             </section>

             <section className="space-y-6 text-center">
                <div className="flex items-center gap-2 text-orange-500 font-black text-sm uppercase tracking-widest justify-center"><Users size={16} /> 冒險者修行數據清單</div>
                <div className="bg-slate-900 border-2 border-slate-800 rounded-4xl overflow-hidden shadow-2xl">
                   <div className="overflow-x-auto text-center">
                     <table className="w-full text-left border-collapse text-center">
                        <thead className="bg-slate-950/50 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800">
                          <tr>
                            <th className="px-6 py-4 text-left">冒險者 / 角色</th>
                            <th className="px-6 py-4 text-left">修為 / 等級</th>
                            <th className="px-6 py-4 text-right">累積定課罰金</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 text-white text-center">
                           {allPlayers.map((p) => (
                             <tr key={p.UserID} className="hover:bg-white/5 transition-colors">
                               <td className="px-6 py-5">
                                 <div className="flex items-center gap-3">
                                   <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center text-lg font-black text-white">{p.Name?.[0]}</div>
                                   <div className="text-left">
                                     <p className="font-bold text-white leading-tight">{p.Name}</p>
                                     <p className="text-[10px] text-slate-500 font-black uppercase tracking-tighter italic">{p.Role}</p>
                                   </div>
                                 </div>
                               </td>
                               <td className="px-6 py-5 text-left">
                                 <p className="font-black text-blue-400">LV.{p.Level} / {p.Exp}</p>
                               </td>
                               <td className="px-6 py-5 text-right">
                                 <p className={`font-black ${p.TotalFines > 0 ? 'text-red-500' : 'text-slate-600'}`}>NT$ {p.TotalFines}</p>
                               </td>
                             </tr>
                           ))}
                        </tbody>
                     </table>
                   </div>
                </div>
             </section>
          </div>
        )}
        {modalMessage && <MessageBox message={modalMessage.text} type={modalMessage.type} onClose={() => setModalMessage(null)} />}
      </div>
    );
  }

  // --- 防禦性渲染守衛 ---
  if (!userData && view === 'app') return null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 pb-40 font-sans text-center">
      <header className="p-8 bg-slate-900 border-b border-slate-800 flex items-center gap-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-6 flex gap-2">
          <button onClick={handleLogout} className="bg-slate-950/50 border border-slate-800 p-2 rounded-xl text-slate-500 hover:text-red-400 transition-colors"><LogOut size={20} /></button>
        </div>
        <div className="relative shrink-0">
          <div className="w-24 h-24 bg-orange-600 rounded-4xl flex items-center justify-center text-white text-5xl font-black shadow-lg">
            {userData?.Name?.[0] || '?'}
          </div>
          <div className="absolute -bottom-2 -right-2 bg-yellow-500 text-slate-950 text-[10px] font-black px-2 py-1 rounded-full border-4 border-slate-900">
            LV.{userData?.Level || 1}
          </div>
        </div>
        <div className="flex-1 text-left text-left">
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-3xl font-black text-white">{userData?.Name || "修行者"}</h1>
            {userData && (
              <span className={`text-[10px] px-2 py-0.5 rounded font-black text-white ${ROLE_CURE_MAP[userData.Role]?.color}`}>
                {ROLE_CURE_MAP[userData.Role]?.poison}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 font-bold mb-3 uppercase tracking-widest italic">{userData?.Role} 模組修行中</p>
          <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden border border-slate-700">
            <div className="h-full bg-orange-500 transition-all duration-1000" style={{ width: `${((userData?.Exp || 0) % 1000) / 10}%` }}></div>
          </div>
        </div>
      </header>

      <nav className="sticky top-0 z-20 bg-slate-950/90 backdrop-blur-md flex p-4 gap-2 border-b border-slate-900 shadow-xl overflow-x-auto no-scrollbar text-center">
        <button onClick={() => setActiveTab('daily')} className={`shrink-0 px-6 py-4 rounded-2xl text-xs font-black transition-all ${activeTab === 'daily' ? 'bg-orange-600 text-white shadow-lg' : 'bg-slate-900 text-slate-500'}`}>修行定課</button>
        <button onClick={() => setActiveTab('weekly')} className={`shrink-0 px-6 py-4 rounded-2xl text-xs font-black transition-all ${activeTab === 'weekly' ? 'bg-orange-600 text-white shadow-lg' : 'bg-slate-900 text-slate-500'}`}>加分副本</button>
        <button onClick={() => setActiveTab('rank')} className={`shrink-0 px-6 py-4 rounded-2xl text-xs font-black transition-all ${activeTab === 'rank' ? 'bg-orange-600 text-white shadow-lg' : 'bg-slate-900 text-slate-500'}`}>諸位修為榜</button>
        <button onClick={() => setActiveTab('stats')} className={`shrink-0 px-6 py-4 rounded-2xl text-xs font-black transition-all ${activeTab === 'stats' ? 'bg-orange-600 text-white shadow-lg' : 'bg-slate-900 text-slate-500'}`}>六維與罰金</button>
      </nav>

      <main className="max-w-md mx-auto p-6 space-y-8 text-center text-center">
        {activeTab === 'daily' && (
          <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-500 text-center mx-auto">
            <div className="bg-red-900/20 border-2 border-red-500/40 rounded-4xl p-6 shadow-2xl text-center">
              <div className="flex items-center gap-2 justify-center text-red-400 font-black text-xs uppercase mb-2 tracking-widest text-center text-center"><Flame size={16}/> 本週指定必修項目</div>
              <h2 className="text-2xl font-black text-white italic text-center">「{DAILY_QUEST_CONFIG.find(q => q.id === systemSettings.MandatoryQuestId)?.title || "載入中"}」</h2>
              <div className="mt-4 py-3 bg-red-600/90 text-white rounded-xl text-xs font-black animate-pulse flex items-center justify-center gap-2 shadow-lg text-center mx-auto text-center"><Coins size={14}/> 逾期定課罰金：NT$ 50</div>
            </div>

            {DAILY_QUEST_CONFIG.map(q => {
              const isDone = logs.some(l => l.QuestID === q.id && new Date(l.Timestamp).toDateString() === todayStr);
              const isMandatory = q.id === systemSettings.MandatoryQuestId;
              
              return (
                <button 
                  key={q.id} 
                  onClick={() => !isDone ? handleCheckIn(q) : setUndoTarget(q)} 
                  className={`w-full p-6 rounded-3xl border-2 flex items-center gap-4 transition-all active:scale-[0.98] 
                    ${isDone ? 'bg-emerald-500/10 border-emerald-500/40 opacity-70' : 
                      isMandatory ? 'bg-slate-900 border-red-600 shadow-[0_0_20px_rgba(220,38,38,0.25)] border-red-600/80 animate-pulse-slow' : 
                      'bg-slate-900 border-slate-800 hover:border-orange-500/50'}`}
                >
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl shadow-inner 
                    ${isDone ? 'bg-emerald-500 text-white' : 
                      isMandatory ? 'bg-red-600 text-white' : 
                      'bg-slate-800 text-orange-500'}`}>{isDone ? '✓' : '✧'}</div>
                  <div className="flex-1 text-left text-left">
                    <h3 className={`font-black text-lg ${isDone ? 'text-emerald-400' : isMandatory ? 'text-red-400' : 'text-white'}`}>{q.title}</h3>
                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{q.sub}</p>
                  </div>
                  <div className={`font-black ${isDone ? 'text-emerald-500' : isMandatory ? 'text-red-500' : 'text-orange-500'}`}>+{q.reward}</div>
                </button>
              );
            })}
          </div>
        )}

        {activeTab === 'weekly' && (
          <div className="space-y-8 animate-in slide-in-from-right-8 duration-500 text-center">
            <div className="p-8 rounded-4xl border-2 border-yellow-500/50 bg-yellow-500/5 shadow-2xl relative overflow-hidden text-center mx-auto text-center">
              <div className="flex items-center gap-6 mb-6 text-left text-center">
                <div className="text-6xl text-center">🎯</div>
                <div className="flex-1 text-left">
                  <span className="bg-yellow-500 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded-full uppercase mb-1 inline-block">雙週副本挑戰</span>
                  <h3 className="text-2xl font-black text-white">主題親證</h3>
                  <p className="text-sm text-yellow-400 font-bold leading-tight mt-1 italic">「{systemSettings.TopicQuestTitle}」</p>
                </div>
                <div className="text-sm font-black text-yellow-500 bg-yellow-500/10 px-3 py-1 rounded-xl">+1000</div>
              </div>
              <button 
                onClick={() => !isTopicDone ? handleCheckIn({ id: 't1', title: '主題親證', reward: 1000 }) : setUndoTarget({ id: 't1', title: '主題親證', reward: 1000 })} 
                className={`w-full py-4 rounded-2xl font-black text-lg transition-all text-center ${isTopicDone ? 'bg-emerald-600/20 text-emerald-400 shadow-inner' : 'bg-yellow-500 text-slate-950 shadow-lg active:scale-95'}`}
              >
                {isTopicDone ? "本期已圓滿 (點擊回溯) ✓" : "回報主題修行"}
              </button>
            </div>

            {WEEKLY_QUEST_CONFIG.map(q => {
              const comps = logs.filter(l => l.QuestID.startsWith(q.id)).length;
              const isMax = q.limit !== 99 && comps >= (q.limit || 0);
              return (
                <div key={q.id} className={`p-8 rounded-4xl bg-slate-900 border border-slate-800 shadow-2xl text-center ${isMax ? 'opacity-50 grayscale' : ''}`}>
                  <div className="flex items-center gap-6 mb-8 text-left text-center">
                    <div className="text-6xl text-center">{q.icon}</div>
                    <div className="flex-1 text-left text-center">
                      <h3 className="text-2xl font-black text-white">{q.title}</h3>
                      <p className="text-sm text-slate-400 font-bold italic">{q.sub}</p>
                    </div>
                    <div className="text-sm font-black text-blue-400 bg-blue-400/10 px-3 py-1 rounded-xl text-center">+$ {q.reward}</div>
                  </div>
                  <div className="flex justify-between items-center px-2 text-center text-center">
                    {['一','二','三','四','五','六','日'].map((day, idx) => {
                      const d = new Date();
                      const diff = (d.getDay() || 7) - (idx + 1);
                      d.setDate(d.getDate() - diff);
                      const dStr = d.toISOString().split('T')[0];
                      const qId = `${q.id}|${dStr}`;
                      const isDone = logs.some(l => l.QuestID === qId);
                      return (
                        <button key={idx} onClick={() => !isDone ? (!isMax && handleCheckIn({ ...q, id: qId })) : setUndoTarget({ ...q, id: qId })} className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all text-center ${isDone ? 'bg-orange-500 text-white shadow-lg' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'}`}>{day}</button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'rank' && (
          <div className="bg-slate-900 border-2 border-slate-800 rounded-4xl overflow-hidden divide-y divide-slate-800 shadow-2xl animate-in fade-in text-center mx-auto text-center">
            <div className="p-4 bg-slate-950/50 flex items-center gap-2 text-yellow-500 font-black text-xs uppercase tracking-widest justify-center text-center text-center">
              <Crown size={14}/> 當前諸位修行者修為榜
            </div>
            {leaderboard.map((p, i) => (
              <div key={p.UserID} className={`flex items-center gap-4 p-5 ${i < 3 ? 'bg-white/5' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${i === 0 ? 'bg-yellow-500 text-slate-950' : i === 1 ? 'bg-slate-300 text-slate-950' : i === 2 ? 'bg-orange-400 text-slate-950' : 'text-slate-500'}`}>{i + 1}</div>
                <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center font-bold text-white shadow-lg text-center text-center">{p.Name?.[0]}</div>
                <div className="flex-1 text-left">
                  <p className="font-bold text-sm text-white">{p.Name}</p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-tighter italic">{p.Role}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-orange-500">{p.Exp} <span className="text-[8px] text-slate-600 tracking-widest">修為</span></p>
                  {p.TotalFines > 0 && <p className="text-[10px] text-red-500 font-black">罰金 NT${p.TotalFines}</p>}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'stats' && userData && (
          <div className="space-y-8 animate-in zoom-in-95 duration-500 text-center">
            <div className="bg-gradient-to-br from-red-950/40 to-slate-900 border-2 border-red-900/50 p-8 rounded-4xl shadow-2xl relative overflow-hidden text-center mx-auto text-center">
              <div className="flex items-center gap-3 mb-4 justify-center text-red-400 text-center text-center">
                <Wallet size={24} /><span className="text-sm font-black uppercase tracking-widest text-center text-center">定課罰金累積統計</span>
              </div>
              <div className="flex flex-col items-center text-center text-center">
                <span className="text-6xl font-black text-white tracking-tighter mb-2 text-center text-center">NT$ {userData.TotalFines || 0}</span>
                <p className="text-xs text-slate-500 font-bold tracking-widest uppercase text-center text-center text-center">「必修未竟」之累世罰金</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-5 text-center">
              <StatCard label="神識 (Spirit)" value={userData.Spirit} icon={<Sparkles size={16} className="text-purple-400" />} color="bg-purple-500" />
              <StatCard label="根骨 (Physique)" value={userData.Physique} icon={<Shield size={16} className="text-red-400" />} color="bg-red-500" />
              <StatCard label="魅力 (Charisma)" value={userData.Charisma} icon={<Heart size={16} className="text-pink-400" />} color="bg-pink-500" />
              <StatCard label="悟性 (Savvy)" value={userData.Savvy} icon={<Brain size={16} className="text-blue-400" />} color="bg-blue-500" />
              <StatCard label="機緣 (Luck)" value={userData.Luck} icon={<Zap size={16} className="text-emerald-400" />} color="bg-emerald-500" />
              <StatCard label="潛力 (Potential)" value={userData.Potential} icon={<Trophy size={16} className="text-yellow-400" />} color="bg-yellow-500" />
            </div>
          </div>
        )}
      </main>

      <footer className="fixed bottom-0 left-0 right-0 p-10 bg-gradient-to-t from-slate-950 via-slate-950 to-transparent pointer-events-none z-30 text-center">
        <div className="max-w-md mx-auto pointer-events-auto text-center mx-auto text-center">
          <button disabled={(userData?.EnergyDice || 0) < 3} onClick={() => setModalMessage({ text: "此區域目前雲霧繚繞，請待長老開啟梅花副本。", type: 'info' })} className={`w-full py-7 rounded-[2.5rem] font-black text-2xl shadow-[0_10px_30px_rgba(234,88,12,0.4)] flex items-center justify-center gap-4 transition-all text-center ${ (userData?.EnergyDice || 0) >= 3 ? 'bg-linear-to-r from-orange-600 to-yellow-500 text-slate-950 active:scale-95 text-center' : 'bg-slate-800 text-slate-600 opacity-50 text-center text-center'}`}>
            <Dice5 size={32} />啟動探索冒險 (🎲 {userData?.EnergyDice || 0})
          </button>
        </div>
      </footer>

      {undoTarget && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-6 bg-slate-950/95 backdrop-blur-xl animate-in fade-in duration-200">
          <div className="bg-slate-900 border-2 border-slate-800 p-8 rounded-[2.5rem] shadow-2xl max-w-sm w-full text-center space-y-6 border-b-8 border-b-orange-600 text-center text-center">
            <div className="w-20 h-20 rounded-full mx-auto flex items-center justify-center bg-orange-500/20 text-orange-500 shadow-inner text-center mx-auto text-center"><RotateCcw size={40} className="animate-spin-slow" /></div>
            <div className="space-y-2 text-center text-center text-center">
              <h3 className="text-2xl font-black text-white text-center">發動時光回溯？</h3>
              <p className="text-slate-400 text-sm font-bold text-center">這將會扣除本次修得的 <span className="text-orange-500">{undoTarget.reward} 修為</span> 與天命增益。</p>
            </div>
            <div className="flex gap-4 text-center text-center">
              <button onClick={() => setUndoTarget(null)} className="flex-1 py-4 bg-slate-800 text-slate-500 font-black rounded-2xl hover:bg-slate-700 transition-colors text-center text-center">保持現狀</button>
              <button onClick={() => handleUndoCheckIn(undoTarget)} className="flex-1 py-4 bg-orange-600 text-white font-black rounded-2xl shadow-xl active:scale-95 transition-all text-center text-center">確認回溯</button>
            </div>
          </div>
        </div>
      )}

      {isSyncing && (
        <div className="fixed inset-0 bg-slate-950/60 z-[300] flex flex-col items-center justify-center text-center text-center text-center text-center">
          <Loader2 className="w-12 h-12 text-orange-500 animate-spin mb-4 text-center mx-auto text-center" />
          <p className="text-orange-500 font-black animate-pulse tracking-widest text-center text-center">與法界同步中...</p>
        </div>
      )}

      {modalMessage && <MessageBox message={modalMessage.text} type={modalMessage.type} onClose={() => setModalMessage(null)} />}
    </div>
  );
}