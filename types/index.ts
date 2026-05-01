export interface CharacterStats {
  UserID: string;
  Name: string;
  Score: number;    // 累積總分（原 Exp 欄位，已更名）
  Streak: number;
  LastCheckIn: string | null;
  Email?: string;
  SquadName?: string;   // 大隊名稱
  TeamName?: string;    // 小隊名稱
  IsCaptain?: boolean;
  SquadRole?: string;   // 小隊角色職稱（副隊長/抱抱/衡衡/叮叮1號/叮叮2號/樂樂）
  Birthday?: string;    // ISO date string YYYY-MM-DD
  IsCommandant?: boolean; // 大隊長
  IsGM?: boolean;         // GM 遊戲管理員
  LineUserId?: string;    // LINE Login 綁定 ID
  'Score_事業運'?: number;
  'Score_財富運'?: number;
  'Score_情感運'?: number;
  'Score_家庭運'?: number;
  'Score_體能運'?: number;
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
  sub?: string;   // 任務短說明
  desc?: string;  // 完成標準說明
  reward: number;
  icon?: string;
  limit?: number; // 每週/月上限次數
}

export interface TemporaryQuest extends Quest {
  active: boolean;
  created_at?: string;
}

export interface CourseEvent {
  id: string;          // 唯一識別碼，用於 localStorage key 與 CourseRegistrations
  name: string;
  date: string;        // YYYY-MM-DD
  dateDisplay: string; // 顯示用（含星期），e.g. '2026年6月23日（二）'
  time: string;        // e.g. '19:00–21:40'
  location: string;
  enabled: boolean;    // false = 關閉報名（按鈕 disabled）
}

export interface AnnouncementItem {
  id: string;           // 'ann_' + Date.now()
  text: string;
  created_at: string;   // ISO-8601
}

export interface SystemSettings {
  RegistrationMode?: 'open' | 'roster'; // 'open' = 自由註冊；'roster' = 名單驗證
  VolunteerPassword?: string;
  QuestRewardOverrides?: Record<string, number>;  // 定課分值動態調整：questId → reward
  DisabledQuests?: string[];                       // 停用的定課 ID 列表
  CourseEvents?: CourseEvent[];                    // 慶典場次（後台可動態管理）
  Announcement?: string;                           // 舊版單一公告（保留供向下相容讀取）
  Announcements?: AnnouncementItem[];              // 新版公告陣列（newest first）
}

export interface BonusApplication {
  id: string;
  user_id: string;
  user_name: string;
  squad_name?: string;
  battalion_name?: string;
  interview_target: string;   // 報名項目描述
  interview_date: string;     // YYYY-MM-DD
  description?: string;
  quest_id: string;           // 'o1' / 'o2_1' / 'o3' 等一次性任務 ID
  status: 'pending' | 'squad_approved' | 'approved' | 'rejected';
  squad_review_by?: string;
  squad_review_at?: string;
  squad_review_notes?: string;
  final_review_by?: string;
  final_review_at?: string;
  final_review_notes?: string;
  screenshot_url?: string;    // 截圖憑證
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

export interface NineGridCell {
  label: string;
  description: string;
}

export interface NineGridTemplate {
  id: number;
  companion_type: string; // '事業運' | '財富運' | '情感運' | '家庭運' | '體能運'
  cells: NineGridCell[];
  cell_score: number;
  updated_at: string;
}

export interface UserNineGridCell extends NineGridCell {
  completed: boolean;
  completed_at: string | null;
}

export interface UserNineGrid {
  id: number;
  member_id: string;
  companion_type: string;
  cells: UserNineGridCell[];
  cell_score: number;
  created_at: string;
  updated_at: string;
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
  Score: number;    // 累積總分
  Streak: number;
  TeamName?: string;
  IsCaptain: boolean;
  lastCheckIn?: string; // 最近一筆 DailyLogs Timestamp（YYYY-MM-DD）
}


