import React from 'react';

export interface CharacterStats {
  UserID: string;
  Name: string;
  Level: number;
  Exp: number;
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
  SquadRole?: string; // 小隊角色職稱（副隊長/抱抱/衡衡/叮叮1號/叮叮2號/樂樂）
  Inventory?: string[];
  InitialFortunes?: Record<string, number>;
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
  squad_role?: string;    // 小隊角色職稱
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
  sub?: string;   // 任務名稱（特別任務的短名稱，如「跟父母三道菜」）
  desc?: string;  // 任務說明（完成標準說明，如「面對面或是視訊」）
  reward: number;
  icon?: string;
  limit?: number;
}

export interface TemporaryQuest extends Quest {
  active: boolean;
  created_at?: string;
}

export interface FineSettings {
  enabled: boolean;
  amount: number;
  items: string[];
  periodStart: string;
  periodEnd: string;
}

export interface SystemSettings {
  TopicQuestTitle: string;
  RegistrationMode?: 'open' | 'roster'; // 'open' = 自由註冊；'roster' = 名單驗證
  VolunteerPassword?: string;
  FineSettings?: FineSettings;
}

export interface BonusApplication {
  id: string;
  user_id: string;
  user_name: string;
  squad_name?: string;
  battalion_name?: string;
  interview_target: string;   // 訪談對象（w4）或報名項目描述（b3-b7）
  interview_date: string;     // YYYY-MM-DD
  description?: string;
  quest_id: string;           // 'w4|date|target' 或 'b3'/'b4'/'b5'/'b6'/'b7|date'
  status: 'pending' | 'squad_approved' | 'approved' | 'rejected';
  squad_review_by?: string;
  squad_review_at?: string;
  squad_review_notes?: string;
  final_review_by?: string;
  final_review_at?: string;
  final_review_notes?: string;
  screenshot_url?: string;    // b5/b6 聯誼會截圖憑證
  created_at?: string;
}

/** @deprecated 請改用 BonusApplication */
export type W4Application = BonusApplication;

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

export interface ZoneInfo {
  id: string;
  name: string;
  char?: string;
  color: string;
  textColor: string;
  icon: React.ReactNode;
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


export interface CourseRegistration {
  id: string;
  user_id: string;
  course_key: string;
  registered_at: string;
}

export interface SquadMemberStats {
  UserID: string;
  Name: string;
  Level: number;
  Exp: number;
  Streak: number;
  TeamName?: string;
  IsCaptain: boolean;
  lastCheckIn?: string; // 最近一筆 DailyLogs Timestamp（YYYY-MM-DD）
}

export interface AngelCallPairing {
  teamName: string;
  group: Array<{ id: string; name: string }>;
}

export interface AngelCallPairingsData {
  weekOf: string;
  pairings: AngelCallPairing[];
}
