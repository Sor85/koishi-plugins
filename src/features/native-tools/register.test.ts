/**
 * 原生工具注册测试
 * 覆盖协议选择与嵌套配置注册行为
 */

import { describe, expect, it, vi } from "vitest";
import { registerNativeTools, resolveOneBotProtocol } from "./register";
import type { Config } from "../../types";
import {
  DEFAULT_DELETE_MESSAGE_TOOL_DESCRIPTION,
  DEFAULT_POKE_TOOL_DESCRIPTION,
  DEFAULT_SET_GROUP_BAN_TOOL_DESCRIPTION,
  DEFAULT_SET_GROUP_CARD_TOOL_DESCRIPTION,
  DEFAULT_SET_MSG_EMOJI_TOOL_DESCRIPTION,
  DEFAULT_SET_SELF_PROFILE_TOOL_DESCRIPTION,
} from "./defaults";

function createConfig(overrides: Partial<Config> = {}): Config {
  return {
    enableNapCatProtocol: true,
    enableLlbotProtocol: false,
    poke: {
      enabled: false,
      toolName: "poke_user",
      description: DEFAULT_POKE_TOOL_DESCRIPTION,
    },
    setSelfProfile: {
      enabled: false,
      toolName: "set_self_profile",
      description: DEFAULT_SET_SELF_PROFILE_TOOL_DESCRIPTION,
    },
    setGroupCard: {
      enabled: false,
      toolName: "set_group_card",
      description: DEFAULT_SET_GROUP_CARD_TOOL_DESCRIPTION,
    },
    setGroupBan: {
      enabled: false,
      toolName: "set_group_ban",
      description: DEFAULT_SET_GROUP_BAN_TOOL_DESCRIPTION,
    },
    setMsgEmoji: {
      enabled: false,
      toolName: "set_msg_emoji",
      description: DEFAULT_SET_MSG_EMOJI_TOOL_DESCRIPTION,
    },
    deleteMessage: {
      enabled: false,
      toolName: "delete_msg",
      description: DEFAULT_DELETE_MESSAGE_TOOL_DESCRIPTION,
    },
    enablePokeXmlTool: false,
    enableEmojiXmlTool: false,
    enableDeleteXmlTool: false,
    enableBanXmlTool: false,
    referencePrompt: "",
    userInfo: { variableName: "userInfo", items: [] },
    botInfo: { variableName: "botInfo", items: [] },
    groupInfo: { variableName: "groupInfo", items: [] },
    random: { variableName: "random", min: 0, max: 100 },
    debugLogging: false,
    ...overrides,
  };
}

describe("resolveOneBotProtocol", () => {
  it("在 LLBot 开启时优先返回 llbot", () => {
    const config = createConfig({
      enableNapCatProtocol: true,
      enableLlbotProtocol: true,
    });

    expect(resolveOneBotProtocol(config)).toBe("llbot");
  });

  it("在协议都关闭时回退到 napcat", () => {
    const config = createConfig({
      enableNapCatProtocol: false,
      enableLlbotProtocol: false,
    });

    expect(resolveOneBotProtocol(config)).toBe("napcat");
  });
});

describe("registerNativeTools", () => {
  it("按嵌套配置注册启用的原生工具", () => {
    const registerTool = vi.fn();
    const config = createConfig({
      poke: {
        enabled: true,
        toolName: "custom_poke",
        description: "custom poke description",
      },
      setMsgEmoji: {
        enabled: true,
        toolName: "custom_emoji",
        description: "custom emoji description",
      },
      setGroupBan: {
        enabled: true,
        toolName: "custom_ban",
        description: "custom ban description",
      },
    });

    registerNativeTools({
      ctx: {} as never,
      config,
      plugin: { registerTool },
      protocol: "napcat",
    });

    expect(registerTool).toHaveBeenCalledTimes(3);
    expect(registerTool).toHaveBeenNthCalledWith(
      1,
      "custom_poke",
      expect.objectContaining({
        selector: expect.any(Function),
        authorization: expect.any(Function),
        createTool: expect.any(Function),
      }),
    );
    expect(registerTool).toHaveBeenNthCalledWith(
      2,
      "custom_ban",
      expect.objectContaining({
        selector: expect.any(Function),
        authorization: expect.any(Function),
        createTool: expect.any(Function),
      }),
    );
    expect(registerTool).toHaveBeenNthCalledWith(
      3,
      "custom_emoji",
      expect.objectContaining({
        selector: expect.any(Function),
        authorization: expect.any(Function),
        createTool: expect.any(Function),
      }),
    );
  });

  it("将自定义描述注入最终工具对象", () => {
    const registerTool = vi.fn();
    const config = createConfig({
      poke: {
        enabled: true,
        toolName: "custom_poke",
        description: "poke custom description",
      },
    });

    registerNativeTools({
      ctx: {} as never,
      config,
      plugin: { registerTool },
      protocol: "napcat",
    });

    const registration = registerTool.mock.calls[0][1];
    const tool = registration.createTool();

    expect(tool.description).toBe("poke custom description");
  });

  it("在工具名为空白时回退到默认名称", () => {
    const registerTool = vi.fn();
    const config = createConfig({
      poke: {
        enabled: true,
        toolName: "   ",
        description: DEFAULT_POKE_TOOL_DESCRIPTION,
      },
    });

    registerNativeTools({
      ctx: {} as never,
      config,
      plugin: { registerTool },
      protocol: "napcat",
    });

    expect(registerTool).toHaveBeenCalledTimes(1);
    expect(registerTool).toHaveBeenCalledWith(
      "poke_user",
      expect.objectContaining({
        selector: expect.any(Function),
        authorization: expect.any(Function),
        createTool: expect.any(Function),
      }),
    );
  });

  it("在描述为空白时回退到默认描述", () => {
    const registerTool = vi.fn();
    const config = createConfig({
      setMsgEmoji: {
        enabled: true,
        toolName: "set_msg_emoji",
        description: "   ",
      },
    });

    registerNativeTools({
      ctx: {} as never,
      config,
      plugin: { registerTool },
      protocol: "napcat",
    });

    const registration = registerTool.mock.calls[0][1];
    const tool = registration.createTool();

    expect(tool.description).toBe(DEFAULT_SET_MSG_EMOJI_TOOL_DESCRIPTION);
  });

  it("在禁言工具描述为空白时回退到默认描述", () => {
    const registerTool = vi.fn();
    const config = createConfig({
      setGroupBan: {
        enabled: true,
        toolName: "set_group_ban",
        description: "   ",
      },
    });

    registerNativeTools({
      ctx: {} as never,
      config,
      plugin: { registerTool },
      protocol: "napcat",
    });

    const registration = registerTool.mock.calls[0][1];
    const tool = registration.createTool();

    expect(tool.description).toBe(DEFAULT_SET_GROUP_BAN_TOOL_DESCRIPTION);
  });
  it("忽略未启用的原生工具", () => {
    const registerTool = vi.fn();

    registerNativeTools({
      ctx: {} as never,
      config: createConfig(),
      plugin: { registerTool },
      protocol: "napcat",
    });

    expect(registerTool).not.toHaveBeenCalled();
  });
});
