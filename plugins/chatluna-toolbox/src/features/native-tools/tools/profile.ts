/**
 * 个人资料设置工具
 * 提供机器人账户信息修改能力
 */

import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import type { Context } from "koishi";
import type { LogFn } from "../../../types";
import { ensureOneBotSession, callOneBotAPI } from "../onebot-api";
import type { OneBotProtocol } from "../../../types";
import { getSession } from "../session";
import { DEFAULT_SET_SELF_PROFILE_TOOL_DESCRIPTION } from "../defaults";

export interface ProfileToolDeps {
  ctx: Context;
  toolName: string;
  description: string;
  protocol: OneBotProtocol;
  log?: LogFn;
}

const genders: Record<string, string> = {
  unknown: "0",
  male: "1",
  female: "2",
};

export interface SendSetProfileParams {
  session: import("koishi").Session | null;
  nickname: string;
  signature?: string;
  gender?: "unknown" | "male" | "female";
  protocol: OneBotProtocol;
  log?: LogFn;
}

export async function sendSetProfile(
  params: SendSetProfileParams,
): Promise<string> {
  try {
    const { session, nickname, signature, gender, protocol, log } = params;
    const { error, internal } = ensureOneBotSession(session);
    if (error) return error;

    const payload: Record<string, unknown> = { nickname };
    if (signature) payload.personal_note = signature;
    if (gender && protocol !== "llbot") payload.sex = genders[gender];

    await callOneBotAPI(internal!, "set_qq_profile", payload, [
      "setQQProfile",
    ]);
    const message = "机器人资料已更新。";
    log?.("info", message);
    return message;
  } catch (error) {
    params.log?.("warn", "修改机器人账户信息失败", error);
    return `修改机器人账户信息失败：${(error as Error).message}`;
  }
}

export function createSetProfileTool(deps: ProfileToolDeps): StructuredTool {
  const { toolName, description, log, protocol } = deps;

  // @ts-ignore
  return new (class extends StructuredTool {
    name = toolName || "set_self_profile";
    description =
      description || DEFAULT_SET_SELF_PROFILE_TOOL_DESCRIPTION;
    schema = z.object({
      nickname: z
        .string()
        .min(1, "nickname is required")
        .describe("The new nickname for the bot."),
      signature: z
        .string()
        .optional()
        .describe("Optional: the new personal signature."),
      gender: z
        .enum(["unknown", "male", "female"])
        .optional()
        .describe("Optional: the new gender."),
    });

    async _call(
      input: {
        nickname: string;
        signature?: string;
        gender?: "unknown" | "male" | "female";
      },
      _manager?: unknown,
      runnable?: unknown,
    ) {
      return sendSetProfile({
        session: getSession(runnable),
        nickname: input.nickname,
        signature: input.signature,
        gender: input.gender,
        protocol,
        log,
      });
    }
  })();
}
