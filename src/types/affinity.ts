/**
 * 好感度相关类型定义
 * 包含好感度记录、状态、动作、系数等核心类型
 */

export interface LegacyAffinityRecord {
  userId: string;
  nickname: string | null;
  affinity: number;
  relation: string | null;
  specialRelation: string | null;
  shortTermAffinity: number | null;
  longTermAffinity: number | null;
  chatCount: number | null;
  actionStats: string | null;
  lastInteractionAt: Date | null;
  coefficientState: string | null;
}

export interface AffinityRecord extends LegacyAffinityRecord {
  scopeId: string;
}

export type ActionType = "increase" | "decrease";

export interface ActionEntry {
  action: ActionType;
  timestamp: number;
}

export interface ActionCounts {
  increase: number;
  decrease: number;
}

export interface ActionStats {
  total: number;
  counts: ActionCounts;
  entries: ActionEntry[];
}

export interface CoefficientState {
  streak: number;
  coefficient: number;
  decayPenalty: number;
  streakBoost: number;
  inactivityDays: number;
  lastInteractionAt: Date | null;
}

export interface AffinityState {
  affinity: number;
  longTermAffinity: number;
  shortTermAffinity: number;
  chatCount: number;
  actionStats: ActionStats;
  lastInteractionAt: Date | null;
  coefficientState: CoefficientState;
  isNew?: boolean;
}

export interface CombinedState {
  affinity: number;
  longTermAffinity: number;
  shortTermAffinity: number;
}

export interface InitialRange {
  low: number;
  high: number;
  min: number;
  max: number;
}

export interface SaveExtra {
  longTermAffinity?: number;
  shortTermAffinity?: number;
  chatCount?: number;
  actionStats?: ActionStats;
  coefficientState?: CoefficientState;
  lastInteractionAt?: Date;
}

export interface ResolvedShortTermConfig {
  promoteThreshold: number;
  demoteThreshold: number;
  longTermPromoteStep: number;
  longTermDemoteStep: number;
}

export interface ResolvedActionWindowConfig {
  windowHours: number;
  windowMs: number;
  increaseBonus: number;
  decreaseBonus: number;
  bonusChatThreshold: number;
  allowBonusOverflow: boolean;
  maxEntries: number;
}

export interface ResolvedCoefficientConfig {
  base: number;
  maxDrop: number;
  maxBoost: number;
  decayPerDay: number;
  boostPerDay: number;
  min: number;
  max: number;
}

export interface CoefficientResult {
  coefficient: number;
  decayPenalty: number;
  streakBoost: number;
  inactivityDays: number;
}

export interface SummarizedActions {
  entries: ActionEntry[];
  counts: ActionCounts;
  total: number;
}

export interface AffinityCache {
  get: (scopeId: string, userId: string) => number | null;
  set: (scopeId: string, userId: string, value: number) => void;
  clear: (scopeId: string, userId: string) => void;
  clearAll?: () => void;
}
