/**
 * ChatLuna 集成入口
 * 统一注册日程与天气变量及工具
 */

import { resolveToolsConfig, resolveVariablesConfig } from "../config";
import { StructuredTool } from "@langchain/core/tools";
import type { Context, Session } from "koishi";
import { z } from "zod";
import type {
  ChatLunaPlugin,
  Config,
  LogFn,
  ScheduleService,
  WeatherService,
} from "../types";

interface RegisterIntegrationDeps {
  ctx: Context;
  plugin: ChatLunaPlugin;
  config: Config;
  scheduleService: ScheduleService;
  weatherService: WeatherService;
  log: LogFn;
}

export interface IntegrationResult {
  variableNames: string[];
  toolNames: string[];
}

export function registerChatLunaIntegrations(
  deps: RegisterIntegrationDeps,
): IntegrationResult {
  const { ctx, plugin, config, scheduleService, weatherService, log } = deps;
  const variableConfig = resolveVariablesConfig(config);
  const toolsConfig = resolveToolsConfig(config);
  const variableNames: string[] = [];
  const toolNames: string[] = [];

  if (config.schedule.enabled !== false) {
    const scheduleVars = scheduleService.registerVariables();
    if (scheduleVars.length) {
      variableNames.push(...scheduleVars);
      log("info", `日程变量已注册: ${scheduleVars.join(", ")}`);
    }

    const scheduleTool = scheduleService.registerTool(plugin);
    if (scheduleTool) {
      toolNames.push(scheduleTool);
      log("info", `日程工具已注册: ${scheduleTool}`);
    }
  }

  if (config.weather.enabled) {
    const weatherVariableName = (variableConfig.weather || "weather").trim();
    const promptRenderer = (
      ctx as unknown as {
        chatluna?: {
          promptRenderer?: {
            registerFunctionProvider?: Function;
          };
        };
      }
    ).chatluna?.promptRenderer;

    if (weatherVariableName && promptRenderer?.registerFunctionProvider) {
      promptRenderer.registerFunctionProvider(
        weatherVariableName,
        async (
          _args: string[],
          _variables: Record<string, unknown>,
          configurable: { session?: Session },
        ) => {
          const cityName = weatherService.getEffectiveCityName(
            configurable?.session,
          );
          return weatherService.getHourlyWeather({
            city: cityName || undefined,
          });
        },
      );
      variableNames.push(weatherVariableName);
      log("info", `天气变量已注册: ${weatherVariableName}`);
    }

    if (toolsConfig.weather.register) {
      const weatherToolName = toolsConfig.weather.name;
      const weatherToolDescription = toolsConfig.weather.description;
      plugin.registerTool(weatherToolName, {
        selector: () => true,
        createTool: () =>
          // @ts-expect-error zod 和 StructuredTool 组合会触发推导深度限制
          new (class extends StructuredTool {
            name = weatherToolName;
            description = weatherToolDescription;
            schema = z.object({
              mode: z
                .enum(["text", "hourly"])
                .optional()
                .describe("text: 天气描述；hourly: 当前时段天气"),
              city: z
                .string()
                .trim()
                .min(1)
                .describe("必填，指定查询的城市名称（如：上海、长沙）"),
            });

            async _call(input: { mode?: "text" | "hourly"; city: string }) {
              const mode = input?.mode || "text";
              const city = input.city.trim();
              if (!city) return "缺少城市名称。";
              if (mode === "hourly")
                return weatherService.getHourlyWeather({ city });
              return weatherService.getWeatherText({ city });
            }
          })(),
      });
      toolNames.push(weatherToolName);
      log("info", `天气工具已注册: ${weatherToolName}`);
    }
  }

  return { variableNames, toolNames };
}
