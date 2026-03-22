/**
 * 群成员禁言工具测试
 * 覆盖参数校验与 OneBot 调用行为
 */

import { describe, expect, it, vi } from "vitest";
import {
  createSetGroupBanTool,
  sendGroupBan,
} from "./set-group-ban";

describe("sendGroupBan", () => {
  it("调用 set_group_ban 接口禁言群成员", async () => {
    const request = vi.fn().mockResolvedValue(undefined);
    const result = await sendGroupBan({
      session: {
        platform: "onebot",
        guildId: "group-1",
        bot: { internal: { _request: request } },
      } as any,
      userId: "user-1",
      duration: "600",
      protocol: "napcat",
    });

    expect(request).toHaveBeenCalledWith("set_group_ban", {
      group_id: "group-1",
      user_id: "user-1",
      duration: 600,
    });
    expect(result).toContain("禁言用户 user-1 600 秒");
  });

  it("duration 为 0 时返回解除禁言结果", async () => {
    const request = vi.fn().mockResolvedValue(undefined);
    const result = await sendGroupBan({
      session: {
        platform: "onebot",
        guildId: "group-1",
        bot: { internal: { _request: request } },
      } as any,
      userId: "user-1",
      duration: 0,
      protocol: "llbot",
    });

    expect(request).toHaveBeenCalledWith("set_group_ban", {
      group_id: "group-1",
      user_id: "user-1",
      duration: 0,
    });
    expect(result).toContain("解除群 group-1 中用户 user-1 的禁言");
  });

  it("在缺少群号时返回错误", async () => {
    const result = await sendGroupBan({
      session: {
        platform: "onebot",
        bot: { internal: { _request: vi.fn() } },
      } as any,
      userId: "user-1",
      duration: 60,
      protocol: "napcat",
    });

    expect(result).toBe(
      "Missing groupId. Provide groupId explicitly or run inside a group session.",
    );
  });

  it("在 duration 非法时返回错误", async () => {
    const result = await sendGroupBan({
      session: {
        platform: "onebot",
        guildId: "group-1",
        bot: { internal: { _request: vi.fn() } },
      } as any,
      userId: "user-1",
      duration: "-1",
      protocol: "napcat",
    });

    expect(result).toBe("duration must be a non-negative integer in seconds.");
  });

  it("在没有 _request 时回退到 setGroupBan", async () => {
    const setGroupBan = vi.fn().mockResolvedValue(undefined);
    const result = await sendGroupBan({
      session: {
        platform: "onebot",
        guildId: "group-1",
        bot: { internal: { setGroupBan } },
      } as any,
      userId: "user-1",
      duration: 120,
      protocol: "llbot",
    });

    expect(setGroupBan).toHaveBeenCalledWith({
      group_id: "group-1",
      user_id: "user-1",
      duration: 120,
    });
    expect(result).toContain("禁言用户 user-1 120 秒");
  });
});

describe("createSetGroupBanTool", () => {
  it("创建默认禁言工具", async () => {
    const tool = createSetGroupBanTool({
      toolName: "set_group_ban",
      description: "desc",
      protocol: "napcat",
    });

    expect(tool.name).toBe("set_group_ban");
    expect(tool.description).toBe("desc");

    const result = await tool._call(
      { userId: "user-1", duration: 60 },
      undefined,
      {
        configurable: {
          session: {
            platform: "onebot",
            guildId: "group-1",
            bot: { internal: { _request: vi.fn().mockResolvedValue(undefined) } },
          },
        },
      },
    );

    expect(result).toContain("禁言用户 user-1 60 秒");
  });
});
