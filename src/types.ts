/**
 * 插件核心类型定义
 * 包含配置、日程、天气与集成接口
 */

import type { Session } from "koishi";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFn = (
  level: LogLevel,
  message: string,
  detail?: unknown,
) => void;

export interface ToolItemConfig {
  register: boolean;
  name: string;
  description: string;
}

export interface ToolsConfig {
  schedule: ToolItemConfig;
  weather: ToolItemConfig;
}

export interface ScheduleConfig {
  enabled: boolean;
  model?: string;
  personaSource?: "none" | "chatluna" | "custom";
  personaChatlunaPreset?: string;
  personaCustomPreset?: string;
  timezone: string;
  renderAsImage: boolean;
  startDelay: number;
  prompt: string;
  title?: string;
  registerTool?: boolean;
  toolName?: string;
  toolDescription?: string;
}

export interface WeatherConfig {
  enabled: boolean;
  cityName: string;
  hourlyRefresh: boolean;
  registerTool?: boolean;
  toolName?: string;
  toolDescription?: string;
}

export interface VariablesConfig {
  schedule: string;
  currentSchedule: string;
  outfit: string;
  currentOutfit: string;
  weather: string;
}

export interface Config {
  debugLogging?: boolean;
  schedule: ScheduleConfig;
  weather: WeatherConfig;
  variables?: VariablesConfig;
  tools?: ToolsConfig;
}

export interface ScheduleEntry {
  start: string;
  end: string;
  startMinutes: number;
  endMinutes: number;
  summary: string;
}

export interface OutfitEntry {
  start: string;
  end: string;
  startMinutes: number;
  endMinutes: number;
  description: string;
}

export interface Schedule {
  source: string;
  date: string;
  title: string;
  description: string;
  entries: ScheduleEntry[];
  outfits: OutfitEntry[];
  text: string;
}

export interface NormalizedTime {
  minutes: number;
  label: string;
  raw: string;
}

export interface CurrentWeather {
  city: string;
  province: string;
  date: string;
  time: string;
  weather: string;
  temp: number;
  minTemp: number;
  maxTemp: number;
  wind: string;
  windLevel: string;
  humidity: string;
  airLevel: string;
  airTips: string;
}

export interface WeatherQueryOptions {
  city?: string;
}

export interface WeatherService {
  getCurrentWeather: (
    options?: WeatherQueryOptions,
  ) => Promise<CurrentWeather | null>;
  getWeatherText: (options?: WeatherQueryOptions) => Promise<string>;
  getDailyWeather: (options?: WeatherQueryOptions) => Promise<string>;
  getHourlyWeather: (options?: WeatherQueryOptions) => Promise<string>;
  getEffectiveCityName: (session?: Session) => string;
  invalidateCache: () => void;
}

export interface ScheduleService {
  enabled: boolean;
  registerVariables: () => string[];
  registerTool: (plugin: ChatLunaPlugin) => string | null;
  registerCommand: () => void;
  start: () => void;
  dispose: () => void;
  regenerateSchedule: (session?: Session) => Promise<Schedule | null>;
  getSchedule: (session?: Session) => Promise<Schedule | null>;
  getScheduleText: (session?: Session) => Promise<string>;
  getCurrentSummary: (session?: Session) => Promise<string>;
}

export interface ChatLunaPlugin {
  registerTool: (name: string, options: ToolRegistration) => void;
}

export interface ToolRegistration {
  selector: () => boolean;
  createTool: () => unknown;
  authorization?: (session: Session | undefined) => boolean;
}

export interface PromptRendererLike {
  registerFunctionProvider?: (
    name: string,
    provider: (
      args: string[],
      variables: Record<string, unknown>,
      configurable: { session?: Session; [key: string]: unknown },
    ) => Promise<string> | string,
  ) => (() => void) | void;
}

export interface ChatLunaContextLike {
  createChatModel?: (model: string) => Promise<{ value?: unknown } | unknown>;
  config?: {
    defaultModel?: string;
  };
  preset?: {
    getPreset?: (name: string) => { value?: unknown } | undefined;
  };
  personaPrompt?: string;
  promptRenderer?: PromptRendererLike;
}
