/**
 * 数据模型统一导出
 * 提供数据库模型注册入口
 */

import type { Context } from "koishi";
import { extendAffinityModel, MODEL_NAME, MODEL_NAME_V2 } from "./affinity";
import {
  extendBlacklistModel,
  BLACKLIST_MODEL_NAME,
  BLACKLIST_MODEL_NAME_V2,
} from "./blacklist";
import {
  extendUserAliasModel,
  USER_ALIAS_MODEL_NAME,
  USER_ALIAS_MODEL_NAME_V2,
} from "./user-alias";
import { extendMigrationModel, MIGRATION_MODEL_NAME } from "./migration";

export {
  MODEL_NAME,
  MODEL_NAME_V2,
  BLACKLIST_MODEL_NAME,
  BLACKLIST_MODEL_NAME_V2,
  USER_ALIAS_MODEL_NAME,
  USER_ALIAS_MODEL_NAME_V2,
  MIGRATION_MODEL_NAME,
};

export function registerModels(ctx: Context): void {
  extendAffinityModel(ctx);
  extendBlacklistModel(ctx);
  extendUserAliasModel(ctx);
  extendMigrationModel(ctx);
}

export * from "./affinity";
export * from "./blacklist";
export * from "./user-alias";
export * from "./migration";
