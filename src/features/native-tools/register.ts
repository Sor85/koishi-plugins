/**
 * 原生工具注册
 * 负责将 OneBot 工具注册到 ChatLuna
 */

import type { Session } from "koishi";
import type { Config, LogFn, OneBotProtocol } from "../../types";
import {
  DEFAULT_DELETE_MESSAGE_TOOL_DESCRIPTION,
  DEFAULT_POKE_TOOL_DESCRIPTION,
  DEFAULT_SET_GROUP_CARD_TOOL_DESCRIPTION,
  DEFAULT_SET_MSG_EMOJI_TOOL_DESCRIPTION,
  DEFAULT_SET_SELF_PROFILE_TOOL_DESCRIPTION,
} from "./defaults";
import { createDeleteMessageTool } from "./tools/delete-msg";
import { createPokeTool } from "./tools/poke";
import { createSetGroupCardTool } from "./tools/set-group-card";
import { createSetMsgEmojiTool } from "./tools/set-msg-emoji";
import { createSetProfileTool } from "./tools/profile";

export interface NativeToolRegistration {
  selector: () => boolean;
  authorization: (session: Session) => boolean;
  createTool: () => unknown;
}

export interface RegisterNativeToolsDeps {
  ctx: import("koishi").Context;
  config: Config;
  plugin: {
    registerTool: (name: string, tool: NativeToolRegistration) => void;
  };
  protocol: OneBotProtocol;
  log?: LogFn;
}

function resolveToolName(value: string, fallback: string): string {
  const trimmedValue = value.trim();
  return trimmedValue || fallback;
}

function resolveToolDescription(value: string, fallback: string): string {
  const trimmedValue = value.trim();
  return trimmedValue || fallback;
}

export function resolveOneBotProtocol(
  config: Config,
  log?: LogFn,
): OneBotProtocol {
  if (config.enableNapCatProtocol && config.enableLlbotProtocol) {
    log?.("warn", "NapCat 与 LLBot 协议同时启用，将优先使用 LLBot。");
    return "llbot";
  }
  if (config.enableLlbotProtocol) return "llbot";
  if (config.enableNapCatProtocol) return "napcat";
  log?.("warn", "未启用 OneBot 协议选项，默认使用 NapCat。");
  return "napcat";
}

export function registerNativeTools(deps: RegisterNativeToolsDeps): void {
  const { ctx, config, plugin, protocol, log } = deps;

  if (config.poke.enabled) {
    const toolName = resolveToolName(config.poke.toolName, "poke_user");
    const description = resolveToolDescription(
      config.poke.description,
      DEFAULT_POKE_TOOL_DESCRIPTION,
    );
    plugin.registerTool(toolName, {
      selector: () => true,
      authorization: (session: Session) => session?.platform === "onebot",
      createTool: () =>
        createPokeTool({ ctx, toolName, description, log, protocol }),
    });
    log?.("info", `戳一戳工具已注册: ${toolName}`);
  }

  if (config.setSelfProfile.enabled) {
    const toolName = resolveToolName(
      config.setSelfProfile.toolName,
      "set_self_profile",
    );
    const description = resolveToolDescription(
      config.setSelfProfile.description,
      DEFAULT_SET_SELF_PROFILE_TOOL_DESCRIPTION,
    );
    plugin.registerTool(toolName, {
      selector: () => true,
      authorization: (session: Session) => session?.platform === "onebot",
      createTool: () =>
        createSetProfileTool({ ctx, toolName, description, log, protocol }),
    });
    log?.("info", `设置资料工具已注册: ${toolName}`);
  }

  if (config.setGroupCard.enabled) {
    const toolName = resolveToolName(
      config.setGroupCard.toolName,
      "set_group_card",
    );
    const description = resolveToolDescription(
      config.setGroupCard.description,
      DEFAULT_SET_GROUP_CARD_TOOL_DESCRIPTION,
    );
    plugin.registerTool(toolName, {
      selector: () => true,
      authorization: (session: Session) => session?.platform === "onebot",
      createTool: () =>
        createSetGroupCardTool({ ctx, toolName, description, log }),
    });
    log?.("info", `群昵称工具已注册: ${toolName}`);
  }

  if (config.setMsgEmoji.enabled) {
    const toolName = resolveToolName(
      config.setMsgEmoji.toolName,
      "set_msg_emoji",
    );
    const description = resolveToolDescription(
      config.setMsgEmoji.description,
      DEFAULT_SET_MSG_EMOJI_TOOL_DESCRIPTION,
    );
    plugin.registerTool(toolName, {
      selector: () => true,
      authorization: (session: Session) => session?.platform === "onebot",
      createTool: () =>
        createSetMsgEmojiTool({ toolName, description, log, protocol }),
    });
    log?.("info", `消息表情工具已注册: ${toolName}`);
  }

  if (config.deleteMessage.enabled) {
    const toolName = resolveToolName(
      config.deleteMessage.toolName,
      "delete_msg",
    );
    const description = resolveToolDescription(
      config.deleteMessage.description,
      DEFAULT_DELETE_MESSAGE_TOOL_DESCRIPTION,
    );
    plugin.registerTool(toolName, {
      selector: () => true,
      authorization: (session: Session) => session?.platform === "onebot",
      createTool: () => createDeleteMessageTool({ toolName, description, log }),
    });
    log?.("info", `删除消息工具已注册: ${toolName}`);
  }
}
