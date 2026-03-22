/**
 * XML 处理器
 * 负责解析动作标签并路由到底层原生能力
 */

import type { Session } from "koishi";
import type { Config, LogFn, OneBotProtocol } from "../../types";
import { sendDeleteMessage } from "../native-tools/tools/delete-msg";
import { sendPoke } from "../native-tools/tools/poke";
import { sendGroupBan } from "../native-tools/tools/set-group-ban";
import { sendMsgEmoji } from "../native-tools/tools/set-msg-emoji";
import { parseSelfClosingXmlTags } from "./parser";

export interface XmlProcessorContext {
  response: string;
  session: Session | null;
}

export interface XmlProcessorDeps {
  config: Config;
  protocol: OneBotProtocol;
  log?: LogFn;
  sendPoke?: typeof sendPoke;
  sendMsgEmoji?: typeof sendMsgEmoji;
  sendDeleteMessage?: typeof sendDeleteMessage;
  sendGroupBan?: typeof sendGroupBan;
}

export function createXmlProcessor(deps: XmlProcessorDeps) {
  const {
    config,
    protocol,
    log,
    sendPoke: runPoke = sendPoke,
    sendMsgEmoji: runEmoji = sendMsgEmoji,
    sendDeleteMessage: runDelete = sendDeleteMessage,
    sendGroupBan: runBan = sendGroupBan,
  } = deps;

  return async ({
    response,
    session,
  }: XmlProcessorContext): Promise<boolean> => {
    const content = String(response || "").trim();
    if (!content) return false;

    const pokeTags = parseSelfClosingXmlTags(content, "poke");
    const emojiTags = parseSelfClosingXmlTags(content, "emoji");
    const deleteTags = parseSelfClosingXmlTags(content, "delete");
    const banTags = parseSelfClosingXmlTags(content, "ban");
    let handled = false;

    if (config.enablePokeXmlTool && pokeTags.length > 0) {
      if (!session) {
        log?.("warn", "检测到戳一戳标记但缺少会话上下文");
      } else {
        const userIds = pokeTags
          .map((attrs) => String(attrs.id || "").trim())
          .filter(Boolean);
        if (userIds.length > 0) handled = true;
        for (const userId of userIds) {
          try {
            await runPoke({ session, userId, protocol, log });
          } catch (error) {
            log?.("warn", "XML 触发 poke 失败", error);
          }
        }
      }
    }

    if (config.enableEmojiXmlTool && emojiTags.length > 0) {
      if (!session) {
        log?.("warn", "检测到表情标记但缺少会话上下文");
      } else {
        const items = emojiTags
          .map((attrs) => ({
            messageId: String(attrs.message_id || "").trim(),
            emojiId: String(attrs.emoji_id || "").trim(),
          }))
          .filter((item) => item.messageId && item.emojiId);
        if (items.length > 0) handled = true;
        for (const item of items) {
          try {
            await runEmoji({
              session,
              messageId: item.messageId,
              emojiId: item.emojiId,
              protocol,
              log,
            });
          } catch (error) {
            log?.("warn", "XML 触发表情失败", error);
          }
        }
      }
    }

    if (config.enableDeleteXmlTool && deleteTags.length > 0) {
      if (!session) {
        log?.("warn", "检测到撤回标记但缺少会话上下文");
      } else {
        const messageIds = deleteTags
          .map((attrs) => String(attrs.message_id || "").trim())
          .filter(Boolean);
        if (messageIds.length > 0) handled = true;
        for (const messageId of messageIds) {
          try {
            await runDelete({ session, messageId, log });
          } catch (error) {
            log?.("warn", "XML 触发撤回失败", error);
          }
        }
      }
    }

    if (config.enableBanXmlTool && banTags.length > 0) {
      if (!session) {
        log?.("warn", "检测到禁言标记但缺少会话上下文");
      } else {
        const items = banTags
          .map((attrs) => ({
            userId: String(attrs.id || "").trim(),
            duration: String(attrs.duration || "").trim(),
          }))
          .filter((item) => item.userId && item.duration);
        if (items.length > 0) handled = true;
        for (const item of items) {
          try {
            await runBan({
              session,
              userId: item.userId,
              duration: item.duration,
              protocol,
              log,
            });
          } catch (error) {
            log?.("warn", "XML 触发禁言失败", error);
          }
        }
      }
    }

    return handled;
  };
}
