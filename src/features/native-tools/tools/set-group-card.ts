/**
 * 群昵称设置工具
 * 提供修改群成员昵称能力
 */

import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import type { Context } from "koishi";
import type { LogFn } from "../../../types";
import { ensureOneBotSession, callOneBotAPI } from "../onebot-api";
import { getSession } from "../session";
import { DEFAULT_SET_GROUP_CARD_TOOL_DESCRIPTION } from "../defaults";

export interface SetGroupCardToolDeps {
  ctx: Context;
  toolName: string;
  description: string;
  log?: LogFn;
}

export function createSetGroupCardTool(
  deps: SetGroupCardToolDeps,
): StructuredTool {
  const { toolName, description, log } = deps;

  // @ts-ignore
  return new (class extends StructuredTool {
    name = toolName || "set_group_card";
    description = description || DEFAULT_SET_GROUP_CARD_TOOL_DESCRIPTION;
    schema = z.object({
      groupId: z
        .string()
        .optional()
        .describe("Target group ID. Defaults to current session group."),
      userId: z
        .string()
        .min(1, "userId is required")
        .describe("Target member user ID."),
      card: z
        .string()
        .min(1, "card is required")
        .describe("New group card for the member."),
    });

    async _call(
      input: { groupId?: string; userId: string; card: string },
      _manager?: unknown,
      runnable?: unknown,
    ) {
      try {
        const session = getSession(runnable);
        if (!session) return "No session context available.";

        const groupId =
          input.groupId?.trim() ||
          (session.guildId ? String(session.guildId).trim() : "") ||
          (session.channelId ? String(session.channelId).trim() : "");
        if (!groupId)
          return "Missing groupId. Provide groupId explicitly or run inside a group session.";

        const userId = input.userId.trim();
        const card = input.card.trim();
        if (!userId) return "userId is required.";
        if (!card) return "card is required.";

        const { error, internal } = ensureOneBotSession(session);
        if (error) return error;

        await callOneBotAPI(
          internal!,
          "set_group_card",
          { group_id: groupId, user_id: userId, card },
          ["setGroupCard"],
        );
        const message = `群昵称已更新：${userId} -> ${card}`;
        log?.("info", message);
        return message;
      } catch (error) {
        log?.("warn", "set_group_card failed", error);
        return `set_group_card failed: ${(error as Error).message}`;
      }
    }
  })();
}
