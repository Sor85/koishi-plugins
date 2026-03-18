/**
 * 消息删除工具
 * 提供消息撤回能力
 */

import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import type { Session } from "koishi";
import type { LogFn } from "../../../types";
import { ensureOneBotSession, callOneBotAPI } from "../onebot-api";
import { getSession } from "../session";
import { DEFAULT_DELETE_MESSAGE_TOOL_DESCRIPTION } from "../defaults";

export interface DeleteMessageToolDeps {
  toolName: string;
  description: string;
  log?: LogFn;
}

export interface SendDeleteMessageParams {
  session: Session | null;
  messageId: string;
  log?: LogFn;
}

export async function sendDeleteMessage(
  params: SendDeleteMessageParams,
): Promise<string> {
  const { session, messageId, log } = params;

  try {
    if (!session) return "No session context available.";

    const messageIdRaw = messageId.trim();
    if (!messageIdRaw) return "messageId is required.";

    const numericId = /^\d+$/.test(messageIdRaw)
      ? Number(messageIdRaw)
      : messageIdRaw;

    if (session.platform === "onebot") {
      const { error, internal } = ensureOneBotSession(session);
      if (error) return error;
      await callOneBotAPI(internal!, "delete_msg", { message_id: numericId }, [
        "deleteMsg",
      ]);
      const success = `Message deleted by ID ${messageIdRaw}.`;
      log?.("info", success);
      return success;
    }

    const bot = session.bot as unknown as {
      deleteMessage?: (channelId: string, messageId: string) => Promise<void>;
    };
    if (typeof bot?.deleteMessage === "function") {
      const channelId =
        session.channelId ||
        (session as unknown as { guildId?: string })?.guildId ||
        (session as unknown as { roomId?: string })?.roomId ||
        (session as unknown as { channel?: { id?: string } })?.channel?.id ||
        "";
      if (!channelId) return "Cannot determine channel to delete message.";
      await bot.deleteMessage(channelId, messageIdRaw);
      const success = `Message deleted by ID ${messageIdRaw}.`;
      log?.("info", success);
      return success;
    }

    return "Delete message is not supported on this platform.";
  } catch (error) {
    log?.("warn", "delete_msg failed", error);
    return `delete_msg failed: ${(error as Error).message}`;
  }
}

export function createDeleteMessageTool(deps: DeleteMessageToolDeps) {
  const { toolName, description, log } = deps;

  const tool = {
    name: toolName || "delete_msg",
    description: description || DEFAULT_DELETE_MESSAGE_TOOL_DESCRIPTION,
    schema: z.object({
      messageId: z
        .string()
        .min(1, "messageId is required")
        .describe("Specific message ID to delete."),
    }),
    async _call(
      input: { messageId: string },
      _manager?: unknown,
      runnable?: unknown,
    ) {
      try {
        const session = getSession(runnable);
        return await sendDeleteMessage({
          session,
          messageId: input.messageId,
          log,
        });
      } catch (error) {
        log?.("warn", "delete_msg failed", error);
        return `delete_msg failed: ${(error as Error).message}`;
      }
    },
  };

  return tool as unknown as StructuredTool;
}
