"use client";

import React, { useState, useEffect, useMemo } from 'react';
// 已修正部署錯誤：還原為標準 npm 匯入路徑
// 請確保執行過：npm install @supabase/supabase-js lucide-react
import { createClient, SupabaseClient } from '@supabase/supabase-js'; 

import { 
  Flame, 
  Trophy, 
  LogOut,
  Shield,
  Brain,
  Heart,
  Zap,
  Sparkles,
  Dice5,
  AlertTriangle,
  Users,
  CheckCircle2,
  Activity,
  MessageSquare,
  ChevronRight,
  Settings,
  Target,
  Crown,
  UserPlus,
  ArrowRight,
  User as UserIcon,
  HeartPulse,
  Home,
  Briefcase,
  Coins,
  Wallet,
  History,
  Loader2
} from 'lucide-react';

// --- 0. 型別定義 ---

interface CharacterStats {
  UserID: string;
  Name: string;
  Role: string;
  Level: number;
  Exp: number;
  EnergyDice: number;
  Spirit: number;
  Physique: number;
  Charisma: number;
  Savvy: number;
  Luck: number;
  Potential: number;
  Streak: number;
  LastCheckIn: string | null;
  TotalFines: number; // 累積現實罰金
}

interface DailyLog {
  id?: string;
  Timestamp: string;
  UserID: string;
  QuestID: string;
  QuestTitle: string;
  RewardPoints: number;
}

interface Quest {
  id: string;
  title: string;
  sub: string;
  reward: number;
  dice?: number;
  icon?: string;
  limit?: number;
}

// --- 1. 初始化 Supabase ---

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// --- 2. 常數與設定 ---

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
  { id: 'q4', title: '嗯啊吽七次', sub: '對治痴念', reward: 100, dice: 1 },
  { id: 'q5', title: '五感恩', sub: '對治慢心', reward: 100, dice: 1 },
  { id: 'q6', title: '海鮮素', sub: '對治貪慾', reward: 100, dice: 1 },
  { id: 'q7', title: '子時入睡', sub: '能量補給', reward: 100, dice: 1 }
];

const WEEKLY_QUEST_CONFIG: Quest[] = [
  { id: 'w1', title: '小天使通話', sub: '關心夥伴 (15min)', reward: 500, limit: 1, icon: '👼' },
  { id: 'w2', title: '參加心成活動', sub: '聚會、活動、培訓', reward: 500, limit: 2, icon: '🏛️' },
  { id: 'w3', title: '與家人互動親證', sub: '視訊或品質陪伴', reward: 500, limit: 1, icon: '🏠' },
  { id: 'w4', title: '傳愛分數', sub: '訪談成功加分', reward: 1000, limit: 99, icon: '❤️' }
];

// --- 3. UI 組件 ---

const StatCard = ({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) => (
  <div className="bg-slate-900 border-2 border-slate-800 p-5 rounded-[2.5rem] shadow-xl text-left">
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
  <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-950/90 animate-in fade-in duration-300">
    <div className="bg-slate-900 border-2 border-slate-800 p-8 rounded-[3rem] shadow-2xl max-w-sm w-full text-center space-y-6 text-white">
      <div className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center ${type === 'error' ? 'bg-red-500/20 text-red-500' : type === 'success' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-blue-500/20 text-blue-500'}`}>
        {type === 'error' ? <AlertTriangle size={40} /> : type === 'success' ? <CheckCircle2 size={40} /> : <Sparkles size={40} />}
      </div>
      <p className="text-xl font-bold leading-relaxed">{message}</p>
      <button onClick={onClose} className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-white font-black rounded-2xl transition-all active:scale-95">確認</button>
    </div>
  </div>
);

// --- 4. 主要 App 元件 ---

export default function App() {
  const [view, setView] = useState<'login' | 'register' | 'app' | 'loading'>('loading');
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<'daily' | 'weekly' | 'stats' | 'rank'>('daily');
  const [userData, setUserData] = useState<CharacterStats | null>(null);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [leaderboard, setLeaderboard] = useState<CharacterStats[]>([]);
  const [systemSettings, setSystemSettings] = useState({ MandatoryQuestId: 'q2', TopicQuestTitle: '載入中...' });
  const [modalMessage, setModalMessage] = useState<{ text: string, type: 'info' | 'error' | 'success' } | null>(null);

  const todayStr = new Date().toDateString();
  const currentBiWeeklyMonday = useMemo(() => {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() || 7) - 1));
    monday.setHours(0, 0, 0, 0);
    return monday;
  }, []);

  // 1. 工作階段保留機制 (20分鐘)
  useEffect(() => {
    const checkSession = async () => {
      if (typeof window === 'undefined') return;
      
      const savedUserId = sessionStorage.getItem('starry_session_uid');
      const savedTimestamp = sessionStorage.getItem('starry_session_time');

      if (savedUserId && savedTimestamp) {
        const TWENTY_MINUTES = 20 * 60 * 1000;
        const currentTime = Date.now();
        const sessionTime = parseInt(savedTimestamp);

        if (currentTime - sessionTime < TWENTY_MINUTES) {
          try {
            const { data, error } = await supabase
              .from('CharacterStats')
              .select('*')
              .eq('UserID', savedUserId)
              .single();

            if (data && !error) {
              setUserData(data as CharacterStats);
              const { data: userLogs } = await supabase.from('DailyLogs').select('*').eq('UserID', data.UserID);
              setLogs((userLogs as DailyLog[]) || []);
              sessionStorage.setItem('starry_session_time', Date.now().toString());
              setView('app');
              return;
            }
          } catch (e) {
            console.error("Session re-auth failed", e);
          }
        }
      }
      setView('login');
    };
    checkSession();
  }, []);

  // 2. 系統設定與排行榜
  useEffect(() => {
    async function fetchData() {
      if (!supabase || view !== 'app') return;
      
      const { data: settingsData } = await supabase.from('SystemSettings').select('*');
      if (settingsData) {
        const settingsObj = settingsData.reduce((acc: any, curr: any) => ({ ...acc, [curr.SettingName]: curr.Value }), {});
        setSystemSettings({
          MandatoryQuestId: settingsObj.MandatoryQuestId || 'q2',
          TopicQuestTitle: settingsObj.TopicQuestTitle || '未公佈主題'
        });
      }

      const { data: rankData } = await supabase.from('CharacterStats').select('*').order('Exp', { ascending: false }).limit(20);
      if (rankData) setLeaderboard(rankData as CharacterStats[]);
    }
    fetchData();
  }, [view, activeTab]);

  // 3. 登入邏輯
  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!supabase) return;
    setIsSyncing(true);
    const formData = new FormData(e.currentTarget);
    const inputName = (formData.get('name') as string).trim();
    const phoneSuffix = (formData.get('phone') as string).trim();

    try {
      const { data: allUsers, error } = await supabase.from('CharacterStats').select('*');
      if (error) throw error;
      
      const userMatch = (allUsers as CharacterStats[]).find(u => {
        const p = u.UserID.toString().replace(/\D/g, '').trim();
        return u.Name === inputName && p.endsWith(phoneSuffix);
      });

      if (userMatch) {
        sessionStorage.setItem('starry_session_uid', userMatch.UserID);
        sessionStorage.setItem('starry_session_time', Date.now().toString());

        setUserData(userMatch);
        const { data: userLogs } = await supabase.from('DailyLogs').select('*').eq('UserID', userMatch.UserID);
        setLogs((userLogs as DailyLog[]) || []);
        setView('app');
      } else {
        setModalMessage({ text: "找不到靈魂印記。若尚未啟動角色，請點擊「立即轉生」。", type: 'info' });
      }
    } catch (err) {
      setModalMessage({ text: "法界連結失敗。", type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  // 4. 啟動轉生 (角色創建)
  const handleCreateCharacter = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!supabase) return;
    setIsSyncing(true);
    const formData = new FormData(e.currentTarget);
    const name = (formData.get('name') as string).trim();
    const phoneRaw = (formData.get('phone') as string).replace(/\D/g, '').trim();
    const phone = (phoneRaw.length === 10 && phoneRaw.startsWith('0')) ? phoneRaw.substring(1) : phoneRaw;
    
    const scores = {
      career: parseInt(formData.get('career') as string) || 5,
      wealth: parseInt(formData.get('wealth') as string) || 5,
      love: parseInt(formData.get('love') as string) || 5,
      family: parseInt(formData.get('family') as string) || 5,
      health: parseInt(formData.get('health') as string) || 5,
    };

    const calc = (v: number) => Math.max(5, 15 - v);
    const roles = Object.keys(ROLE_CURE_MAP);
    const assignedRole = roles[Math.floor(Math.random() * roles.length)];

    const newChar: CharacterStats = {
      UserID: phone, Name: name, Role: assignedRole, Level: 1, Exp: 0, EnergyDice: 3,
      Savvy: calc(scores.career), Luck: calc(scores.wealth), Charisma: calc(scores.love), Spirit: calc(scores.family), Physique: calc(scores.health),
      Potential: 10, Streak: 0, LastCheckIn: null, TotalFines: 0
    };

    try {
      const { error } = await supabase.from('CharacterStats').insert([newChar]);
      if (error) {
        if (error.code === '23505') setModalMessage({ text: "此號碼已啟動過角色，請直接登入。", type: 'error' });
        else throw error;
      } else {
        sessionStorage.setItem('starry_session_uid', newChar.UserID);
        sessionStorage.setItem('starry_session_time', Date.now().toString());
        setUserData(newChar);
        setView('app');
        setModalMessage({ text: `✨ 轉生成功！你是【${assignedRole}】模組。`, type: 'success' });
      }
    } catch (err) {
      setModalMessage({ text: "具現化失敗。", type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  // 5. 打卡與冒險
  const handleCheckIn = async (quest: Quest) => {
    if (!supabase || !userData) return;
    const count = logs.filter(l => new Date(l.Timestamp).toDateString() === todayStr && l.QuestID.startsWith('q')).length;
    if (count >= 3 && quest.id.startsWith('q')) {
      setModalMessage({ text: "今日修行已達 3 項上限，請待明日再進。", type: 'info' });
      return;
    }
    
    setIsSyncing(true);
    const now = new Date();
    const isCure = ROLE_CURE_MAP[userData.Role]?.cureTaskId === quest.id;
    
    try {
      await supabase.from('DailyLogs').insert([{ 
        Timestamp: now.toISOString(), 
        UserID: userData.UserID, 
        QuestID: quest.id, 
        QuestTitle: quest.title + (isCure ? " (天命對治)" : ""), 
        RewardPoints: quest.reward 
      }]);

      let newExp = userData.Exp + quest.reward;
      let newLevel = userData.Level;
      if (newExp >= newLevel * 1000) newLevel += 1;

      const updatePayload: Partial<CharacterStats> = { 
        Exp: newExp, 
        Level: newLevel, 
        EnergyDice: userData.EnergyDice + (quest.dice || 0), 
        LastCheckIn: todayStr 
      };

      if (isCure) { 
        const field = ROLE_CURE_MAP[userData.Role].bonusStat;
        (updatePayload as any)[field] = (userData[field] as number) + 2; 
      }

      await supabase.from('CharacterStats').update(updatePayload).eq('UserID', userData.UserID);
      setUserData({ ...userData, ...updatePayload } as CharacterStats);
      setLogs(prev => [...prev, { 
        QuestID: quest.id, 
        Timestamp: now.toISOString(), 
        RewardPoints: quest.reward, 
        UserID: userData.UserID, 
        QuestTitle: quest.title 
      }]);
      sessionStorage.setItem('starry_session_time', Date.now().toString());
    } catch (err) { 
      setModalMessage({ text: "同步失敗。", type: 'error' });
    } finally { 
      setIsSyncing(false); 
    }
  };

  const handleAdventure = async () => {
    if (!userData || userData.EnergyDice < 3) return;
    setIsSyncing(true);
    try {
      const stats: (keyof CharacterStats)[] = ['Spirit', 'Physique', 'Charisma', 'Savvy', 'Luck', 'Potential'];
      const stat = stats[Math.floor(Math.random() * stats.length)];
      const val = Math.floor(Math.random() * 3) + 1;
      const update = { EnergyDice: userData.EnergyDice - 3, [stat]: (userData[stat] as number) + val };
      await supabase.from('CharacterStats').update(update).eq('UserID', userData.UserID);
      setUserData({ ...userData, ...update } as CharacterStats);
      sessionStorage.setItem('starry_session_time', Date.now().toString());
      setModalMessage({ text: `✨ 探索成功！你的【${stat}】獲得了 ${val} 點資糧加成！`, type: 'success' });
    } catch (err) { 
      setModalMessage({ text: "冒險中斷。", type: 'error' });
    } finally { 
      setIsSyncing(false); 
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('starry_session_uid');
    sessionStorage.removeItem('starry_session_time');
    setUserData(null);
    setLogs([]);
    setView('login');
  };

  // --- Views ---

  if (view === 'loading') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-10 text-center">
        <Loader2 className="w-16 h-16 text-orange-500 animate-spin mb-6 mx-auto" />
        <p className="text-orange-500 text-xl font-black tracking-widest animate-pulse">感應法界能量中...</p>
      </div>
    );
  }

  if (view === 'login') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-10 space-y-12 bg-slate-950 text-center text-slate-200">
        <div className="animate-in zoom-in duration-700 flex flex-col items-center">
          <div className="w-32 h-32 bg-orange-600 rounded-[3.5rem] flex items-center justify-center shadow-2xl border-4 border-white/20 mb-6 text-white text-center"><span className="text-7xl">🕉️</span></div>
          <h1 className="text-5xl font-black tracking-widest mb-2 text-white">星光西遊</h1>
          <p className="text-orange-400 text-lg font-bold uppercase tracking-[0.4em]">修行轉生門戶</p>
        </div>
        <form onSubmit={handleLogin} className="w-full max-w-sm space-y-6">
          <input name="name" required className="w-full bg-slate-900/60 border-2 border-slate-800 rounded-2xl p-6 text-white text-center text-xl focus:border-orange-500 outline-none transition-all placeholder:text-slate-600 font-bold" placeholder="冒險者姓名" />
          <input name="phone" required type="password" className="w-full bg-slate-900/60 border-2 border-slate-800 rounded-2xl p-6 text-white text-center text-xl focus:border-orange-500 outline-none transition-all placeholder:text-slate-600 font-bold" placeholder="手機末三碼" />
          <button disabled={isSyncing} className="w-full py-7 rounded-[2.5rem] bg-gradient-to-r from-orange-600 to-yellow-500 text-slate-950 font-black text-2xl shadow-2xl active:scale-95 transition-all flex items-center justify-center">
            {isSyncing ? <Loader2 className="animate-spin mr-2" /> : "連結靈魂印記"}
          </button>
          <button type="button" onClick={() => setView('register')} className="text-slate-500 text-sm font-bold flex items-center gap-2 mx-auto hover:text-orange-400 transition-colors">
            <UserPlus size={16} className="mr-1" /> 尚未啟動修行？立即轉生
          </button>
        </form>
        {modalMessage && <MessageBox message={modalMessage.text} type={modalMessage.type} onClose={() => setModalMessage(null)} />}
      </div>
    );
  }

  if (view === 'register') {
    return (
      <div className="min-h-screen bg-slate-950 p-8 text-slate-200">
        <div className="max-w-md mx-auto space-y-10 py-12">
          <header className="text-center space-y-4">
            <div className="w-20 h-20 bg-yellow-500 rounded-3xl mx-auto flex items-center justify-center shadow-xl mb-4 text-slate-950">
              <Sparkles size={40} />
            </div>
            <h1 className="text-4xl font-black tracking-tight text-white">啟動轉生</h1>
            <p className="text-slate-500 font-bold italic">請填寫評分以具現化你的修行資質</p>
          </header>
          <form onSubmit={handleCreateCharacter} className="space-y-8">
            <div className="space-y-4 text-left">
              <label className="text-xs font-black text-orange-500 uppercase tracking-widest ml-2 flex items-center gap-2"><UserIcon size={14} /> 通訊識別</label>
              <input name="name" required className="w-full bg-slate-900 border-2 border-slate-800 rounded-2xl p-5 text-white outline-none focus:border-orange-500 transition-all font-bold text-center" placeholder="真實姓名" />
              <input name="phone" required type="tel" className="w-full bg-slate-900 border-2 border-slate-800 rounded-2xl p-5 text-white outline-none focus:border-orange-500 transition-all font-bold text-center" placeholder="手機號碼 (09xxxxxxxx)" />
            </div>
            <div className="space-y-6 text-left">
              <label className="text-xs font-black text-orange-500 uppercase tracking-widest ml-2 flex items-center gap-2 text-left text-white"><Target size={14} /> 生命五力評分 (1-10)</label>
              {[{ id: 'career', label: '事業運勢', sub: '悟性', icon: <Briefcase size={16} /> }, { id: 'wealth', label: '財富運勢', sub: '機緣', icon: <Coins size={16} /> }, { id: 'love', label: '感情運勢', sub: '魅力', icon: <Heart size={16} /> }, { id: 'family', label: '家庭運勢', sub: '神識', icon: <Home size={16} /> }, { id: 'health', label: '身體運勢', sub: '根骨', icon: <HeartPulse size={16} /> }].map(f => (
                <div key={f.id} className="space-y-2 bg-slate-900/50 p-4 rounded-3xl border border-slate-800">
                  <div className="flex justify-between items-center px-1"><span className="font-bold text-white text-sm flex items-center gap-2 text-left">{f.icon} {f.label}</span><span className="text-[10px] text-slate-500 font-bold italic text-left">{f.sub}</span></div>
                  <input name={f.id} type="range" min="1" max="10" defaultValue="5" className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500" />
                  <div className="flex justify-between text-[10px] text-slate-600 font-bold px-1 uppercase tracking-widest text-center"><span>1 困頓</span><span>5 平衡</span><span>10 圓滿</span></div>
                </div>
              ))}
            </div>
            <div className="pt-6 space-y-4">
              <button disabled={isSyncing} className="w-full py-6 rounded-[2rem] bg-orange-600 text-white font-black text-xl shadow-2xl flex items-center justify-center gap-3 active:scale-95 transition-all text-center">
                {isSyncing ? <Loader2 className="animate-spin" /> : "確認轉生"} <ArrowRight size={24} />
              </button>
              <button type="button" onClick={() => setView('login')} className="w-full py-2 text-slate-500 font-bold text-sm text-center">返回登入</button>
            </div>
          </form>
        </div>
        {modalMessage && <MessageBox message={modalMessage.text} type={modalMessage.type} onClose={() => setModalMessage(null)} />}
      </div>
    );
  }

  // --- Main App ---
  const isTopicDone = logs.some(l => l.QuestID === 't1' && new Date(l.Timestamp) >= currentBiWeeklyMonday);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 pb-40">
      <header className="p-8 bg-slate-900 border-b border-slate-800 shadow-2xl relative text-white">
        <div className="absolute top-0 right-0 p-6"><button onClick={handleLogout} className="bg-slate-950/50 border border-slate-800 p-2 rounded-xl text-slate-500 hover:text-red-400 text-center"><LogOut size={20} /></button></div>
        <div className="max-w-md mx-auto flex items-center gap-6">
          <div className="relative flex-shrink-0 text-center">
            <div className="w-24 h-24 bg-orange-600 rounded-[2.2rem] flex items-center justify-center text-white text-5xl font-black shadow-lg">{userData!.Name[0]}</div>
            <div className="absolute -bottom-2 -right-2 bg-yellow-500 text-slate-950 text-[10px] font-black px-2 py-1 rounded-full border-4 border-slate-900 text-center">LV.{userData!.Level}</div>
          </div>
          <div className="flex-1 text-left">
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-3xl font-black text-white leading-tight">{userData!.Name}</h1>
              <span className={`text-[10px] px-2 py-0.5 rounded font-black text-white ${ROLE_CURE_MAP[userData!.Role]?.color}`}>{ROLE_CURE_MAP[userData!.Role]?.poison}</span>
            </div>
            <p className="text-xs text-slate-500 font-bold mb-3 uppercase tracking-widest italic">{userData!.Role} 模組</p>
            <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden border border-slate-700">
              <div className="h-full bg-gradient-to-r from-orange-600 to-yellow-400 transition-all duration-1000" style={{ width: `${(userData!.Exp / (userData!.Level * 1000)) * 100}%` }}></div>
            </div>
          </div>
        </div>
      </header>

      <nav className="flex gap-2 p-4 bg-slate-950 sticky top-0 z-20 border-b border-slate-900 shadow-lg max-w-md mx-auto overflow-x-auto no-scrollbar text-center">
        <button onClick={() => setActiveTab('daily')} className={`flex-shrink-0 px-6 py-4 rounded-[1.2rem] text-sm font-black transition-all ${activeTab === 'daily' ? 'bg-orange-600 text-white shadow-xl' : 'bg-slate-900 text-slate-500'}`}>今日定課</button>
        <button onClick={() => setActiveTab('weekly')} className={`flex-shrink-0 px-6 py-4 rounded-[1.2rem] text-sm font-black transition-all ${activeTab === 'weekly' ? 'bg-orange-600 text-white shadow-xl' : 'bg-slate-900 text-slate-500'}`}>加分主題</button>
        <button onClick={() => setActiveTab('rank')} className={`flex-shrink-0 px-6 py-4 rounded-[1.2rem] text-sm font-black transition-all ${activeTab === 'rank' ? 'bg-orange-600 text-white shadow-xl' : 'bg-slate-900 text-slate-500'}`}>法界榜</button>
        <button onClick={() => setActiveTab('stats')} className={`flex-shrink-0 px-6 py-4 rounded-[1.2rem] text-sm font-black transition-all ${activeTab === 'stats' ? 'bg-orange-600 text-white shadow-xl' : 'bg-slate-900 text-slate-500'}`}>六維/罰款</button>
      </nav>

      <main className="max-w-md mx-auto p-6 space-y-8 text-center text-slate-200">
        {activeTab === 'daily' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
            <div className="bg-red-900/30 border-2 border-red-500/50 rounded-[2rem] p-6 shadow-2xl text-center">
              <div className="flex items-center gap-3 mb-2 font-black text-red-400 justify-center"><Flame size={20} /><h2 className="text-base uppercase tracking-widest">本週指定必修</h2></div>
              <p className="text-xl text-white font-black leading-relaxed">「{DAILY_QUEST_CONFIG.find(q => q.id === systemSettings.MandatoryQuestId)?.title || "載入中"}」</p>
              <div className="mt-4 p-3 bg-red-600 text-white rounded-2xl font-black flex items-center justify-center gap-2 animate-pulse"><Coins size={18} /> 現實罰款 NT$ 50 / 日</div>
              <p className="text-slate-400 font-bold mt-3 text-xs italic">⚠️ 未完成將於結算時由大會執行罰扣並累積</p>
            </div>
            {DAILY_QUEST_CONFIG.map(q => {
              const isDone = logs.some(l => new Date(l.Timestamp).toDateString() === todayStr && l.QuestID === q.id);
              const isCure = ROLE_CURE_MAP[userData!.Role]?.cureTaskId === q.id;
              const isMandatory = q.id === systemSettings.MandatoryQuestId;
              return (
                <div key={q.id} onClick={() => !isDone && handleCheckIn(q)} className={`p-7 rounded-[2.5rem] border-2 transition-all flex flex-col gap-4 relative text-center ${isDone ? 'bg-emerald-950/20 border-emerald-500/40 opacity-60' : isMandatory ? 'bg-slate-900 border-red-600 scale-[1.02] shadow-[0_0_10px_rgba(234,179,8,0.2)]' : 'bg-slate-900 border-slate-800 hover:border-orange-500 shadow-lg'} ${isCure && !isDone ? 'border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.2)]' : ''}`}>
                  <div className="flex items-center gap-6 text-left"><div className={`w-16 h-16 rounded-3xl flex items-center justify-center text-2xl font-black text-center ${isDone ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-orange-500'}`}>{isDone ? "✓" : "✧"}</div><div className="flex-1 text-left text-white"><h3 className={`text-xl font-black text-left ${isDone ? 'text-emerald-400' : 'text-white'}`}>{q.title}</h3><p className="text-sm text-slate-500 font-bold text-left">{q.sub}</p></div><div className="text-right text-orange-500 font-black">+{q.reward}</div></div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'weekly' && (
          <div className="space-y-8 text-center animate-in slide-in-from-right-8 text-white">
            <div className="p-8 rounded-[3rem] border-2 border-yellow-500/50 bg-yellow-500/5 shadow-2xl relative overflow-hidden text-center">
              <div className="flex items-center gap-6 mb-6 text-left text-white">
                <div className="text-6xl text-center">🎯</div>
                <div className="flex-1 text-left"><span className="bg-yellow-500 text-slate-950 text-[10px] px-2 py-0.5 rounded-full font-black uppercase mb-1 inline-block">雙週主題挑戰</span><h3 className="text-2xl font-black text-left">主題親證</h3><p className="text-sm text-yellow-400 font-bold leading-tight mt-1 italic text-left">「{systemSettings.TopicQuestTitle}」</p></div>
                <div className="text-sm font-black text-yellow-500 bg-yellow-500/10 px-3 py-1 rounded-xl text-center">+1000</div>
              </div>
              <button disabled={isTopicDone} onClick={() => handleCheckIn({ id: 't1', title: '主題親證', sub: '雙週挑戰', reward: 1000 })} className={`w-full py-4 rounded-2xl font-black text-lg transition-all ${isTopicDone ? 'bg-emerald-600/20 text-emerald-400 cursor-not-allowed' : 'bg-yellow-500 text-slate-950 shadow-lg active:scale-95'}`}>{isTopicDone ? "本期已圓滿 ✓" : "回報主題修行"}</button>
            </div>
            {WEEKLY_QUEST_CONFIG.map(q => {
              const comps = logs.filter(l => l.QuestID.startsWith(q.id)).length;
              const isMax = q.limit !== 99 && comps >= (q.limit || 0);
              return (
                <div key={q.id} className={`p-8 rounded-[3rem] bg-slate-900 border border-slate-800 shadow-2xl text-center ${isMax ? 'opacity-50 grayscale' : ''}`}>
                  <div className="flex items-center gap-6 mb-8 text-left text-white">
                    <div className="text-6xl text-center"> {q.icon} </div>
                    <div className="flex-1 text-left text-left"><h3 className="text-2xl font-black text-left">{q.title}</h3><p className="text-sm text-slate-400 font-bold italic text-left">{q.sub}</p></div>
                    <div className="text-sm font-black text-blue-400 bg-blue-400/10 px-3 py-1 rounded-xl text-center">+${q.reward}</div>
                  </div>
                  <div className="flex justify-between items-center px-2">
                    {['一','二','三','四','五','六','日'].map((day, idx) => {
                      const d = new Date();
                      const diff = (d.getDay() || 7) - (idx + 1);
                      d.setDate(d.getDate() - diff);
                      const dStr = d.toISOString().split('T')[0];
                      const questIdWithDate = `${q.id}|${dStr}`;
                      const isDone = logs.some(l => l.QuestID === questIdWithDate);
                      return (
                        <button key={idx} onClick={() => !isDone && !isMax && handleCheckIn({ ...q, id: questIdWithDate })} className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all ${isDone ? 'bg-orange-500 text-white shadow-lg' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'}`}>{day}</button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'rank' && (
          <div className="space-y-4 text-center animate-in fade-in slide-in-from-bottom-4">
             <div className="flex items-center gap-2 mb-6 justify-center text-white"><Crown className="text-yellow-500" /><h2 className="text-2xl font-black text-center">法界修為榜</h2></div>
             <div className="bg-slate-900 border-2 border-slate-800 rounded-[2.5rem] overflow-hidden text-center">{leaderboard.map((p, i) => (
                <div key={p.UserID} className={`flex items-center gap-4 p-5 ${i < 3 ? 'bg-white/5' : ''} ${i !== leaderboard.length - 1 ? 'border-b border-slate-800' : ''}`}><div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-center ${i === 0 ? 'bg-yellow-500 text-slate-950' : i === 1 ? 'bg-slate-300 text-slate-950' : i === 2 ? 'bg-orange-400 text-slate-950' : 'text-slate-500'}`}>{i + 1}</div><div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center text-lg font-black text-white text-center">{p.Name[0]}</div><div className="flex-1 text-left text-white"><p className="font-bold text-white text-sm text-left">{p.Name}</p><p className="text-[10px] text-slate-500 tracking-widest uppercase text-left">{p.Role}</p></div><div className="text-right text-right"><p className="text-sm font-black text-orange-500 text-right">{p.Exp} 修為</p>{p.TotalFines > 0 && <p className="text-[10px] text-red-500 font-bold text-right">罰款 NT${p.TotalFines}</p>}</div></div>
              ))}</div>
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="space-y-8 animate-in zoom-in-95 text-center text-white">
            <div className="bg-gradient-to-br from-red-950/40 to-slate-900 border-2 border-red-900/50 p-8 rounded-[3rem] shadow-2xl relative overflow-hidden text-center text-white">
              <div className="absolute top-0 right-0 p-6 opacity-10"><History size={80} /></div>
              <div className="flex items-center gap-3 mb-4 justify-center text-center">
                <Wallet className="text-red-500" size={24} />
                <span className="text-sm font-black text-red-400 uppercase tracking-widest text-center">現實修行罰款統計</span>
              </div>
              <div className="flex flex-col items-center text-center">
                <span className="text-6xl font-black text-white tracking-tighter mb-2 text-center">NT$ {userData!.TotalFines || 0}</span>
                <p className="text-xs text-slate-500 font-bold text-center">「指定必修未完成」之累積罰金</p>
              </div>
              <div className="mt-6 pt-6 border-t border-red-900/30 flex justify-between items-center text-center text-white">
                <div className="text-left text-left"><p className="text-[10px] text-slate-500 font-bold uppercase text-left">累積天數</p><p className="text-lg font-black text-white text-left">{(userData!.TotalFines || 0) / 50} 天</p></div>
                <div className="text-right text-right"><p className="text-[10px] text-slate-500 font-bold uppercase text-right">單日金額</p><p className="text-lg font-black text-red-500 text-right">$50</p></div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-5 text-center text-white">
              <StatCard label="神識 (Spirit)" value={userData!.Spirit} icon={<Sparkles size={16} className="text-purple-400" />} color="bg-purple-500" />
              <StatCard label="根骨 (Physique)" value={userData!.Physique} icon={<Shield size={16} className="text-red-400" />} color="bg-red-500" />
              <StatCard label="魅力 (Charisma)" value={userData!.Charisma} icon={<Heart size={16} className="text-pink-400" />} color="bg-pink-500" />
              <StatCard label="悟性 (Savvy)" value={userData!.Savvy} icon={<Brain size={16} className="text-blue-400" />} color="bg-blue-500" />
              <StatCard label="機緣 (Luck)" value={userData!.Luck} icon={<Zap size={16} className="text-emerald-400" />} color="bg-emerald-500" />
              <StatCard label="潛力 (Potential)" value={userData!.Potential} icon={<Trophy size={16} className="text-yellow-400" />} color="bg-yellow-500" />
            </div>
          </div>
        )}
      </main>

      <footer className="fixed bottom-0 left-0 right-0 p-10 bg-gradient-to-t from-slate-950 via-slate-950 to-transparent pointer-events-none text-center z-30">
        <div className="max-w-md mx-auto pointer-events-auto text-center text-white">
          <button disabled={userData!.EnergyDice < 3} onClick={handleAdventure} className={`w-full py-7 rounded-[2.5rem] font-black text-2xl shadow-2xl flex items-center justify-center gap-4 transition-all text-center ${userData!.EnergyDice >= 3 ? 'bg-gradient-to-r from-orange-600 to-yellow-500 text-slate-950 active:scale-95 text-center' : 'bg-slate-800 text-slate-600 opacity-50 text-center'}`}>
            <Dice5 size={32} />啟動冒險 (🎲 {userData!.EnergyDice})
          </button>
        </div>
      </footer>

      {isSyncing && (
        <div className="fixed inset-0 bg-slate-950/80 z-[300] flex flex-col items-center justify-center text-center">
          <Loader2 className="w-16 h-16 text-orange-500 animate-spin mb-4" />
          <p className="text-orange-500 font-black animate-pulse">與法界同步中...</p>
        </div>
      )}
      {modalMessage && <MessageBox message={modalMessage.text} type={modalMessage.type} onClose={() => setModalMessage(null)} />}
    </div>
  );
}