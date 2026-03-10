/**
 * 临时拉黑命令
 * 管理临时黑名单
 */

import type { Session } from "koishi";
import type { CommandDependencies } from "./types";
import { buildScopedCommandName } from "../helpers";
import type { BlacklistService } from "../services/blacklist/repository";

export interface TempBlockCommandDeps extends CommandDependencies {
  blacklist: BlacklistService;
}

export function registerTempBlockCommand(deps: TempBlockCommandDeps) {
  const {
    ctx,
    config,
    store,
    cache,
    blacklist,
    resolveUserIdentity,
    stripAtPrefix,
    fetchMember,
  } = deps;

  ctx
    .command(
      buildScopedCommandName(deps.config.scopeId, "tempBlock") +
        " <userId:string> [durationHours:number] [platform:string]",
      "临时拉黑用户",
      { authority: 4 },
    )
    .option("note", "-n <note:text> 备注信息")
    .option("penalty", "-p <penalty:number> 扣除好感度")
    .alias("临时拉黑")
    .action(async ({ session, options }, userId, durationArg, platformArg) => {
      const platform = platformArg || session?.platform;
      if (!platform) return "请指定平台。";
      const resolved = await resolveUserIdentity(session as Session, userId);
      const normalizedUserId = resolved?.userId || stripAtPrefix(userId);
      if (!normalizedUserId) return "用户 ID 不能为空。";

      const parsedDuration = Number(durationArg);
      const durationHours = Number.isFinite(parsedDuration)
        ? Math.max(1, parsedDuration)
        : 12;
      const penalty = options?.penalty ?? config.shortTermBlacklistPenalty ?? 5;

      const existing = await blacklist.isTemporarilyBlacklisted(
        platform,
        normalizedUserId,
      );
      if (existing) {
        return `${platform}/${normalizedUserId} 已在临时黑名单中，到期时间：${existing.expiresAt}`;
      }

      const entry = await blacklist.recordTemporary(
        platform,
        normalizedUserId,
        durationHours,
        penalty,
        {
          note: options?.note || "manual",
          nickname: resolved?.nickname || normalizedUserId,
        },
      );
      if (!entry) return `添加临时黑名单失败。`;

      if (penalty > 0) {
        try {
          const record = await store.load(
            deps.config.scopeId,
            normalizedUserId,
          );
          if (record) {
            const newAffinity = store.clamp(
              (record.longTermAffinity ?? record.affinity) - penalty,
            );
            await store.save(
              {
                scopeId: deps.config.scopeId,
                platform,
                userId: normalizedUserId,
                session,
              },
              newAffinity,
              record.specialRelation || "",
            );
          }
        } catch {
          /* ignore */
        }
      }
      cache.clear(deps.config.scopeId, normalizedUserId);

      const nicknameDisplay = resolved?.nickname || normalizedUserId;
      return `已将 ${nicknameDisplay} (${normalizedUserId}) 加入临时黑名单，时长 ${durationHours} 小时，扣除好感度 ${penalty}。`;
    });

  ctx
    .command(
      buildScopedCommandName(deps.config.scopeId, "tempUnblock") +
        " <userId:string> [platform:string]",
      "解除临时拉黑",
      { authority: 4 },
    )
    .alias("解除临时拉黑")
    .action(async ({ session }, userId, platformArg) => {
      const platform = platformArg || session?.platform;
      if (!platform) return "请指定平台。";
      const normalizedUserId = stripAtPrefix(userId);
      if (!normalizedUserId) return "用户 ID 不能为空。";
      const removed = await blacklist.removeTemporary(
        platform,
        normalizedUserId,
      );
      cache.clear(deps.config.scopeId, normalizedUserId);
      if (removed) {
        let nickname = normalizedUserId;
        if (session) {
          const memberInfo = await fetchMember(
            session as Session,
            normalizedUserId,
          );
          if (memberInfo) {
            const raw = memberInfo as unknown as Record<string, unknown>;
            const card =
              raw.card || (raw.user as Record<string, unknown>)?.card;
            const nick =
              raw.nickname ||
              raw.nick ||
              (raw.user as Record<string, unknown>)?.nickname;
            nickname = String(card || nick || normalizedUserId).trim();
          }
        }
        return `已解除 ${nickname}(${normalizedUserId}) 的临时黑名单。`;
      }
      return `${normalizedUserId} 不在临时黑名单中。`;
    });
}
