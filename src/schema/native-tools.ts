/**
 * 原生工具配置
 * 定义 OneBot 原生工具相关 Schema
 */

import { Schema } from "koishi";

export const NativeToolsSchema = Schema.object({
  poke: Schema.object({
    enabled: Schema.boolean()
      .default(false)
      .description("注册 ChatLuna 工具：戳一戳（与 XML工具 二选一）"),
    toolName: Schema.string()
      .default("poke_user")
      .description("ChatLuna 工具名称：戳一戳"),
  })
    .description("戳一戳工具")
    .collapse(),
  setSelfProfile: Schema.object({
    enabled: Schema.boolean()
      .default(false)
      .description("注册 ChatLuna 工具：修改自身账户信息"),
    toolName: Schema.string()
      .default("set_self_profile")
      .description("ChatLuna 工具名称：修改自身账户信息（支持昵称/签名/性别）"),
  })
    .description("修改自身账户信息工具")
    .collapse(),
  setGroupCard: Schema.object({
    enabled: Schema.boolean()
      .default(false)
      .description("注册 ChatLuna 工具：修改群成员昵称"),
    toolName: Schema.string()
      .default("set_group_card")
      .description("ChatLuna 工具名称：修改群成员昵称"),
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
      .description("ChatLuna 工具名称：给消息添加表情"),
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
      .description("ChatLuna 工具名称：撤回消息"),
  })
    .description("撤回消息工具")
    .collapse(),
})
  .default({
    poke: { enabled: false, toolName: "poke_user" },
    setSelfProfile: { enabled: false, toolName: "set_self_profile" },
    setGroupCard: { enabled: false, toolName: "set_group_card" },
    setMsgEmoji: { enabled: false, toolName: "set_msg_emoji" },
    deleteMessage: { enabled: false, toolName: "delete_msg" },
  })
  .description("原生工具");
