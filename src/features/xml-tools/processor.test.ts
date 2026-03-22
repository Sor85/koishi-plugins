/**
 * XML 处理器测试
 * 覆盖动作路由、参数校验与容错行为
 */

import { describe, expect, it, vi } from "vitest";
import { createXmlProcessor } from "./processor";

describe("createXmlProcessor", () => {
  const session = { platform: "onebot", guildId: "group-1" } as any;
  const baseConfig = {
    enablePokeXmlTool: true,
    enableEmojiXmlTool: true,
    enableDeleteXmlTool: true,
    enableBanXmlTool: true,
    debugLogging: false,
  } as any;

  it("路由 ban 动作到 sendGroupBan", async () => {
    const sendGroupBan = vi.fn().mockResolvedValue("ok");
    const processor = createXmlProcessor({
      config: baseConfig,
      protocol: "napcat",
      sendGroupBan,
    });

    const handled = await processor({
      response:
        '<actions><ban id="u1" duration="600"/><ban id="u2" duration="0"/></actions>',
      session,
    });

    expect(handled).toBe(true);
    expect(sendGroupBan).toHaveBeenCalledTimes(2);
    expect(sendGroupBan).toHaveBeenNthCalledWith(1, {
      session,
      userId: "u1",
      duration: "600",
      protocol: "napcat",
      log: undefined,
    });
    expect(sendGroupBan).toHaveBeenNthCalledWith(2, {
      session,
      userId: "u2",
      duration: "0",
      protocol: "napcat",
      log: undefined,
    });
  });

  it("在同一响应中分别路由 poke、emoji、delete、ban", async () => {
    const sendPoke = vi.fn().mockResolvedValue("ok");
    const sendMsgEmoji = vi.fn().mockResolvedValue("ok");
    const sendDeleteMessage = vi.fn().mockResolvedValue("ok");
    const sendGroupBan = vi.fn().mockResolvedValue("ok");
    const processor = createXmlProcessor({
      config: baseConfig,
      protocol: "llbot",
      sendPoke,
      sendMsgEmoji,
      sendDeleteMessage,
      sendGroupBan,
    });

    const handled = await processor({
      response:
        '<actions><poke id="u1"/><emoji message_id="m1" emoji_id="66"/><delete message_id="m2"/><ban id="u2" duration="600"/></actions>',
      session,
    });

    expect(handled).toBe(true);
    expect(sendPoke).toHaveBeenCalledTimes(1);
    expect(sendMsgEmoji).toHaveBeenCalledWith({
      session,
      messageId: "m1",
      emojiId: "66",
      protocol: "llbot",
      log: undefined,
    });
    expect(sendDeleteMessage).toHaveBeenCalledWith({
      session,
      messageId: "m2",
      log: undefined,
    });
    expect(sendGroupBan).toHaveBeenCalledWith({
      session,
      userId: "u2",
      duration: "600",
      protocol: "llbot",
      log: undefined,
    });
  });

  it("缺少 session 时跳过执行并记录警告", async () => {
    const log = vi.fn();
    const sendPoke = vi.fn().mockResolvedValue("ok");
    const processor = createXmlProcessor({
      config: baseConfig,
      protocol: "napcat",
      log,
      sendPoke,
    });

    const handled = await processor({
      response: '<actions><poke id="u1"/></actions>',
      session: null,
    });

    expect(handled).toBe(false);
    expect(sendPoke).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      "warn",
      "检测到戳一戳标记但缺少会话上下文",
    );
  });

  it("过滤缺失参数的 emoji 与 delete 项", async () => {
    const sendMsgEmoji = vi.fn().mockResolvedValue("ok");
    const sendDeleteMessage = vi.fn().mockResolvedValue("ok");
    const processor = createXmlProcessor({
      config: baseConfig,
      protocol: "napcat",
      sendMsgEmoji,
      sendDeleteMessage,
    });

    const handled = await processor({
      response:
        '<actions><emoji message_id="m1" emoji_id="66"/><emoji message_id="m2"/><delete message_id=""/><delete message_id="m3"/></actions>',
      session,
    });

    expect(handled).toBe(true);
    expect(sendMsgEmoji).toHaveBeenCalledTimes(1);
    expect(sendMsgEmoji).toHaveBeenCalledWith({
      session,
      messageId: "m1",
      emojiId: "66",
      protocol: "napcat",
      log: undefined,
    });
    expect(sendDeleteMessage).toHaveBeenCalledTimes(1);
    expect(sendDeleteMessage).toHaveBeenCalledWith({
      session,
      messageId: "m3",
      log: undefined,
    });
  });

  it("动作开关关闭时返回未处理状态", async () => {
    const sendPoke = vi.fn().mockResolvedValue("ok");
    const processor = createXmlProcessor({
      config: { ...baseConfig, enablePokeXmlTool: false },
      protocol: "napcat",
      sendPoke,
    });

    const handled = await processor({
      response: '<actions><poke id="u1"/></actions>',
      session,
    });

    expect(handled).toBe(false);
    expect(sendPoke).not.toHaveBeenCalled();
  });

  it("单个动作失败时不中断同批次其他动作", async () => {
    const log = vi.fn();
    const sendPoke = vi
      .fn()
      .mockRejectedValueOnce(new Error("first failed"))
      .mockResolvedValueOnce("ok");
    const processor = createXmlProcessor({
      config: baseConfig,
      protocol: "napcat",
      log,
      sendPoke,
    });

    const handled = await processor({
      response: '<actions><poke id="u1"/><poke id="u2"/></actions>',
      session,
    });

    expect(handled).toBe(true);
    expect(sendPoke).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith(
      "warn",
      "XML 触发 poke 失败",
      expect.any(Error),
    );
  });
});
