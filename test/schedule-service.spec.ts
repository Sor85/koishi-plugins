/**
 * 日程服务测试
 * 验证时间解析、文本组装与工具注册描述逻辑
 */

import type { Context } from "koishi";
import { describe, expect, it } from "vitest";
import { DEFAULT_TOOLS_CONFIG } from "../src/schema";
import {
  buildSummary,
  createScheduleService,
  derivePersonaTag,
  formatScheduleText,
  normalizeTime,
  type Schedule,
} from "../src/services/schedule-service";
import type { ToolRegistration } from "../src/types";

describe("schedule service utilities", () => {
  it("normalizes common time formats", () => {
    expect(normalizeTime("7:30")?.minutes).toBe(450);
    expect(normalizeTime("24:00")?.minutes).toBe(1440);
    expect(normalizeTime("")?.minutes).toBeUndefined();
  });

  it("builds schedule text with outfits and entries", () => {
    const schedule: Schedule = {
      source: "model",
      date: "2026年03月04日",
      title: "📅 今日日程",
      description: "测试描述",
      entries: [
        {
          start: "08:00",
          end: "09:00",
          startMinutes: 480,
          endMinutes: 540,
          summary: "晨间整理",
        },
      ],
      outfits: [
        {
          start: "08:00",
          end: "12:00",
          startMinutes: 480,
          endMinutes: 720,
          description: "基础通勤穿搭",
        },
      ],
      text: "",
    };

    const text = formatScheduleText(schedule);
    expect(text).toContain("📅 今日日程");
    expect(text).toContain("👗 今日穿搭");
    expect(text).toContain("⏰ 08:00-09:00  晨间整理");
  });

  it("builds summary and persona tag", () => {
    expect(buildSummary("学习", "整理今日计划")).toBe("学习。整理今日计划");
    expect(derivePersonaTag("小夏\n喜欢记录生活")).toBe("小夏");
  });
});

describe("schedule service tool registration", () => {
  function createService(options?: {
    tools?: {
      schedule?: {
        register?: boolean;
        name?: string;
        description?: string;
      };
      weather?: {
        register?: boolean;
        name?: string;
        description?: string;
      };
    };
    legacySchedule?: {
      registerTool?: boolean;
      toolName?: string;
      toolDescription?: string;
    };
  }) {
    const registrations: Array<{ name: string; options: ToolRegistration }> =
      [];
    const service = createScheduleService({
      ctx: {} as Context,
      config: {
        schedule: {
          enabled: true,
          model: "",
          personaSource: "none",
          personaChatlunaPreset: "无",
          personaCustomPreset: "",
          timezone: "Asia/Shanghai",
          renderAsImage: false,
          startDelay: 1000,
          prompt: "test",
          ...options?.legacySchedule,
        },
        weather: {
          enabled: false,
          cityName: "",
          hourlyRefresh: false,
        },
        tools: {
          schedule: {
            ...DEFAULT_TOOLS_CONFIG.schedule,
            ...options?.tools?.schedule,
          },
          weather: {
            ...DEFAULT_TOOLS_CONFIG.weather,
            ...options?.tools?.weather,
          },
        },
      },
      getModel: () => null,
      getMessageContent: () => "",
      resolvePersonaPreset: () => "",
      getWeatherText: async () => "",
      renderSchedule: async () => null,
      log: () => {},
    });
    const plugin = {
      registerTool: (name: string, options: ToolRegistration) => {
        registrations.push({ name, options });
      },
    };

    return { service, plugin, registrations };
  }

  it("uses custom top-level tool description when registering tool", () => {
    const { service, plugin, registrations } = createService({
      tools: {
        schedule: {
          register: true,
          description: "自定义日程工具描述",
        },
      },
    });

    service.registerTool(plugin);

    const tool = registrations[0].options.createTool() as {
      description: string;
      name: string;
    };

    expect(registrations[0].name).toBe("daily_schedule");
    expect(tool.name).toBe("daily_schedule");
    expect(tool.description).toBe("自定义日程工具描述");
  });

  it("falls back to default tool description when top-level description is blank", () => {
    const { service, plugin, registrations } = createService({
      tools: {
        schedule: {
          register: true,
          description: "   ",
        },
      },
    });

    service.registerTool(plugin);

    const tool = registrations[0].options.createTool() as {
      description: string;
    };

    expect(tool.description).toBe(DEFAULT_TOOLS_CONFIG.schedule.description);
  });

  it("falls back to legacy tool fields when tools config is missing", () => {
    const registrations: Array<{ name: string; options: ToolRegistration }> =
      [];
    const service = createScheduleService({
      ctx: {} as Context,
      config: {
        schedule: {
          enabled: true,
          model: "",
          personaSource: "none",
          personaChatlunaPreset: "无",
          personaCustomPreset: "",
          timezone: "Asia/Shanghai",
          renderAsImage: false,
          startDelay: 1000,
          prompt: "test",
          registerTool: true,
          toolName: "legacy_schedule",
          toolDescription: "legacy schedule description",
        },
        weather: {
          enabled: false,
          cityName: "",
          hourlyRefresh: false,
        },
      } as never,
      getModel: () => null,
      getMessageContent: () => "",
      resolvePersonaPreset: () => "",
      getWeatherText: async () => "",
      renderSchedule: async () => null,
      log: () => {},
    });
    const plugin = {
      registerTool: (name: string, options: ToolRegistration) => {
        registrations.push({ name, options });
      },
    };

    const registeredName = service.registerTool(plugin);
    const tool = registrations[0].options.createTool() as {
      description: string;
      name: string;
    };

    expect(registeredName).toBe("legacy_schedule");
    expect(registrations[0].name).toBe("legacy_schedule");
    expect(tool.name).toBe("legacy_schedule");
    expect(tool.description).toBe("legacy schedule description");
  });
});
