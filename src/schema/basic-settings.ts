/**
 * 基础设置配置
 * 定义 OneBot 协议相关 Schema
 */

import { Schema } from "koishi";

export const BasicSettingsSchema = Schema.object({
  enableNapCatProtocol: Schema.boolean()
    .default(true)
    .description("启用 NapCat OneBot 协议（与 LLBot 二选一）"),
  enableLlbotProtocol: Schema.boolean()
    .default(false)
    .description("启用 LLBot OneBot 协议（与 NapCat 二选一）"),
}).description("基础设置");
