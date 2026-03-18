/**
 * 原生工具配置
 * 定义 OneBot 原生工具相关 Schema
 */

import { Schema } from "koishi";
import {
  DEFAULT_DELETE_MESSAGE_TOOL_DESCRIPTION,
  DEFAULT_POKE_TOOL_DESCRIPTION,
  DEFAULT_SET_GROUP_CARD_TOOL_DESCRIPTION,
  DEFAULT_SET_MSG_EMOJI_TOOL_DESCRIPTION,
  DEFAULT_SET_SELF_PROFILE_TOOL_DESCRIPTION,
} from "../features/native-tools/defaults";

export const NativeToolsSchema = Schema.object({
  poke: Schema.object({
    enabled: Schema.boolean()
      .default(false)
      .description("注册 ChatLuna 工具：戳一戳（与 XML工具 二选一）"),
    toolName: Schema.string()
      .default("poke_user")
      .description("工具名称"),
    description: Schema.string()
      .default(DEFAULT_POKE_TOOL_DESCRIPTION)
      .description("工具描述"),
  })
    .description("戳一戳工具")
    .collapse(),
  setSelfProfile: Schema.object({
    enabled: Schema.boolean()
      .default(false)
      .description("注册 ChatLuna 工具：修改自身账户信息（支持昵称/签名/性别）"),
    toolName: Schema.string()
      .default("set_self_profile")
      .description("工具名称"),
    description: Schema.string()
      .default(DEFAULT_SET_SELF_PROFILE_TOOL_DESCRIPTION)
      .description("工具描述"),
  })
    .description("修改自身账户信息工具")
    .collapse(),
  setGroupCard: Schema.object({
    enabled: Schema.boolean()
      .default(false)
      .description("注册 ChatLuna 工具：修改群成员昵称"),
    toolName: Schema.string()
      .default("set_group_card")
      .description("工具名称"),
    description: Schema.string()
      .default(DEFAULT_SET_GROUP_CARD_TOOL_DESCRIPTION)
      .description("工具描述"),
  })
    .description("修改群成员昵称工具")
    .collapse(),
  setMsgEmoji: Schema.object({
    enabled: Schema.boolean()
      .default(false)
      .description(
        "注册 ChatLuna 工具：给消息添加表情（需 chatluna-character 开启 enableMessageId，与 XML工具 二选一，表情对照表：https://bot.q.qq.com/wiki/develop/pythonsdk/model/emoji.html ）",
      ),
    toolName: Schema.string()
      .default("set_msg_emoji")
      .description("工具名称"),
    description: Schema.string()
      .default(DEFAULT_SET_MSG_EMOJI_TOOL_DESCRIPTION)
      .description("工具描述"),
  })
    .description("消息表情工具")
    .collapse(),
  deleteMessage: Schema.object({
    enabled: Schema.boolean()
      .default(false)
      .description(
        "注册 ChatLuna 工具：撤回消息（需 chatluna-character 开启 enableMessageId，与 XML工具 二选一）",
      ),
    toolName: Schema.string()
      .default("delete_msg")
      .description("工具名称"),
    description: Schema.string()
      .default(DEFAULT_DELETE_MESSAGE_TOOL_DESCRIPTION)
      .description("工具描述"),
  })
    .description("撤回消息工具")
    .collapse(),
})
  .default({
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
  })
  .description("原生工具");
