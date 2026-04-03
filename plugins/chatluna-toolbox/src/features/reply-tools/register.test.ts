import { describe, expect, it, vi } from "vitest";
import type { Config } from "../../types";
import {
  hasReplyToolsEnabled,
  registerCharacterReplyTools,
} from "./register";

function createConfig(overrides: Partial<Config> = {}): Config {
  return {
    injectXmlToolAsReplyTool: false,
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

describe("hasReplyToolsEnabled", () => {
  it("在任一回复参数开关开启时返回 true", () => {
    expect(
      hasReplyToolsEnabled(
        createConfig({
          injectXmlToolAsReplyTool: true,
          enablePokeXmlTool: true,
        }),
      ),
    ).toBe(true);
  });
});

describe("registerCharacterReplyTools", () => {
  it("按固定顺序注册已启用的回复参数字段", () => {
    const fields: { name: string }[] = [];
    const registerReplyToolField = vi.fn((field) => {
      fields.push(field);
      return vi.fn();
    });

    registerCharacterReplyTools({
      ctx: {
        chatluna_character: { registerReplyToolField },
      } as never,
      config: createConfig({
        injectXmlToolAsReplyTool: true,
        enablePokeXmlTool: true,
        enableBanXmlTool: true,
        enableEmojiXmlTool: true,
      }),
      protocol: "napcat",
    });

    expect(registerReplyToolField).toHaveBeenCalledTimes(3);
    expect(fields.map((field) => field.name)).toEqual([
      "toolbox_poke",
      "toolbox_set_group_ban",
      "toolbox_set_msg_emoji",
    ]);
  });

  it("为已注册字段提供可渲染的 XML 动作片段", () => {
    const fields: Array<{
      name: string;
      render?: (
        ctx: unknown,
        session: unknown,
        value: unknown,
        config: unknown,
      ) => string | string[] | undefined;
    }> = [];
    const registerReplyToolField = vi.fn((field) => {
      fields.push(field);
      return vi.fn();
    });

    registerCharacterReplyTools({
      ctx: {
        chatluna_character: { registerReplyToolField },
      } as never,
      config: createConfig({
        injectXmlToolAsReplyTool: true,
        enablePokeXmlTool: true,
        enableBanXmlTool: true,
        enableEmojiXmlTool: true,
        enableDeleteXmlTool: true,
      }),
      protocol: "napcat",
    });

    const pokeField = fields.find((field) => field.name === "toolbox_poke");
    const banField = fields.find(
      (field) => field.name === "toolbox_set_group_ban",
    );
    const emojiField = fields.find(
      (field) => field.name === "toolbox_set_msg_emoji",
    );
    const deleteField = fields.find(
      (field) => field.name === "toolbox_delete_message",
    );

    expect(
      pokeField?.render?.(
        {},
        {},
        [{ user_id: "123", group_id: "456" }],
        {},
      ),
    ).toEqual(['<poke id="123" group_id="456" />']);
    expect(
      banField?.render?.(
        {},
        {},
        [{ user_id: "123", duration: 60, group_id: "456" }],
        {},
      ),
    ).toEqual(['<ban id="123" duration="60" group_id="456" />']);
    expect(
      emojiField?.render?.(
        {},
        {},
        [{ message_id: "789", emoji_id: "66" }],
        {},
      ),
    ).toEqual(['<emoji message_id="789" emoji_id="66" />']);
    expect(
      deleteField?.render?.({}, {}, [{ message_id: "9527" }], {}),
    ).toEqual(['<delete message_id="9527" />']);
  });

  it("在缺少 chatluna_character 服务时安全跳过", () => {
    expect(() =>
      registerCharacterReplyTools({
        ctx: {} as never,
        config: createConfig({
          injectXmlToolAsReplyTool: true,
          enablePokeXmlTool: true,
        }),
        protocol: "napcat",
      }),
    ).not.toThrow();
  });
});
