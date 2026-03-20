/**
 * 日程服务实现
 * 负责日程生成、缓存、变量/工具/命令注册与生命周期
 */

import { StructuredTool } from "@langchain/core/tools";
import { h, type Context, type Session } from "koishi";
import { z } from "zod";
import { resolveToolsConfig, resolveVariablesConfig } from "../config";
import type {
  ChatLunaPlugin,
  Config,
  LogFn,
  NormalizedTime,
  OutfitEntry,
  Schedule,
  ScheduleConfig,
  ScheduleEntry,
  ScheduleService,
} from "../types";
import type { WeatherService } from "../types";

interface ScheduleRenderData {
  title: string;
  description: string;
  entries: ScheduleEntry[];
  outfits?: OutfitEntry[];
  date: string;
}

interface ScheduleServiceDeps {
  ctx: Context;
  config: Config;
  getModel: () => {
    invoke?: (prompt: string) => Promise<{ content?: unknown } | unknown>;
  } | null;
  getMessageContent: (content: unknown) => string;
  resolvePersonaPreset: () => string;
  getWeatherText: () => Promise<string>;
  renderSchedule: (data: ScheduleRenderData) => Promise<Buffer | null>;
  log: LogFn;
}

const globalScheduleCache = new Map<
  string,
  { schedule: Schedule; date: string }
>();

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function normalizeTime(
  value: string | null | undefined,
): NormalizedTime | null {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const match = text.match(/(\d{1,2})(?::(\d{1,2}))?/);
  if (!match) return null;

  let hour = Number(match[1]);
  let minute = Number(match[2] ?? "0");

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

  if (hour === 24 && minute > 0) hour = 23;
  if (hour >= 24) {
    hour = 24;
    minute = 0;
  }

  hour = Math.max(0, Math.min(24, hour));
  minute = Math.max(0, Math.min(59, minute));

  const minutes = hour * 60 + minute;
  return {
    minutes,
    label: `${pad(Math.min(23, hour))}:${pad(minute)}`,
    raw: text,
  };
}

function formatDateForDisplay(
  date: Date,
  timezone: string,
): { dateStr: string; weekday: string } {
  try {
    const formatter = new Intl.DateTimeFormat("zh-CN", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "long",
    });
    const parts = formatter.formatToParts(date);
    const year = parts.find((p) => p.type === "year")?.value || "";
    const month = parts.find((p) => p.type === "month")?.value || "";
    const day = parts.find((p) => p.type === "day")?.value || "";
    const weekday = parts.find((p) => p.type === "weekday")?.value || "";
    return { dateStr: `${year}年${month}月${day}日`, weekday };
  } catch {
    return { dateStr: date.toLocaleDateString("zh-CN"), weekday: "未知" };
  }
}

function getCurrentMinutes(timezone: string): number {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const hour = Number(parts.find((p) => p.type === "hour")?.value || 0);
    const minute = Number(parts.find((p) => p.type === "minute")?.value || 0);
    return hour * 60 + minute;
  } catch {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }
}

export function formatScheduleText(schedule: Schedule): string {
  const lines: string[] = [];
  lines.push(schedule.title || "📅 今日日程");
  if (schedule.description) lines.push("", schedule.description);

  if (schedule.outfits?.length) {
    lines.push("", "👗 今日穿搭");
    for (const outfit of schedule.outfits) {
      lines.push(`  ${outfit.start}-${outfit.end}：${outfit.description}`);
    }
  }

  lines.push("", "📋 日程安排");
  for (const entry of schedule.entries) {
    lines.push(`  ⏰ ${entry.start}-${entry.end}  ${entry.summary}`);
  }

  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildSummary(title: string, detail: string): string {
  const head = title || "日程";
  const body = detail ? detail.trim() : "";
  if (!body) return head;
  const joiner = body.startsWith("。") ? "" : "。";
  return `${head}${joiner}${body}`;
}

export function derivePersonaTag(persona: string): string {
  const text = String(persona || "").trim();
  if (!text) return "我";

  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return "我";
  const first = lines[0];
  if (first.length <= 12) return first;
  return first.slice(0, 12);
}

export function createScheduleService(
  deps: ScheduleServiceDeps,
): ScheduleService {
  const {
    ctx,
    config,
    getModel,
    getMessageContent,
    resolvePersonaPreset,
    getWeatherText,
    renderSchedule,
    log,
  } = deps;

  const scheduleConfig: ScheduleConfig = config.schedule || {
    enabled: true,
    timezone: "Asia/Shanghai",
    renderAsImage: false,
    startDelay: 3000,
    prompt: "",
  };

  const variableConfig = resolveVariablesConfig(config);
  const toolsConfig = resolveToolsConfig(config);

  const enabled = scheduleConfig.enabled !== false;
  const timezone = scheduleConfig.timezone || "Asia/Shanghai";
  const cacheKey = `schedule_${variableConfig.schedule || "default"}`;

  const cached = globalScheduleCache.get(cacheKey);
  let cachedSchedule: Schedule | null = cached?.schedule || null;
  let cachedDate: string | null = cached?.date || null;
  let pendingGeneration: Promise<Schedule | null> | null = null;
  let lastSessionRef: Session | undefined;
  let refreshIntervalDispose: (() => void) | null = null;
  let retryIntervalDispose: (() => void) | null = null;
  let startupTimeoutDispose: (() => void) | null = null;

  const getCachedByDate = (dateStr: string): Schedule | null => {
    if (cachedSchedule && cachedDate === dateStr) return cachedSchedule;
    return null;
  };

  const setCache = (schedule: Schedule, dateStr: string): void => {
    cachedSchedule = schedule;
    cachedDate = dateStr;
    globalScheduleCache.set(cacheKey, { schedule, date: dateStr });
  };

  const clearCache = (): void => {
    cachedSchedule = null;
    cachedDate = null;
    globalScheduleCache.delete(cacheKey);
  };

  const stopRetryInterval = (): void => {
    if (!retryIntervalDispose) return;
    retryIntervalDispose();
    retryIntervalDispose = null;
  };

  const pickField = (
    source: Record<string, unknown>,
    fields: string[],
  ): string => {
    for (const key of fields) {
      if (!(key in source)) continue;
      const value = source[key];
      if (value === undefined || value === null) continue;
      const text = String(value).trim();
      if (text) return text;
    }
    return "";
  };

  const normalizeOutfits = (items: unknown[]): OutfitEntry[] => {
    if (!Array.isArray(items) || !items.length) return [];
    const outfits: OutfitEntry[] = [];

    for (const item of items) {
      const record = item as Record<string, unknown>;
      const start = normalizeTime(
        pickField(record, ["start", "from", "begin", "startTime"]),
      );
      const end = normalizeTime(
        pickField(record, ["end", "to", "finish", "endTime"]),
      );
      const description = pickField(record, [
        "description",
        "outfit",
        "clothes",
        "detail",
        "穿搭",
      ]);
      if (!start || !description) continue;

      const endMinutes = end
        ? end.minutes
        : Math.min(1440, start.minutes + 360);
      const safeEnd =
        endMinutes <= start.minutes
          ? Math.min(1440, start.minutes + 180)
          : Math.min(1440, endMinutes);

      outfits.push({
        start: start.label,
        end: `${pad(Math.floor(safeEnd / 60))}:${pad(safeEnd % 60)}`,
        startMinutes: start.minutes,
        endMinutes: safeEnd,
        description,
      });
    }

    outfits.sort((a, b) => a.startMinutes - b.startMinutes);
    return outfits;
  };

  const normalizeEntries = (
    items: unknown[],
    personaTag: string,
  ): ScheduleEntry[] | null => {
    if (!Array.isArray(items) || !items.length) return null;
    const normalized: ScheduleEntry[] = [];

    for (const item of items) {
      const record = item as Record<string, unknown>;
      const start = normalizeTime(
        pickField(record, ["start", "from", "begin", "time", "startTime"]),
      );
      const end = normalizeTime(
        pickField(record, ["end", "to", "finish", "stop", "endTime"]),
      );

      if (
        !start ||
        (!end &&
          normalized.length &&
          normalized[normalized.length - 1].endMinutes === start.minutes)
      ) {
        continue;
      }

      const activity =
        pickField(record, ["activity", "title", "name", "label", "task"]) ||
        "日程";
      const detail = pickField(record, [
        "detail",
        "description",
        "note",
        "summary",
        "mood",
      ]);
      const endMinutes = end ? end.minutes : Math.min(1440, start.minutes + 90);
      const safeEnd =
        endMinutes <= start.minutes
          ? Math.min(1440, start.minutes + 60)
          : Math.min(1440, endMinutes);

      normalized.push({
        start: start.label,
        end: `${pad(Math.floor(safeEnd / 60))}:${pad(safeEnd % 60)}`,
        startMinutes: start.minutes,
        endMinutes: safeEnd,
        summary: buildSummary(
          activity,
          detail || `${personaTag}保持着角色状态`,
        ),
      });
    }

    if (!normalized.length) return null;
    normalized.sort((a, b) => a.startMinutes - b.startMinutes);
    return normalized;
  };

  const applyPromptTemplate = (
    template: string,
    variables: Record<string, unknown>,
  ): string => {
    return template.replace(/\{(\w+)\}/g, (_, key) => {
      const value = variables[key as string];
      return value === undefined || value === null ? "" : String(value);
    });
  };

  const parseScheduleResponse = (
    text: string,
    personaTag: string,
  ): Schedule | null => {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      const data = JSON.parse(match[0]) as {
        title?: string;
        description?: string;
        entries?: unknown[];
        outfits?: unknown[];
      };

      const { dateStr } = formatDateForDisplay(new Date(), timezone);
      const entries = normalizeEntries(data.entries || [], personaTag);
      if (!entries) return null;

      const outfits = normalizeOutfits(data.outfits || []);
      const schedule: Schedule = {
        source: "model",
        date: dateStr,
        title: (data.title && String(data.title).trim()) || "📅 今日日程",
        description:
          typeof data.description === "string" ? data.description.trim() : "",
        entries,
        outfits,
        text: "",
      };
      schedule.text = formatScheduleText(schedule);
      return schedule;
    } catch (error) {
      log("warn", "解析日程响应失败", error);
      return null;
    }
  };

  const generateSchedule = async (): Promise<Schedule | null> => {
    const model = getModel();
    if (!model?.invoke) {
      log("warn", "模型尚未就绪，无法生成日程");
      return null;
    }

    const now = new Date();
    const { dateStr, weekday } = formatDateForDisplay(now, timezone);
    const personaText =
      resolvePersonaPreset() || "（暂无额外设定，可按温和友善的年轻人）";
    const personaTag = derivePersonaTag(personaText);
    const weatherText = await getWeatherText();

    const prompt = applyPromptTemplate(scheduleConfig.prompt || "", {
      date: dateStr,
      weekday,
      persona: personaText,
      personaPreset: personaText,
      weather: weatherText || "（暂无天气信息）",
    });

    try {
      const response = await model.invoke(prompt);
      const text = getMessageContent(
        (response as { content?: unknown })?.content ?? response,
      );
      const schedule = parseScheduleResponse(
        typeof text === "string" ? text : String(text ?? ""),
        personaTag,
      );
      if (!schedule) return null;

      setCache(schedule, dateStr);
      stopRetryInterval();
      return schedule;
    } catch (error) {
      log("warn", "生成日程失败", error);
      return null;
    }
  };

  const ensureSchedule = async (
    session?: Session,
    retryCount = 0,
  ): Promise<Schedule | null> => {
    if (!enabled) return null;

    const now = new Date();
    const { dateStr } = formatDateForDisplay(now, timezone);
    if (session) lastSessionRef = session;

    const cachedToday = getCachedByDate(dateStr);
    if (cachedToday) return cachedToday;

    if (pendingGeneration) return pendingGeneration;

    const maxRetries = 3;
    pendingGeneration = (async () => {
      try {
        const result = await generateSchedule();
        if (result) return result;

        if (retryCount >= maxRetries - 1) {
          log("warn", `日程生成失败，已达到最大重试次数 ${maxRetries}`);
          return null;
        }

        log(
          "warn",
          `日程生成失败，${retryCount + 1}/${maxRetries} 次重试中...`,
        );
        pendingGeneration = null;
        await new Promise((resolve) =>
          setTimeout(resolve, 2000 * (retryCount + 1)),
        );
        return ensureSchedule(session || lastSessionRef, retryCount + 1);
      } catch (error) {
        if (retryCount >= maxRetries - 1) {
          log("warn", `日程生成异常，已达到最大重试次数 ${maxRetries}`, error);
          return null;
        }

        log(
          "warn",
          `日程生成异常，${retryCount + 1}/${maxRetries} 次重试`,
          error,
        );
        pendingGeneration = null;
        await new Promise((resolve) =>
          setTimeout(resolve, 2000 * (retryCount + 1)),
        );
        return ensureSchedule(session || lastSessionRef, retryCount + 1);
      } finally {
        pendingGeneration = null;
      }
    })();

    return pendingGeneration;
  };

  const startRetryInterval = (): void => {
    if (retryIntervalDispose) return;

    retryIntervalDispose = ctx.setInterval(
      async () => {
        const { dateStr } = formatDateForDisplay(new Date(), timezone);
        if (getCachedByDate(dateStr)) {
          stopRetryInterval();
          return;
        }

        const result = await ensureSchedule();
        if (result) stopRetryInterval();
      },
      10 * 60 * 1000,
    );
  };

  const renderImage = async (schedule: Schedule): Promise<Buffer | null> => {
    if (!schedule.entries.length) return null;

    try {
      return await renderSchedule({
        title: schedule.title || scheduleConfig.title || "今日日程",
        description: schedule.description || "",
        entries: schedule.entries,
        outfits: schedule.outfits,
        date: schedule.date,
      });
    } catch (error) {
      log("warn", "日程图片渲染失败", error);
      return null;
    }
  };

  const registerVariables = (): string[] => {
    if (!enabled) return [];

    const variableName = variableConfig.schedule || "schedule";
    const currentVariableName =
      variableConfig.currentSchedule || "currentSchedule";
    const outfitVariableName = variableConfig.outfit || "outfit";
    const currentOutfitVariableName =
      variableConfig.currentOutfit || "currentOutfit";

    const promptRenderer = (
      ctx as unknown as {
        chatluna?: { promptRenderer?: { registerFunctionProvider?: Function } };
      }
    ).chatluna?.promptRenderer;
    if (!promptRenderer?.registerFunctionProvider) return [];

    promptRenderer.registerFunctionProvider(
      variableName,
      async (
        _args: string[],
        _vars: Record<string, unknown>,
        configurable: { session?: Session },
      ) => {
        const payload = await ensureSchedule(configurable?.session);
        return payload?.text || "";
      },
    );

    promptRenderer.registerFunctionProvider(
      currentVariableName,
      async (
        _args: string[],
        _vars: Record<string, unknown>,
        configurable: { session?: Session },
      ) => {
        const payload = await ensureSchedule(configurable?.session);
        if (!payload || !payload.entries.length) return "";

        const currentMinutes = getCurrentMinutes(timezone);
        const current = payload.entries.find(
          (entry) =>
            currentMinutes >= entry.startMinutes &&
            currentMinutes < entry.endMinutes,
        );
        if (!current) return payload.description || "";
        return `${current.start}-${current.end}：${current.summary}`;
      },
    );

    promptRenderer.registerFunctionProvider(
      outfitVariableName,
      async (
        _args: string[],
        _vars: Record<string, unknown>,
        configurable: { session?: Session },
      ) => {
        const payload = await ensureSchedule(configurable?.session);
        if (!payload?.outfits.length) return "";
        return payload.outfits
          .map(
            (outfit) => `${outfit.start}-${outfit.end}：${outfit.description}`,
          )
          .join("\n");
      },
    );

    promptRenderer.registerFunctionProvider(
      currentOutfitVariableName,
      async (
        _args: string[],
        _vars: Record<string, unknown>,
        configurable: { session?: Session },
      ) => {
        const payload = await ensureSchedule(configurable?.session);
        if (!payload?.outfits.length) return "";
        const currentMinutes = getCurrentMinutes(timezone);
        const outfit = payload.outfits.find(
          (item) =>
            currentMinutes >= item.startMinutes &&
            currentMinutes < item.endMinutes,
        );
        return outfit?.description || "";
      },
    );

    return [
      variableName,
      currentVariableName,
      outfitVariableName,
      currentOutfitVariableName,
    ];
  };

  const registerTool = (plugin: ChatLunaPlugin): string | null => {
    if (!enabled || toolsConfig.schedule.register === false) return null;

    const toolName = toolsConfig.schedule.name;
    const toolDescription = toolsConfig.schedule.description;

    plugin.registerTool(toolName, {
      selector: () => true,
      createTool: () =>
        // @ts-expect-error zod 和 StructuredTool 的推导深度过大
        new (class extends StructuredTool {
          name = toolName;
          description = toolDescription;
          schema = z.object({});

          async _call(
            _input: Record<string, never>,
            _manager?: unknown,
            runnable?: unknown,
          ) {
            const session = (
              runnable as { configurable?: { session?: Session } }
            )?.configurable?.session;
            const payload = await ensureSchedule(session);
            if (!payload)
              return enabled ? "今日暂未生成日程。" : "当前未启用日程功能。";
            return payload.text;
          }
        })(),
    });

    return toolName;
  };

  const registerCommand = (): void => {
    if (!enabled) return;

    ctx
      .command("schedule.today", "查看今日日程", { authority: 2 })
      .example("schedule.today")
      .action(async ({ session }) => {
        const schedule = await ensureSchedule(session as Session);
        if (!schedule) return "暂无今日日程。";

        if (scheduleConfig.renderAsImage) {
          const buffer = await renderImage(schedule);
          if (buffer) return h.image(buffer, "image/png");
          return `${schedule.text || "暂无今日日程。"}\n（日程图片渲染失败，已改为文本模式）`;
        }

        return schedule.text || "暂无今日日程。";
      });

    ctx
      .command("schedule.refresh", "重新生成今日日程", { authority: 4 })
      .example("schedule.refresh")
      .action(async ({ session }) => {
        clearCache();
        stopRetryInterval();
        const regenerated = await ensureSchedule(session as Session);
        if (regenerated) return "已重新生成今日日程。";
        startRetryInterval();
        return "重新生成失败，将继续每10分钟尝试一次。";
      });
  };

  return {
    enabled,
    registerVariables,
    registerTool,
    registerCommand,
    start: () => {
      if (!enabled || refreshIntervalDispose) return;

      const startDelay = scheduleConfig.startDelay ?? 3000;
      startupTimeoutDispose = ctx.setTimeout(() => {
        ensureSchedule().then((result) => {
          if (!result) startRetryInterval();
        });
      }, startDelay);

      refreshIntervalDispose = ctx.setInterval(async () => {
        const result = await ensureSchedule();
        if (!result && !retryIntervalDispose) {
          const { dateStr } = formatDateForDisplay(new Date(), timezone);
          if (cachedDate !== dateStr) startRetryInterval();
        }
      }, 60 * 1000);
    },
    dispose: () => {
      refreshIntervalDispose?.();
      refreshIntervalDispose = null;
      retryIntervalDispose?.();
      retryIntervalDispose = null;
      startupTimeoutDispose?.();
      startupTimeoutDispose = null;
      pendingGeneration = null;
    },
    regenerateSchedule: async (session?: Session) => {
      clearCache();
      stopRetryInterval();
      return ensureSchedule(session);
    },
    getSchedule: async (session?: Session) => {
      if (!enabled) return null;
      if (session) lastSessionRef = session;
      return cachedSchedule;
    },
    getScheduleText: async (session?: Session) => {
      const schedule = await ensureSchedule(session);
      return schedule?.text || "";
    },
    getCurrentSummary: async (session?: Session) => {
      const schedule = await ensureSchedule(session);
      if (!schedule || !schedule.entries.length) return "";
      const currentMinutes = getCurrentMinutes(timezone);
      const current = schedule.entries.find(
        (entry) =>
          currentMinutes >= entry.startMinutes &&
          currentMinutes < entry.endMinutes,
      );
      return current ? current.summary : schedule.description || "";
    },
  };
}
