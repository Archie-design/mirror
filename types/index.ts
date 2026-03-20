import React from 'react';

export interface CharacterStats {
  UserID: string;
  Name: string;
  Role: string;
  Level: number;
  Exp: number;
  Coins: number; // Added as per instruction
  EnergyDice: number;
  Spirit: number;
  Physique: number;
  Charisma: number;
  Savvy: number;
  Luck: number;
  Potential: number;
  Streak: number;
  LastCheckIn: string | null;
  TotalFines: number;
  FinePaid: number;  // 已繳款累計（餘額 = TotalFines - FinePaid）
  CurrentQ: number;
  CurrentR: number;
  Email?: string;
  SquadName?: string;
  TeamName?: string;
  IsCaptain?: boolean;
  Inventory: string[]; // Changed from optional to required as per instruction
  InitialFortunes?: Record<string, number>;
  DDA_Difficulty?: string;
  GameGold?: number;
  GameInventory?: Array<{ id: string; count: number }>;
  HP?: number;
  MaxHP?: number;
  Facing?: number; // 0-5 direction
  GoldenDice?: number;
  Birthday?: string; // ISO date string YYYY-MM-DD
  IsCommandant?: boolean; // 大隊長
  IsGM?: boolean;         // GM 遊戲管理員
  LineUserId?: string;    // LINE Login 綁定 ID
}

export interface Roster {
  email: string;
  name?: string;
  birthday?: string;
  squad_name?: string;    // 大隊
  team_name?: string;     // 小隊
  is_captain?: boolean;   // 小隊長
  is_commandant?: boolean; // 大隊長
}

export interface TeamSettings {
  team_name: string;
  team_coins: number;
  mandatory_quest_id?: string;       // 本週抽出的推薦定課 QuestID
  mandatory_quest_week?: string;     // 本次抽籤週一日期（YYYY-MM-DD）
  quest_draw_history?: string[];     // 已抽過的 QuestID 陣列
  inventory?: any;
}

export interface DailyLog {
  id?: string;
  Timestamp: string;
  UserID: string;
  QuestID: string;
  QuestTitle: string;
  RewardPoints: number;
}

export interface Quest {
  id: string;
  title: string;
  sub?: string;   // 任務名稱（特殊仙緣任務的短名稱，如「跟父母三道菜」）
  desc?: string;  // 任務說明（完成標準說明，如「面對面或是視訊」）
  reward: number;
  dice?: number;
  icon?: string;
  limit?: number;
}

export interface TemporaryQuest extends Quest {
  active: boolean;
  created_at?: string;
}

export interface SystemSettings {
  TopicQuestTitle: string;
  WorldState?: string;
  WorldStateMsg?: string;
  RegistrationMode?: 'open' | 'roster'; // 'open' = 自由註冊；'roster' = 名單驗證
}

export interface W4Application {
  id: string;
  user_id: string;
  user_name: string;
  squad_name?: string;
  battalion_name?: string;
  interview_target: string;
  interview_date: string;
  description?: string;
  quest_id: string;
  status: 'pending' | 'squad_approved' | 'approved' | 'rejected';
  squad_review_by?: string;
  squad_review_at?: string;
  squad_review_notes?: string;
  final_review_by?: string;
  final_review_at?: string;
  final_review_notes?: string;
  created_at?: string;
}

export interface AdminLog {
  id: string;
  action: string;
  actor?: string;
  target_id?: string;
  target_name?: string;
  details?: Record<string, any>;
  result?: string;
  created_at: string;
}

export interface Testimony {
  id: string;
  line_group_id: string | null;
  line_user_id: string;
  display_name: string | null;
  parsed_name: string | null;
  parsed_date: string | null;
  parsed_category: string | null;
  content: string;
  raw_message: string;
  created_at: string;
}

export interface TopicHistory {
  id: number;
  TopicTitle: string;
  created_at: string;
}

export interface TerrainInfo {
  id: string;
  name: string;
  url: string;
  scale: number;
  vOffset: number;
  color: string;
  effect: string;
}

export interface ZoneInfo {
  id: string;
  name: string;
  char?: string;
  color: string;
  textColor: string;
  icon: React.ReactNode;
}

export interface HexPos {
  q: number;
  r: number;
  x: number;
  y: number;
}

export interface WeeklyReview {
  summary: string;
  quote: string;
  trend: 'up' | 'down' | 'stable';
  weeklyRate: number;
}

export interface CaptainBriefing {
  teamSummary: string;
  topPerformer: string;
  needsSupport: string[];
  suggestion: string;
  teamMorale: 'high' | 'medium' | 'low';
}

export interface HexData extends HexPos {
  type: 'center' | 'corridor' | 'subzone';
  terrainId?: string;
  color: string;
  key: string;
  zoneId?: string;
  subIdx?: number;
  ring?: 'crisp' | 'performance' | 'culled';
}

export interface FinePaymentRecord {
  id: string;
  user_id: string;
  user_name: string;
  squad_name: string;
  amount: number;
  period_label: string;
  paid_to_captain_at: string | null;   // 隊員上繳小隊長日期
  submitted_to_org_at: string | null;  // 小隊長上繳大會日期（DB 保留，UI 不顯示）
  recorded_by: string;
  created_at: string;
}

export interface SquadFineSubmission {
  id: string;
  squad_name: string;
  amount: number;
  submitted_at: string;  // YYYY-MM-DD
  recorded_by: string;
  notes: string | null;
  created_at: string;
}

export interface AchievementRecord {
  achievement_id: string;
  unlocked_at: string;
}
