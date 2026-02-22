import React from 'react';

export interface CharacterStats {
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
  TotalFines: number;
  CurrentQ: number;
  CurrentR: number;
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
  sub?: string;
  reward: number;
  dice?: number;
  icon?: string;
  limit?: number;
}

export interface SystemSettings {
  MandatoryQuestId: string;
  TopicQuestTitle: string;
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

export interface HexPos {
  q: number;
  r: number;
  x: number;
  y: number;
}

export interface HexData extends HexPos {
  type: 'center' | 'corridor' | 'subzone';
  terrainId?: string;
  color: string;
  key: string;
  zoneId?: string;
  subIdx?: number;
}
