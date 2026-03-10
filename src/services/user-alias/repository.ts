/**
 * 用户自定义昵称数据库服务
 * 提供自定义昵称的读写能力
 */

import type { Context } from "koishi";
import type { LogFn, UserAliasRecord } from "../../types";
import { USER_ALIAS_MODEL_NAME_V2 } from "../../models";

export interface UserAliasServiceOptions {
  ctx: Context;
  scopeId: string;
  log: LogFn;
}

export function createUserAliasService(options: UserAliasServiceOptions) {
  const { ctx, scopeId, log } = options;

  const getAlias = async (
    platform: string,
    userId: string,
  ): Promise<string | null> => {
    const rows = (await ctx.database.get(USER_ALIAS_MODEL_NAME_V2, {
      scopeId,
      platform,
      userId,
    })) as unknown as UserAliasRecord[];
    return rows[0]?.alias || null;
  };

  const setAlias = async (
    platform: string,
    userId: string,
    alias: string,
  ): Promise<UserAliasRecord> => {
    const row: UserAliasRecord = {
      scopeId,
      platform,
      userId,
      alias,
      updatedAt: new Date(),
    };
    await ctx.database.upsert(USER_ALIAS_MODEL_NAME_V2, [row as never]);
    log("info", "已设置用户自定义昵称", { scopeId, platform, userId, alias });
    return row;
  };

  return {
    getAlias,
    setAlias,
  };
}

export type UserAliasService = ReturnType<typeof createUserAliasService>;
