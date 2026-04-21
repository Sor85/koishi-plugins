/**
 * 群禁言列表变量测试
 * 覆盖字段适配、超时与回退策略、缓存行为
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createGroupShutListProvider } from "./group-shut-list";
import type { Config } from "../../../types";

function createConfig(overrides: Partial<Config> = {}): Config {
  return {
    enableNapCatProtocol: true,
    enableLlbotProtocol: false,
    poke: {
      enabled: false,
      toolName: "poke_user",
      description: "",
    },
    setSelfProfile: {
      enabled: false,
      toolName: "set_self_profile",
      description: "",
    },
    setGroupCard: {
      enabled: false,
      toolName: "set_group_card",
      description: "",
    },
    setGroupBan: {
      enabled: false,
      toolName: "set_group_ban",
      description: "",
    },
    setMsgEmoji: {
      enabled: false,
      toolName: "set_msg_emoji",
      description: "",
    },
    deleteMessage: {
      enabled: false,
      toolName: "delete_msg",
      description: "",
    },
    injectXmlToolAsReplyTool: false,
    enablePokeXmlTool: false,
    enableEmojiXmlTool: false,
    enableDeleteXmlTool: false,
    enableBanXmlTool: false,
    referencePrompt: "",
    userInfo: { variableName: "userInfo", items: [] },
    botInfo: { variableName: "botInfo", items: [] },
    groupInfo: { variableName: "groupInfo", items: [] },
    groupShutList: { variableName: "groupShutList" },
    random: { variableName: "random", min: 0, max: 100 },
    debugLogging: false,
    ...overrides,
  };
}

function createSession(
  request: ReturnType<typeof vi.fn>,
  overrides: Record<string, unknown> = {},
) {
  return {
    platform: "onebot",
    guildId: "123456",
    bot: { internal: { _request: request } },
    ...overrides,
  } as any;
}

describe("createGroupShutListProvider", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("在 NapCat 返回禁言列表时输出 QQ号、群昵称与格式化后的禁言截至时间", async () => {
    const timestamp = Math.floor(
      new Date(2026, 2, 22, 18, 30).getTime() / 1000,
    );
    const request = vi.fn().mockResolvedValue({
      data: [
        {
          uin: "10001",
          cardName: "测试名片",
          shutUpTime: timestamp,
        },
      ],
    });
    const provider = createGroupShutListProvider({ config: createConfig() });

    const result = await provider({}, {}, { session: createSession(request) });

    expect(request).toHaveBeenCalledWith("get_group_shut_list", {
      group_id: 123456,
    });
    expect(result).toBe(
      "id：10001，name：测试名片，禁言截至：2026-03-22 18:30",
    );
  });

  it("在 LLBot 返回禁言列表时兼容字段差异并输出统一格式", async () => {
    const timestamp = Math.floor(
      new Date(2026, 2, 22, 21, 45).getTime() / 1000,
    );
    const request = vi.fn().mockResolvedValue({
      data: [
        {
          user_id: "10002",
          nickname: "LL 昵称",
          shut_up_time: timestamp,
        },
      ],
    });
    const provider = createGroupShutListProvider({
      config: createConfig({
        enableNapCatProtocol: false,
        enableLlbotProtocol: true,
      }),
    });

    const result = await provider({}, {}, { session: createSession(request) });

    expect(request).toHaveBeenCalledWith("get_group_shut_list", {
      group_id: "123456",
    });
    expect(result).toBe("id：10002，name：LL 昵称，禁言截至：2026-03-22 21:45");
  });

  it("在 NapCat 群昵称字段缺失时回退到 remark 与 nick", async () => {
    const timestamp = Math.floor(new Date(2026, 2, 22, 19, 0).getTime() / 1000);
    const request = vi.fn().mockResolvedValue({
      data: [
        {
          uin: "10003",
          remark: "备注名",
          nick: "原昵称",
          shutUpTime: timestamp,
        },
      ],
    });
    const provider = createGroupShutListProvider({ config: createConfig() });

    const result = await provider({}, {}, { session: createSession(request) });

    expect(result).toBe("id：10003，name：备注名，禁言截至：2026-03-22 19:00");
  });

  it("在禁言截至时间为毫秒时间戳时仍格式化为 YYYY-MM-DD HH:mm", async () => {
    const timestamp = new Date(2026, 2, 22, 20, 15).getTime();
    const request = vi.fn().mockResolvedValue({
      data: [
        {
          uin: "10004",
          cardName: "毫秒时间",
          shutUpTime: timestamp,
        },
      ],
    });
    const provider = createGroupShutListProvider({ config: createConfig() });

    const result = await provider({}, {}, { session: createSession(request) });

    expect(result).toBe(
      "id：10004，name：毫秒时间，禁言截至：2026-03-22 20:15",
    );
  });

  it("在禁言时间为 0 时不显示 1970 而是回退为未知", async () => {
    const request = vi.fn().mockResolvedValue({
      data: [
        {
          user_id: "10005",
          nickname: "未知时间",
          shut_up_time: 0,
        },
      ],
    });
    const provider = createGroupShutListProvider({
      config: createConfig({
        enableNapCatProtocol: false,
        enableLlbotProtocol: true,
      }),
    });

    const result = await provider({}, {}, { session: createSession(request) });

    expect(result).toBe("id：10005，name：未知时间，禁言截至：未知");
  });

  it("在禁言列表为空时返回空结果提示", async () => {
    const request = vi.fn().mockResolvedValue({ data: [] });
    const provider = createGroupShutListProvider({ config: createConfig() });

    const result = await provider({}, {}, { session: createSession(request) });

    expect(result).toBe("当前群暂无禁言成员。");
  });

  it("在成功响应 data 为 null 时归一化为空列表", async () => {
    const request = vi.fn().mockResolvedValue({
      status: "ok",
      retcode: 0,
      data: null,
    });
    const provider = createGroupShutListProvider({ config: createConfig() });

    const result = await provider({}, {}, { session: createSession(request) });

    expect(result).toBe("当前群暂无禁言成员。");
  });

  it("在业务失败且非类型错误时不走 fallback", async () => {
    const request = vi.fn().mockResolvedValue({
      status: "failed",
      retcode: 100,
      message: "service unavailable",
    });
    const provider = createGroupShutListProvider({ config: createConfig() });

    const result = await provider({}, {}, { session: createSession(request) });

    expect(result).toBe("获取群禁言列表失败。");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("在业务失败且类型错误时走 fallback", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        status: "failed",
        retcode: 100,
        message: "group_id type invalid",
      })
      .mockResolvedValueOnce({ data: [] });
    const provider = createGroupShutListProvider({ config: createConfig() });

    const result = await provider({}, {}, { session: createSession(request) });

    expect(result).toBe("当前群暂无禁言成员。");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("在请求超时时不走 fallback", async () => {
    vi.useFakeTimers();
    const request = vi
      .fn()
      .mockImplementation(() => new Promise(() => undefined));
    const provider = createGroupShutListProvider({ config: createConfig() });

    const pending = provider({}, {}, { session: createSession(request) });
    await vi.advanceTimersByTimeAsync(200);

    await expect(pending).resolves.toBe("当前群暂无禁言成员。");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("在抛出参数类型异常时回退到另一种 group_id 类型", async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error("string required"))
      .mockResolvedValueOnce({
        data: [
          {
            uin: "10006",
            cardName: "回退成功",
            shutUpTime: Math.floor(
              new Date(2026, 2, 22, 22, 0).getTime() / 1000,
            ),
          },
        ],
      });
    const provider = createGroupShutListProvider({ config: createConfig() });

    const result = await provider({}, {}, { session: createSession(request) });

    expect(request).toHaveBeenNthCalledWith(1, "get_group_shut_list", {
      group_id: 123456,
    });
    expect(request).toHaveBeenNthCalledWith(2, "get_group_shut_list", {
      group_id: "123456",
    });
    expect(result).toBe(
      "id：10006，name：回退成功，禁言截至：2026-03-22 22:00",
    );
  });

  it("在抛出非类型异常时不走 fallback", async () => {
    const request = vi.fn().mockRejectedValue(new Error("boom"));
    const provider = createGroupShutListProvider({ config: createConfig() });

    const result = await provider({}, {}, { session: createSession(request) });

    expect(result).toBe("获取群禁言列表失败。");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("在 TTL 内重复调用时仅请求一次", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 22, 18, 0, 0));

    const request = vi.fn().mockResolvedValue({
      data: [
        {
          uin: "10007",
          cardName: "缓存命中",
          shutUpTime: Math.floor(
            new Date(2026, 2, 22, 23, 0).getTime() / 1000,
          ),
        },
      ],
    });
    const provider = createGroupShutListProvider({ config: createConfig() });
    const session = createSession(request);

    const first = await provider({}, {}, { session });
    const second = await provider({}, {}, { session });

    expect(first).toBe("id：10007，name：缓存命中，禁言截至：2026-03-22 23:00");
    expect(second).toBe("id：10007，name：缓存命中，禁言截至：2026-03-22 23:00");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("在 TTL 过期后会重新请求", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 22, 18, 0, 0));

    const request = vi
      .fn()
      .mockResolvedValueOnce({
        data: [
          {
            uin: "10008",
            cardName: "首次结果",
            shutUpTime: Math.floor(
              new Date(2026, 2, 22, 23, 10).getTime() / 1000,
            ),
          },
        ],
      })
      .mockResolvedValueOnce({
        data: [
          {
            uin: "10008",
            cardName: "过期后结果",
            shutUpTime: Math.floor(
              new Date(2026, 2, 22, 23, 20).getTime() / 1000,
            ),
          },
        ],
      });
    const provider = createGroupShutListProvider({ config: createConfig() });
    const session = createSession(request);

    const first = await provider({}, {}, { session });
    vi.setSystemTime(new Date(2026, 2, 22, 18, 0, 16));
    const second = await provider({}, {}, { session });

    expect(first).toBe("id：10008，name：首次结果，禁言截至：2026-03-22 23:10");
    expect(second).toBe("id：10008，name：过期后结果，禁言截至：2026-03-22 23:20");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("在非群聊上下文时返回空字符串", async () => {
    const provider = createGroupShutListProvider({ config: createConfig() });

    const result = await provider(
      {},
      {},
      {
        session: createSession(vi.fn(), { guildId: "" }),
      },
    );

    expect(result).toBe("");
  });

  it("在非 OneBot 平台时返回固定提示", async () => {
    const provider = createGroupShutListProvider({ config: createConfig() });

    const result = await provider(
      {},
      {},
      {
        session: createSession(vi.fn(), { platform: "discord" }),
      },
    );

    expect(result).toBe("当前平台暂不支持查询群禁言列表。");
  });

  it("在缺少 OneBot internal 接口时返回失败提示", async () => {
    const log = vi.fn();
    const provider = createGroupShutListProvider({
      config: createConfig(),
      log,
    });

    const result = await provider(
      {},
      {},
      {
        session: {
          platform: "onebot",
          guildId: "123456",
          bot: {},
        } as any,
      },
    );

    expect(result).toBe("获取群禁言列表失败。");
    expect(log).toHaveBeenCalledWith(
      "debug",
      "群禁言列表变量解析失败",
      expect.any(Error),
    );
  });
});
