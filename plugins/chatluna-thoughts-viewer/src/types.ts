/**
 * 插件核心类型定义
 * 约束配置、日志与思考缓存接口
 */

import type { Session } from "koishi";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFn = (
  level: LogLevel,
  message: string,
  detail?: unknown,
) => void;

export interface Config {
  monitoredTag: string;
  commandName: string;
  commandAliases: string[];
  previousCommandName: string;
  previousCommandAliases: string[];
  emptyMessage: string;
  debugLogging: boolean;
}

export interface ThoughtSnapshot {
  current: string;
  previous?: string;
}

export interface ThinkStore {
  update: (key: string, content: string) => void;
  getCurrent: (key: string) => string | undefined;
  getPrevious: (key: string) => string | undefined;
  size: () => number;
}

export interface ParseTagContentResult {
  thoughts: string[];
}

export type ThoughtSession = Pick<Session, "platform" | "guildId">;
