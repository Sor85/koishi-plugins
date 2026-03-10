/**
 * 清空数据库命令
 * 清空所有好感度数据（危险操作，需二次确认）
 */

import type { CommandDependencies } from "./types";
import { buildScopedCommandName } from "../helpers";
import {
  MODEL_NAME_V2,
  BLACKLIST_MODEL_NAME_V2,
  USER_ALIAS_MODEL_NAME_V2,
} from "../models";

export function registerClearAllCommand(deps: CommandDependencies) {
  const { ctx, log, cache, config } = deps;
  const pendingClearConfirmations = new Map<string, { expiresAt: number }>();

  ctx
    .command(
      buildScopedCommandName(config.scopeId, "clearAll"),
      "清空当前作用域的好感度数据（危险操作）",
      {
        authority: 4,
      },
    )
    .alias("清空好感度")
    .option("confirm", "-y 确认清空")
    .action(async ({ session, options }) => {
      if (!session) return "无法获取会话信息。";
      const sessionKey = `${session.platform}:${session.userId}`;
      const now = Date.now();

      const pending = pendingClearConfirmations.get(sessionKey);
      if (pending && pending.expiresAt > now && options?.confirm) {
        pendingClearConfirmations.delete(sessionKey);
        try {
          await ctx.database.remove(MODEL_NAME_V2, { scopeId: config.scopeId });
          await ctx.database.remove(BLACKLIST_MODEL_NAME_V2, {
            scopeId: config.scopeId,
          });
          await ctx.database.remove(USER_ALIAS_MODEL_NAME_V2, {
            scopeId: config.scopeId,
          });
          cache.clearAll?.();
          log("info", "当前作用域数据库已清空", {
            scopeId: config.scopeId,
            operator: session.userId,
            platform: session.platform,
          });
          return `✅ 已成功清空作用域 ${config.scopeId} 下的好感度、黑名单与昵称数据。`;
        } catch (error) {
          log("warn", "清空数据库失败", error);
          return "❌ 清空数据库时发生错误，请查看日志。";
        }
      }

      pendingClearConfirmations.set(sessionKey, { expiresAt: now + 60 * 1000 });
      return `⚠️ 警告：此操作将永久删除作用域 ${config.scopeId} 下的好感度、黑名单与昵称数据，且无法恢复！\n请在 60 秒内使用 \`${buildScopedCommandName(config.scopeId, "clearAll")} -y\` 或 \`清空好感度 -y\` 确认执行。`;
    });
}
