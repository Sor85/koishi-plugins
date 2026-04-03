import type { Context, Session } from "koishi";
import type { Config, LogFn, OneBotProtocol } from "../../types";
import { sendDeleteMessage } from "../native-tools/tools/delete-msg";
import { sendPoke } from "../native-tools/tools/poke";
import { sendGroupBan } from "../native-tools/tools/set-group-ban";
import { sendMsgEmoji } from "../native-tools/tools/set-msg-emoji";

interface ReplyField {
  name: string;
  schema: Record<string, unknown>;
  invoke?: (
    ctx: Context,
    session: Session,
    value: unknown,
    config: unknown,
  ) => Promise<void> | void;
  render?: (
    ctx: Context,
    session: Session,
    value: unknown,
    config: unknown,
  ) => string | string[] | undefined;
}

interface CharacterService {
  registerReplyToolField?: (field: ReplyField) => () => void;
}

export interface RegisterReplyToolsDeps {
  ctx: Context;
  config: Config;
  protocol: OneBotProtocol;
  log?: LogFn;
}

function escapeAttr(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function hasReplyToolsEnabled(config: Config): boolean {
  return !!(
    config.injectXmlToolAsReplyTool &&
    (config.enablePokeXmlTool ||
      config.enableBanXmlTool ||
      config.enableEmojiXmlTool ||
      config.enableDeleteXmlTool)
  );
}

export function registerCharacterReplyTools(
  deps: RegisterReplyToolsDeps,
): () => void {
  const { ctx, config, protocol, log } = deps;
  const service = (ctx as unknown as { chatluna_character?: CharacterService })
    .chatluna_character;

  if (!service?.registerReplyToolField) {
    return () => {};
  }

  const disposers: (() => void)[] = [];

  if (config.injectXmlToolAsReplyTool && config.enablePokeXmlTool) {
    disposers.push(
      service.registerReplyToolField({
        name: "toolbox_poke",
        schema: {
          type: "array",
          description:
            "Poke one or more users after sending this reply. Each item is one poke action.",
          items: {
            type: "object",
            properties: {
              user_id: {
                type: "string",
                description: "Target user ID to poke.",
              },
              group_id: {
                type: "string",
                description:
                  "Optional target group ID. Defaults to the current session group.",
              },
            },
            required: ["user_id"],
          },
        },
        async invoke(_, session, value) {
          if (!Array.isArray(value)) return;
          for (const item of value) {
            if (!item || typeof item !== "object" || Array.isArray(item)) {
              continue;
            }
            const action = item as Record<string, unknown>;
            if (typeof action.user_id !== "string") continue;
            await sendPoke({
              session,
              userId: action.user_id,
              groupId:
                typeof action.group_id === "string"
                  ? action.group_id
                  : undefined,
              protocol,
              log,
            });
          }
        },
        render(_, __, value) {
          if (!Array.isArray(value)) return;
          return value.flatMap((item) => {
            if (!item || typeof item !== "object" || Array.isArray(item)) {
              return [];
            }
            const action = item as Record<string, unknown>;
            if (typeof action.user_id !== "string") return [];
            const group =
              typeof action.group_id === "string" && action.group_id.trim()
                ? ` group_id="${escapeAttr(action.group_id)}"`
                : "";
            return [`<poke id="${escapeAttr(action.user_id)}"${group} />`];
          });
        },
      }),
    );
  }

  if (config.injectXmlToolAsReplyTool && config.enableBanXmlTool) {
    disposers.push(
      service.registerReplyToolField({
        name: "toolbox_set_group_ban",
        schema: {
          type: "array",
          description:
            "Mute or unmute one or more users after this reply. Each item is one group ban action.",
          items: {
            type: "object",
            properties: {
              user_id: {
                type: "string",
                description: "Target member user ID.",
              },
              duration: {
                type: "number",
                description:
                  "Mute duration in seconds. Use 0 to unmute the member.",
              },
              group_id: {
                type: "string",
                description:
                  "Optional target group ID. Defaults to the current session group.",
              },
            },
            required: ["user_id", "duration"],
          },
        },
        async invoke(_, session, value) {
          if (!Array.isArray(value)) return;
          for (const item of value) {
            if (!item || typeof item !== "object" || Array.isArray(item)) {
              continue;
            }
            const action = item as Record<string, unknown>;
            if (typeof action.user_id !== "string") continue;
            await sendGroupBan({
              session,
              userId: action.user_id,
              duration:
                typeof action.duration === "number" ||
                typeof action.duration === "string"
                  ? action.duration
                  : "",
              groupId:
                typeof action.group_id === "string"
                  ? action.group_id
                  : undefined,
              protocol,
              log,
            });
          }
        },
        render(_, __, value) {
          if (!Array.isArray(value)) return;
          return value.flatMap((item) => {
            if (!item || typeof item !== "object" || Array.isArray(item)) {
              return [];
            }
            const action = item as Record<string, unknown>;
            if (typeof action.user_id !== "string") return [];
            const duration =
              typeof action.duration === "number" ||
              typeof action.duration === "string"
                ? String(action.duration)
                : "";
            if (!duration) return [];
            const group =
              typeof action.group_id === "string" && action.group_id.trim()
                ? ` group_id="${escapeAttr(action.group_id)}"`
                : "";
            return [
              `<ban id="${escapeAttr(action.user_id)}" duration="${escapeAttr(duration)}"${group} />`,
            ];
          });
        },
      }),
    );
  }

  if (config.injectXmlToolAsReplyTool && config.enableEmojiXmlTool) {
    disposers.push(
      service.registerReplyToolField({
        name: "toolbox_set_msg_emoji",
        schema: {
          type: "array",
          description:
            "Add emoji reactions to one or more messages after this reply. Each item is one emoji action.",
          items: {
            type: "object",
            properties: {
              message_id: {
                type: "string",
                description: "Target message ID.",
              },
              emoji_id: {
                type: "string",
                description: "Emoji ID to send.",
              },
            },
            required: ["message_id", "emoji_id"],
          },
        },
        async invoke(_, session, value) {
          if (!Array.isArray(value)) return;
          for (const item of value) {
            if (!item || typeof item !== "object" || Array.isArray(item)) {
              continue;
            }
            const action = item as Record<string, unknown>;
            if (
              typeof action.message_id !== "string" ||
              typeof action.emoji_id !== "string"
            ) {
              continue;
            }
            await sendMsgEmoji({
              session,
              messageId: action.message_id,
              emojiId: action.emoji_id,
              protocol,
              log,
            });
          }
        },
        render(_, __, value) {
          if (!Array.isArray(value)) return;
          return value.flatMap((item) => {
            if (!item || typeof item !== "object" || Array.isArray(item)) {
              return [];
            }
            const action = item as Record<string, unknown>;
            if (
              typeof action.message_id !== "string" ||
              typeof action.emoji_id !== "string"
            ) {
              return [];
            }
            return [
              `<emoji message_id="${escapeAttr(action.message_id)}" emoji_id="${escapeAttr(action.emoji_id)}" />`,
            ];
          });
        },
      }),
    );
  }

  if (config.injectXmlToolAsReplyTool && config.enableDeleteXmlTool) {
    disposers.push(
      service.registerReplyToolField({
        name: "toolbox_delete_message",
        schema: {
          type: "array",
          description:
            "Delete one or more messages after this reply. Each item is one delete action.",
          items: {
            type: "object",
            properties: {
              message_id: {
                type: "string",
                description: "Target message ID to delete.",
              },
            },
            required: ["message_id"],
          },
        },
        async invoke(_, session, value) {
          if (!Array.isArray(value)) return;
          for (const item of value) {
            if (!item || typeof item !== "object" || Array.isArray(item)) {
              continue;
            }
            const action = item as Record<string, unknown>;
            if (typeof action.message_id !== "string") continue;
            await sendDeleteMessage({
              session,
              messageId: action.message_id,
              log,
            });
          }
        },
        render(_, __, value) {
          if (!Array.isArray(value)) return;
          return value.flatMap((item) => {
            if (!item || typeof item !== "object" || Array.isArray(item)) {
              return [];
            }
            const action = item as Record<string, unknown>;
            if (typeof action.message_id !== "string") return [];
            return [
              `<delete message_id="${escapeAttr(action.message_id)}" />`,
            ];
          });
        },
      }),
    );
  }

  return () => {
    for (const dispose of disposers.reverse()) {
      dispose();
    }
  };
}
