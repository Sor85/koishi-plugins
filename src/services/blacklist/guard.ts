/**
 * 黑名单拦截中间件
 * 提供消息拦截守卫，阻止黑名单用户的消息
 */

import type { Session } from "koishi";
import type { Config, LogFn } from "../../types";
import type { BlacklistService } from "./repository";

export interface BlacklistGuardOptions {
  config: Config;
  blacklist: BlacklistService;
  log: LogFn;
}

export function createBlacklistGuard(options: BlacklistGuardOptions) {
  const { config, blacklist, log } = options;

  const shouldBlock = async (session: Session): Promise<boolean> => {
    const platform = session?.platform;
    const userId = session?.userId;
    if (!platform || !userId) return false;

    const blocked = await blacklist.shouldBlock(platform, userId);
    if (blocked && config.blacklistLogInterception) {
      log("info", "消息被黑名单拦截", {
        scopeId: config.scopeId,
        platform,
        userId,
      });
    }
    return blocked;
  };

  const middleware = async (
    session: Session,
    next: () => Promise<void>,
  ): Promise<void> => {
    if (await shouldBlock(session)) return;
    return next();
  };

  return {
    shouldBlock,
    middleware,
  };
}

export type BlacklistGuard = ReturnType<typeof createBlacklistGuard>;
