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

export interface SendSetGroupCardParams {
  session: import("koishi").Session | null;
  userId: string;
  card: string;
  groupId?: string;
  log?: LogFn;
}

export async function sendSetGroupCard(
  params: SendSetGroupCardParams,
): Promise<string> {
  try {
    const { session, userId, card, groupId, log } = params;
    if (!session) return "No session context available.";

    const resolvedGroupId =
      groupId?.trim() ||
      (session.guildId ? String(session.guildId).trim() : "") ||
      (session.channelId ? String(session.channelId).trim() : "");
    if (!resolvedGroupId) {
      return "Missing groupId. Provide groupId explicitly or run inside a group session.";
    }

    const userIdRaw = userId.trim();
    const cardRaw = card.trim();
    if (!userIdRaw) return "userId is required.";
    if (!cardRaw) return "card is required.";

    const { error, internal } = ensureOneBotSession(session);
    if (error) return error;

    await callOneBotAPI(
      internal!,
      "set_group_card",
      { group_id: resolvedGroupId, user_id: userIdRaw, card: cardRaw },
      ["setGroupCard"],
    );
    const message = `群昵称已更新：${userIdRaw} -> ${cardRaw}`;
    log?.("info", message);
    return message;
  } catch (error) {
    params.log?.("warn", "set_group_card failed", error);
    return `set_group_card failed: ${(error as Error).message}`;
  }
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
      return sendSetGroupCard({
        session: getSession(runnable),
        groupId: input.groupId,
        userId: input.userId,
        card: input.card,
        log,
      });
    }
  })();
}
