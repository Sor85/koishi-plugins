/**
 * 好感度 Schema
 * 定义好感度相关的配置项
 */

import { Schema } from "koishi";
import {
  AFFINITY_DYNAMICS_DEFAULTS,
  BASE_AFFINITY_DEFAULTS,
} from "../constants";

const AffinityDynamicsSchema = Schema.object({
  shortTerm: Schema.object({
    promoteThreshold: Schema.number()
      .default(AFFINITY_DYNAMICS_DEFAULTS.shortTerm.promoteThreshold)
      .description("短期好感达到该值后，增加长期好感"),
    demoteThreshold: Schema.number()
      .default(AFFINITY_DYNAMICS_DEFAULTS.shortTerm.demoteThreshold)
      .description("短期好感低于该值后，减少长期好感"),
    longTermPromoteStep: Schema.number()
      .default(AFFINITY_DYNAMICS_DEFAULTS.shortTerm.longTermPromoteStep)
      .min(1)
      .description("每次增加的长期好感值"),
    longTermDemoteStep: Schema.number()
      .default(AFFINITY_DYNAMICS_DEFAULTS.shortTerm.longTermDemoteStep)
      .min(1)
      .description("每次减少的长期好感值"),
  })
    .description("短期与长期好感设置")
    .collapse(),
  actionWindow: Schema.object({
    windowHours: Schema.number()
      .default(AFFINITY_DYNAMICS_DEFAULTS.actionWindow.windowHours)
      .min(1)
      .description("统计近期互动的时间窗口，单位为小时"),
    increaseBonus: Schema.number()
      .default(AFFINITY_DYNAMICS_DEFAULTS.actionWindow.increaseBonus)
      .description("当近期正向互动占优时，额外增加的好感度"),
    decreaseBonus: Schema.number()
      .default(AFFINITY_DYNAMICS_DEFAULTS.actionWindow.decreaseBonus)
      .description("当近期负向互动占优时，额外减少的好感度"),
    bonusChatThreshold: Schema.number()
      .default(AFFINITY_DYNAMICS_DEFAULTS.actionWindow.bonusChatThreshold)
      .min(0)
      .description("互动次数达到该值后，才启用额外增减效果"),
    maxEntries: Schema.number()
      .default(AFFINITY_DYNAMICS_DEFAULTS.actionWindow.maxEntries)
      .min(10)
      .description("时间窗口内最多保留的互动记录数"),
  })
    .description("近期互动权重设置")
    .collapse(),
  coefficient: Schema.object({
    base: Schema.number()
      .default(AFFINITY_DYNAMICS_DEFAULTS.coefficient.base)
      .description("好感度变化的基础系数"),
    maxDrop: Schema.number()
      .default(AFFINITY_DYNAMICS_DEFAULTS.coefficient.maxDrop)
      .min(0)
      .step(0.1)
      .description("在长期冷淡或负向互动占优时，系数最多可下调的幅度"),
    maxBoost: Schema.number()
      .default(AFFINITY_DYNAMICS_DEFAULTS.coefficient.maxBoost)
      .min(0)
      .step(0.1)
      .description("在持续互动且正向互动占优时，系数最多可上调的幅度"),
    decayPerDay: Schema.number()
      .default(AFFINITY_DYNAMICS_DEFAULTS.coefficient.decayPerDay)
      .min(0)
      .step(0.05)
      .description("每经过一天冷淡期或负向占优期时，系数的下调幅度"),
    boostPerDay: Schema.number()
      .default(AFFINITY_DYNAMICS_DEFAULTS.coefficient.boostPerDay)
      .min(0)
      .step(0.05)
      .description("每经过一天稳定互动且正向占优时，系数的上调幅度"),
  })
    .description("好感度变化系数")
    .collapse(),
}).description(
  "好感度动态调节：Bot 每次增加或减少的值会先计入短期好感；当短期好感超过阈值时，会按设定步长换算到长期好感；长期好感再乘以当前系数，得到最终的综合好感。",
);

export const AffinitySchema = Schema.object({
  affinityEnabled: Schema.boolean().default(true).description("启用好感度系统"),
  affinityDisplayRange: Schema.number()
    .default(1)
    .min(1)
    .step(1)
    .description("显示当前上下文中多少位用户的好感度信息"),
  initialAffinity: Schema.number()
    .default(BASE_AFFINITY_DEFAULTS.initialAffinity)
    .description("初始长期好感度默认值"),
  affinityDynamics: AffinityDynamicsSchema.collapse(),
  rankDefaultLimit: Schema.number()
    .default(10)
    .min(1)
    .max(50)
    .description("好感度排行默认展示人数"),
}).description("好感度设置");
