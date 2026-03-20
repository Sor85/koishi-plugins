/**
 * 配置 Schema 测试
 * 验证日程、天气、变量与工具默认配置值
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCHEDULE_CONFIG,
  DEFAULT_TOOLS_CONFIG,
  DEFAULT_VARIABLES_CONFIG,
  DEFAULT_WEATHER_CONFIG,
} from "../src/schema";

describe("schema defaults", () => {
  it("provides expected schedule defaults", () => {
    expect(DEFAULT_SCHEDULE_CONFIG.enabled).toBe(true);
    expect(DEFAULT_SCHEDULE_CONFIG.renderAsImage).toBe(false);
    expect(DEFAULT_SCHEDULE_CONFIG.startDelay).toBe(3000);
  });

  it("provides expected weather defaults", () => {
    expect(DEFAULT_WEATHER_CONFIG.enabled).toBe(false);
    expect(DEFAULT_WEATHER_CONFIG.hourlyRefresh).toBe(false);
    expect(DEFAULT_WEATHER_CONFIG.cityName).toBe("");
  });

  it("provides expected variable defaults", () => {
    expect(DEFAULT_VARIABLES_CONFIG.schedule).toBe("schedule");
    expect(DEFAULT_VARIABLES_CONFIG.currentSchedule).toBe("currentSchedule");
    expect(DEFAULT_VARIABLES_CONFIG.outfit).toBe("outfit");
    expect(DEFAULT_VARIABLES_CONFIG.currentOutfit).toBe("currentOutfit");
    expect(DEFAULT_VARIABLES_CONFIG.weather).toBe("weather");
  });

  it("provides expected tools defaults", () => {
    expect(DEFAULT_TOOLS_CONFIG.schedule).toEqual({
      register: false,
      name: "daily_schedule",
      description: "获取今日日程文本内容。",
    });
    expect(DEFAULT_TOOLS_CONFIG.weather).toEqual({
      register: false,
      name: "get_weather",
      description: "获取当前天气信息，可返回详细文本或当前时段天气。",
    });
  });
});
