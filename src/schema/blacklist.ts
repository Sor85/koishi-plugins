/**
 * 黑名单 Schema
 * 定义黑名单相关的配置项
 */

import { Schema } from "koishi";
import { THRESHOLDS } from "../constants";

export const BlacklistSchema = Schema.object({
  blacklistLogInterception: Schema.boolean()
    .default(true)
    .description("拦截消息时输出日志"),
  shortTermBlacklistPenalty: Schema.number()
    .default(5)
    .min(0)
    .description("临时拉黑时额外扣减的长期好感度"),
  unblockPermanentInitialAffinity: Schema.number()
    .default(THRESHOLDS.UNBLOCK_PERMANENT_INITIAL_AFFINITY)
    .description("解除永久黑名单后重置的初始好感度"),
  blacklistDefaultLimit: Schema.number()
    .default(10)
    .min(1)
    .max(100)
    .description("黑名单默认展示人数"),
}).description("黑名单设置");
