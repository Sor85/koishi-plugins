/**
 * 拉黑与解除拉黑命令
 * 手动管理永久黑名单
 */

import type { Session } from "koishi";
import type { CommandDependencies } from "./types";
import { buildScopedCommandName } from "../helpers";
import type { BlacklistService } from "../services/blacklist/repository";

export interface BlockCommandDeps extends CommandDependencies {
  blacklist: BlacklistService;
}

export function registerBlockCommand(deps: BlockCommandDeps) {
  const {
    ctx,
    cache,
    blacklist,
    resolveUserIdentity,
    stripAtPrefix,
    fetchMember,
    unblockPermanent,
  } = deps;

  ctx
    .command(
      buildScopedCommandName(deps.config.scopeId, "block") +
        " <userId:string> [platform:string]",
      "手动将用户加入黑名单",
      { authority: 4 },
    )
    .option("note", "-n <note:text> 备注信息")
    .alias("拉黑人")
    .action(async ({ session, options }, userId, platformArg) => {
      const platform = platformArg || session?.platform;
      if (!platform) return "请指定平台。";
      const resolved = await resolveUserIdentity(session as Session, userId);
      const normalizedUserId = resolved?.userId || stripAtPrefix(userId);
      if (!normalizedUserId) return "用户 ID 不能为空。";
      if (await blacklist.isBlacklisted(platform, normalizedUserId)) {
        return `${platform}/${normalizedUserId} 已在永久黑名单中。`;
      }
      const note = options?.note || "manual";
      await blacklist.recordPermanent(platform, normalizedUserId, {
        note,
        nickname: resolved?.nickname || normalizedUserId,
      });
      cache.clear(deps.config.scopeId, normalizedUserId);
      const nicknameDisplay = resolved?.nickname || normalizedUserId;
      return `已将 ${nicknameDisplay} (${normalizedUserId}) 加入永久黑名单。`;
    });

  ctx
    .command(
      buildScopedCommandName(deps.config.scopeId, "unblock") +
        " <userId:string> [platform:string]",
      "解除永久黑名单",
      { authority: 4 },
    )
    .alias("解除拉黑")
    .action(async ({ session }, userId, platformArg) => {
      const platform = platformArg || session?.platform;
      if (!platform) return "请指定平台。";
      const normalizedUserId = stripAtPrefix(userId);
      if (!normalizedUserId) return "用户 ID 不能为空。";
      const result = await unblockPermanent({
        source: "command",
        platform,
        userId: normalizedUserId,
        seed: session
          ? {
              scopeId: deps.config.scopeId,
              platform,
              userId: normalizedUserId,
              session: session as Session,
            }
          : {
              scopeId: deps.config.scopeId,
              platform,
              userId: normalizedUserId,
            },
      });
      if (result.removed && result.affinityReset) {
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
        return `已解除 ${nickname}(${normalizedUserId}) 的永久黑名单，并将好感度重置为 ${result.affinity ?? "配置值"}。`;
      }
      return `${normalizedUserId} 不在永久黑名单中，或当前上下文无法完成好感度重置。`;
    });
}
