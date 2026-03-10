/**
 * 好感度数据表定义
 * 定义 chatluna_affinity 表结构及类型声明
 */

import type { Context } from "koishi";
import type { AffinityRecord, LegacyAffinityRecord } from "../types";

export const MODEL_NAME = "chatluna_affinity";
export const MODEL_NAME_V2 = "chatluna_affinity_v2";

declare module "koishi" {
  interface Tables {
    [MODEL_NAME]: LegacyAffinityRecord;
    [MODEL_NAME_V2]: AffinityRecord;
  }
}

export function extendAffinityModel(ctx: Context): void {
  ctx.model.extend(
    MODEL_NAME,
    {
      userId: { type: "string", length: 64 },
      nickname: { type: "string", length: 255, nullable: true },
      affinity: { type: "integer", initial: 0 },
      relation: { type: "string", length: 64, nullable: true },
      specialRelation: { type: "string", length: 64, nullable: true },
      shortTermAffinity: { type: "integer", nullable: true },
      longTermAffinity: { type: "integer", nullable: true },
      chatCount: { type: "integer", nullable: true },
      actionStats: { type: "text", nullable: true },
      lastInteractionAt: { type: "timestamp", nullable: true },
      coefficientState: { type: "text", nullable: true },
    },
    { primary: ["userId"] },
  );

  ctx.model.extend(
    MODEL_NAME_V2,
    {
      scopeId: { type: "string", length: 32 },
      userId: { type: "string", length: 64 },
      nickname: { type: "string", length: 255, nullable: true },
      affinity: { type: "integer", initial: 0 },
      relation: { type: "string", length: 64, nullable: true },
      specialRelation: { type: "string", length: 64, nullable: true },
      shortTermAffinity: { type: "integer", nullable: true },
      longTermAffinity: { type: "integer", nullable: true },
      chatCount: { type: "integer", nullable: true },
      actionStats: { type: "text", nullable: true },
      lastInteractionAt: { type: "timestamp", nullable: true },
      coefficientState: { type: "text", nullable: true },
    },
    { primary: ["scopeId", "userId"] },
  );
}
