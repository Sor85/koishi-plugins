/**
 * 群成员禁言工具
 * 提供群成员禁言与解除禁言能力
 */

import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import type { Session } from "koishi";
import type { LogFn, OneBotProtocol } from "../../../types";
import { ensureOneBotSession, callOneBotAPI } from "../onebot-api";
import { getSession } from "../session";
import { DEFAULT_SET_GROUP_BAN_TOOL_DESCRIPTION } from "../defaults";

export interface SetGroupBanToolDeps {
  toolName: string;
  description: string;
  protocol: OneBotProtocol;
  log?: LogFn;
}

export interface SendGroupBanParams {
  session: Session | null;
  userId: string;
  duration: number | string;
  groupId?: string;
  protocol: OneBotProtocol;
  log?: LogFn;
}

function resolveGroupId(session: Session, groupId?: string): string {
  return (
    groupId?.trim() ||
    ((session as unknown as { guildId?: string }).guildId || "").trim() ||
    (session.channelId || "").trim() ||
    (((session as unknown as { roomId?: string }).roomId || "").trim())
  );
}

function parseDuration(duration: number | string): number | null {
  const raw = String(duration).trim();
  if (!raw) return null;
  if (!/^\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export async function sendGroupBan(
  params: SendGroupBanParams,
): Promise<string> {
  try {
    const { session, userId, groupId, duration, log } = params;
    const {
      error,
      internal,
      session: validatedSession,
    } = ensureOneBotSession(session);
    if (error) return error;

    const resolvedGroupId = resolveGroupId(validatedSession!, groupId);
    if (!resolvedGroupId) {
      return "Missing groupId. Provide groupId explicitly or run inside a group session.";
    }

    const userIdRaw = userId.trim();
    if (!userIdRaw) return "userId is required.";

    const parsedDuration = parseDuration(duration);
    if (parsedDuration === null) {
      return "duration must be a non-negative integer in seconds.";
    }

    await callOneBotAPI(
      internal!,
      "set_group_ban",
      {
        group_id: resolvedGroupId,
        user_id: userIdRaw,
        duration: parsedDuration,
      },
      ["setGroupBan"],
    );

    const success =
      parsedDuration === 0
        ? `已解除群 ${resolvedGroupId} 中用户 ${userIdRaw} 的禁言。`
        : `已在群 ${resolvedGroupId} 中禁言用户 ${userIdRaw} ${parsedDuration} 秒。`;
    log?.("info", success);
    return success;
  } catch (error) {
    params.log?.("warn", "set_group_ban failed", error);
    return `set_group_ban failed: ${(error as Error).message}`;
  }
}

export function createSetGroupBanTool(
  deps: SetGroupBanToolDeps,
): StructuredTool {
  const { toolName, description, protocol, log } = deps;

  // @ts-ignore
  return new (class extends StructuredTool {
    name = toolName || "set_group_ban";
    description = description || DEFAULT_SET_GROUP_BAN_TOOL_DESCRIPTION;
    schema = z.object({
      groupId: z
        .string()
        .optional()
        .describe("Target group ID. Defaults to current session group."),
      userId: z
        .string()
        .min(1, "userId is required")
        .describe("Target member user ID."),
      duration: z
        .union([z.string(), z.number().int().min(0)])
        .describe("Mute duration in seconds. Use 0 to unmute."),
    });

    async _call(
      input: { groupId?: string; userId: string; duration: number | string },
      _manager?: unknown,
      runnable?: unknown,
    ) {
      const session = getSession(runnable);
      return sendGroupBan({
        session,
        userId: input.userId,
        duration: input.duration,
        groupId: input.groupId,
        protocol,
        log,
      });
    }
  })();
}
