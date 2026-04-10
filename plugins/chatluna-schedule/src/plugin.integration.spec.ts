/**
 * 集成注册测试
 * 验证 ChatLuna 变量与工具注册流程
 */

import { describe, expect, it, vi } from "vitest";
import type { Context } from "koishi";
import { DEFAULT_TOOLS_CONFIG } from "./schema";
import { registerChatLunaIntegrations } from "./integrations/chatluna";
import type { ToolRegistration } from "./types";

const TOOL_DEFAULT_AVAILABILITY = {
  enabled: true,
  main: true,
  chatluna: true,
  characterScope: "all",
} as const;

describe("chatluna integrations", () => {
  it("registers weather variable and tool from top-level tools config", () => {
    const providers: string[] = [];
    const registrations: Array<{ name: string; options: ToolRegistration }> = [];

    const ctx = {
      chatluna: {
        promptRenderer: {
          registerFunctionProvider: (name: string) => {
            providers.push(name);
            return () => {};
          },
        },
      },
    } as unknown as Context;

    const plugin = {
      registerTool: (name: string, options: ToolRegistration) => {
        registrations.push({ name, options });
      },
    };

    const result = registerChatLunaIntegrations({
      ctx,
      plugin,
      config: {
        schedule: {
          enabled: true,
          model: "",
          personaSource: "none",
          personaChatlunaPreset: "无",
          personaCustomPreset: "",
          timezone: "Asia/Shanghai",
          prompt: "test",
          renderAsImage: false,
          startDelay: 1000,
        },
        weather: {
          enabled: true,
          cityName: "上海",
          hourlyRefresh: false,
        },
        variables: {
          schedule: "schedule",
          currentSchedule: "currentSchedule",
          outfit: "outfit",
          currentOutfit: "currentOutfit",
          weather: "weather",
        },
        tools: {
          schedule: {
            register: true,
            name: "daily_schedule",
            description: "获取今日日程文本内容。",
          },
          weather: {
            register: true,
            name: "get_weather",
            description: "自定义天气工具描述",
          },
        },
      } as never,
      scheduleService: {
        registerVariables: vi.fn(() => [
          "schedule",
          "currentSchedule",
          "outfit",
          "currentOutfit",
        ]),
        registerTool: vi.fn(() => "daily_schedule"),
      } as never,
      weatherService: {
        getHourlyWeather: vi.fn(async () => "晴，21°C"),
        getWeatherText: vi.fn(async () => "天气文本"),
      } as never,
      log: () => {},
    });

    const weatherTool = registrations[0].options.createTool() as {
      description: string;
      name: string;
    };

    expect(result.variableNames).toContain("weather");
    expect(result.toolNames).toContain("get_weather");
    expect(providers).toContain("weather");
    expect(registrations[0].name).toBe("get_weather");
    expect(registrations[0].options.description).toBe("自定义天气工具描述");
    expect(registrations[0].options.meta).toEqual(
      expect.objectContaining({
        group: "weather",
        tags: ["weather"],
        defaultAvailability: TOOL_DEFAULT_AVAILABILITY,
      }),
    );
    expect(weatherTool.name).toBe("get_weather");
    expect(weatherTool.description).toBe("自定义天气工具描述");
  });

  it("falls back to default weather tool description when blank", () => {
    const registrations: Array<{ name: string; options: ToolRegistration }> = [];

    registerChatLunaIntegrations({
      ctx: {
        chatluna: {
          promptRenderer: {
            registerFunctionProvider: vi.fn(() => () => {}),
          },
        },
      } as unknown as Context,
      plugin: {
        registerTool: (name: string, options: ToolRegistration) => {
          registrations.push({ name, options });
        },
      },
      config: {
        schedule: {
          enabled: false,
          model: "",
          personaSource: "none",
          personaChatlunaPreset: "无",
          personaCustomPreset: "",
          timezone: "Asia/Shanghai",
          prompt: "test",
          renderAsImage: false,
          startDelay: 1000,
        },
        weather: {
          enabled: true,
          cityName: "上海",
          hourlyRefresh: false,
        },
        tools: {
          schedule: DEFAULT_TOOLS_CONFIG.schedule,
          weather: {
            register: true,
            name: "get_weather",
            description: "   ",
          },
        },
      } as never,
      scheduleService: {
        registerVariables: vi.fn(() => []),
        registerTool: vi.fn(() => null),
      } as never,
      weatherService: {
        getHourlyWeather: vi.fn(async () => "晴，21°C"),
        getWeatherText: vi.fn(async () => "天气文本"),
        getEffectiveCityName: vi.fn(() => "上海"),
      } as never,
      log: () => {},
    });

    const weatherTool = registrations[0].options.createTool() as {
      description: string;
    };

    expect(weatherTool.description).toBe(
      DEFAULT_TOOLS_CONFIG.weather.description,
    );
  });

  it("falls back to legacy weather tool fields when tools are missing", () => {
    const providers: string[] = [];
    const registrations: Array<{ name: string; options: ToolRegistration }> = [];

    registerChatLunaIntegrations({
      ctx: {
        chatluna: {
          promptRenderer: {
            registerFunctionProvider: (name: string) => {
              providers.push(name);
              return () => {};
            },
          },
        },
      } as unknown as Context,
      plugin: {
        registerTool: (name: string, options: ToolRegistration) => {
          registrations.push({ name, options });
        },
      } as never,
      config: {
        schedule: {
          enabled: false,
          timezone: "Asia/Shanghai",
          prompt: "test",
          renderAsImage: false,
          startDelay: 1000,
        },
        weather: {
          enabled: true,
          cityName: "上海",
          hourlyRefresh: false,
          registerTool: true,
          toolName: "legacy_weather",
          toolDescription: "legacy weather description",
          variableName: "legacyWeather",
        },
      } as never,
      scheduleService: {
        registerVariables: vi.fn(() => []),
        registerTool: vi.fn(() => null),
      } as never,
      weatherService: {
        getHourlyWeather: vi.fn(async () => "晴，21°C"),
        getWeatherText: vi.fn(async () => "天气文本"),
        getEffectiveCityName: vi.fn(() => "上海"),
      } as never,
      log: () => {},
    });

    const weatherTool = registrations[0].options.createTool() as {
      description: string;
      name: string;
    };

    expect(providers).toContain("legacyWeather");
    expect(registrations[0].name).toBe("legacy_weather");
    expect(registrations[0].options.description).toBe(
      "legacy weather description",
    );
    expect(registrations[0].options.meta).toEqual(
      expect.objectContaining({
        group: "weather",
        tags: ["weather"],
        defaultAvailability: TOOL_DEFAULT_AVAILABILITY,
      }),
    );
    expect(weatherTool.name).toBe("legacy_weather");
    expect(weatherTool.description).toBe("legacy weather description");
  });
});
