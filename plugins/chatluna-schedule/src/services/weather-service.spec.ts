/**
 * 天气服务测试
 * 验证天气查询与结果格式化行为
 */

import { describe, expect, it, vi } from "vitest";
import type { Context } from "koishi";
import { createWeatherService } from "./weather-service";

describe("weather service", () => {
  it("returns formatted weather text", async () => {
    const get = vi.fn(async (url: string) => {
      if (url.startsWith("https://geocoding-api.open-meteo.com")) {
        return {
          results: [
            {
              name: "上海",
              latitude: 31.23,
              longitude: 121.47,
              country: "中国",
              admin1: "上海",
              timezone: "Asia/Shanghai",
            },
          ],
        };
      }

      return {
        latitude: 31.23,
        longitude: 121.47,
        timezone: "Asia/Shanghai",
        current: {
          time: "2026-03-04T09:00",
          temperature_2m: 21,
          relative_humidity_2m: 68,
          precipitation: 0,
          weather_code: 1,
          wind_speed_10m: 4,
        },
        daily: {
          time: ["2026-03-04"],
          temperature_2m_max: [24],
          temperature_2m_min: [16],
          weather_code: [1],
        },
      };
    });

    const ctx = { http: { get } } as unknown as Context;
    const service = createWeatherService({
      ctx,
      weatherConfig: {
        enabled: true,
        cityName: "上海",
        hourlyRefresh: false,
        registerTool: true,
        toolName: "get_weather",
        toolDescription: "获取当前天气信息，可返回详细文本或当前时段天气。",
      },
      log: () => {},
    });

    const text = await service.getWeatherText();
    const daily = await service.getDailyWeather();
    expect(text).toContain("上海");
    expect(daily).toContain("°C");
  });

  it("returns empty text when city is missing", async () => {
    const ctx = { http: { get: vi.fn() } } as unknown as Context;
    const service = createWeatherService({
      ctx,
      weatherConfig: {
        enabled: true,
        cityName: "",
        hourlyRefresh: false,
        registerTool: false,
        toolName: "get_weather",
        toolDescription: "获取当前天气信息，可返回详细文本或当前时段天气。",
      },
      log: () => {},
    });

    expect(await service.getDailyWeather()).toBe("");
  });
});
