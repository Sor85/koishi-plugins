/**
 * 通用类型定义
 * 包含日志、数值处理、会话种子等基础类型
 */

import type { Session } from "koishi";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFn = (
  level: LogLevel,
  message: string,
  detail?: unknown,
) => void;

export type ClampFn = (value: number, low: number, high: number) => number;

export interface SessionSeed {
  scopeId?: string;
  platform?: string;
  userId?: string;
  nickname?: string;
  authorNickname?: string;
  session?: Session;
}
