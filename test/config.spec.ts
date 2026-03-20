/**
 * 配置归一化测试
 * 验证变量与工具在新旧配置结构下的解析优先级
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_TOOLS_CONFIG } from "../src/schema";
import { resolveToolsConfig, resolveVariablesConfig } from "../src/config";

describe("resolveVariablesConfig", () => {
  it("uses new variables config when present", () => {
    const result = resolveVariablesConfig({
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
        schedule: "todaySchedule",
        currentSchedule: "nowSchedule",
        outfit: "todayOutfit",
        currentOutfit: "nowOutfit",
        weather: "todayWeather",
      },
    });

    expect(result).toEqual({
      schedule: "todaySchedule",
      currentSchedule: "nowSchedule",
      outfit: "todayOutfit",
      currentOutfit: "nowOutfit",
      weather: "todayWeather",
    });
  });

  it("falls back to legacy config fields when variables are missing", () => {
    const result = resolveVariablesConfig({
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
        variableName: "legacySchedule",
        currentVariableName: "legacyCurrentSchedule",
        outfitVariableName: "legacyOutfit",
        currentOutfitVariableName: "legacyCurrentOutfit",
      },
      weather: {
        enabled: true,
        cityName: "上海",
        hourlyRefresh: false,
        variableName: "legacyWeather",
      },
    } as never);

    expect(result).toEqual({
      schedule: "legacySchedule",
      currentSchedule: "legacyCurrentSchedule",
      outfit: "legacyOutfit",
      currentOutfit: "legacyCurrentOutfit",
      weather: "legacyWeather",
    });
  });
});

describe("resolveToolsConfig", () => {
  it("uses new tools config when present", () => {
    const result = resolveToolsConfig({
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
      tools: {
        schedule: {
          register: false,
          name: "custom_schedule",
          description: "自定义日程工具描述",
        },
        weather: {
          register: true,
          name: "custom_weather",
          description: "自定义天气工具描述",
        },
      },
    });

    expect(result).toEqual({
      schedule: {
        register: false,
        name: "custom_schedule",
        description: "自定义日程工具描述",
      },
      weather: {
        register: true,
        name: "custom_weather",
        description: "自定义天气工具描述",
      },
    });
  });

  it("falls back to legacy tool fields when tools are missing", () => {
    const result = resolveToolsConfig({
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
        registerTool: false,
        toolName: "legacy_schedule",
        toolDescription: "legacy schedule description",
      },
      weather: {
        enabled: true,
        cityName: "上海",
        hourlyRefresh: false,
        registerTool: true,
        toolName: "legacy_weather",
        toolDescription: "legacy weather description",
      },
    });

    expect(result).toEqual({
      schedule: {
        register: false,
        name: "legacy_schedule",
        description: "legacy schedule description",
      },
      weather: {
        register: true,
        name: "legacy_weather",
        description: "legacy weather description",
      },
    });
  });

  it("falls back to defaults when tool names or descriptions are blank", () => {
    const result = resolveToolsConfig({
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
      tools: {
        schedule: {
          register: false,
          name: "   ",
          description: "   ",
        },
        weather: {
          register: false,
          name: "   ",
          description: "   ",
        },
      },
    });

    expect(result).toEqual(DEFAULT_TOOLS_CONFIG);
  });
});
