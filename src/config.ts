/**
 * 配置归一化
 * 兼容变量与工具的新旧配置结构并提供稳定读取结果
 */

import {
  DEFAULT_TOOLS_CONFIG,
  DEFAULT_VARIABLES_CONFIG,
} from "./schema";
import type {
  Config,
  ToolsConfig,
  ToolItemConfig,
  VariablesConfig,
} from "./types";

function normalizeText(value: string | undefined, fallback: string): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function resolveToolItemConfig(
  tool: Partial<ToolItemConfig> | undefined,
  legacy: {
    registerTool?: boolean;
    toolName?: string;
    toolDescription?: string;
  },
  defaults: ToolItemConfig,
): ToolItemConfig {
  return {
    register:
      tool?.register ?? legacy.registerTool ?? defaults.register,
    name: normalizeText(tool?.name ?? legacy.toolName, defaults.name),
    description: normalizeText(
      tool?.description ?? legacy.toolDescription,
      defaults.description,
    ),
  };
}

export function resolveVariablesConfig(config: Config): VariablesConfig {
  const legacySchedule = config.schedule as Config["schedule"] & {
    variableName?: string;
    currentVariableName?: string;
    outfitVariableName?: string;
    currentOutfitVariableName?: string;
  };
  const legacyWeather = config.weather as Config["weather"] & {
    variableName?: string;
  };

  return {
    schedule:
      config.variables?.schedule ||
      legacySchedule.variableName ||
      DEFAULT_VARIABLES_CONFIG.schedule,
    currentSchedule:
      config.variables?.currentSchedule ||
      legacySchedule.currentVariableName ||
      DEFAULT_VARIABLES_CONFIG.currentSchedule,
    outfit:
      config.variables?.outfit ||
      legacySchedule.outfitVariableName ||
      DEFAULT_VARIABLES_CONFIG.outfit,
    currentOutfit:
      config.variables?.currentOutfit ||
      legacySchedule.currentOutfitVariableName ||
      DEFAULT_VARIABLES_CONFIG.currentOutfit,
    weather:
      config.variables?.weather ||
      legacyWeather.variableName ||
      DEFAULT_VARIABLES_CONFIG.weather,
  };
}

export function resolveToolsConfig(config: Config): ToolsConfig {
  return {
    schedule: resolveToolItemConfig(
      config.tools?.schedule,
      config.schedule,
      DEFAULT_TOOLS_CONFIG.schedule,
    ),
    weather: resolveToolItemConfig(
      config.tools?.weather,
      config.weather,
      DEFAULT_TOOLS_CONFIG.weather,
    ),
  };
}
