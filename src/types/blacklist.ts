/**
 * 黑名单相关类型定义
 * 包含数据库记录、展示结构和服务接口
 */

export type BlacklistMode = "permanent" | "temporary";

export interface LegacyBlacklistRecord {
  platform: string;
  userId: string;
  mode: BlacklistMode;
  blockedAt: Date;
  expiresAt: Date | null;
  nickname: string | null;
  note: string | null;
  durationHours: number | null;
  penalty: number | null;
}

export interface BlacklistRecord extends LegacyBlacklistRecord {
  scopeId: string;
}

export interface BlacklistEntry {
  scopeId: string;
  platform: string;
  userId: string;
  blockedAt: string;
  nickname?: string;
  note: string;
}

export interface TemporaryBlacklistEntry {
  scopeId: string;
  platform: string;
  userId: string;
  blockedAt: string;
  expiresAt: string;
  nickname?: string;
  note: string;
  durationHours: number | string;
  penalty: number | string;
}

export interface BlacklistDetail {
  note?: string;
  nickname?: string;
}

export interface InMemoryTemporaryEntry {
  expiresAt: number;
  nickname: string;
}
