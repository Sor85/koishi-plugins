/**
 * 黑名单列表命令
 * 查看永久黑名单和临时黑名单
 */

import { h } from "koishi";
import type { Session } from "koishi";
import type { CommandDependencies, BlacklistEnrichedItem } from "./types";
import { buildScopedCommandName } from "../helpers";
import type { BlacklistService } from "../services/blacklist/repository";

export interface BlacklistCommandDeps extends CommandDependencies {
  blacklist: BlacklistService;
}

interface MergedBlacklistEntry {
  userId: string;
  nickname?: string;
  blockedAt?: string;
  note?: string;
  isTemp: boolean;
  expiresAt?: string;
  durationHours?: number;
  penalty?: number;
}

async function enrichBlacklistRecords(
  records: MergedBlacklistEntry[],
  session: Session,
  deps: BlacklistCommandDeps,
): Promise<
  (BlacklistEnrichedItem & {
    isTemp: boolean;
    expiresAt?: string;
    durationHours?: number;
    penalty?: number;
  })[]
> {
  const { resolveUserIdentity, stripAtPrefix } = deps;
  return Promise.all(
    records.map(async (entry) => {
      const sanitizedId = stripAtPrefix(entry?.userId);
      let nickname = stripAtPrefix(entry?.nickname || "");
      let userId = sanitizedId;
      if (!nickname || nickname === sanitizedId) {
        const resolved = await resolveUserIdentity(session, sanitizedId);
        if (resolved) {
          userId = resolved.userId || sanitizedId;
          nickname = resolved.nickname || sanitizedId;
        }
      }
      return { ...entry, userId, nickname };
    }),
  );
}

export function registerBlacklistCommand(deps: BlacklistCommandDeps) {
  const {
    ctx,
    config,
    renders,
    blacklist,
    stripAtPrefix,
    fetchGroupMemberIds,
    resolveGroupId,
  } = deps;

  ctx
    .command(
      buildScopedCommandName(config.scopeId, "blacklist") +
        " [limit:number] [platform:string] [image]",
      "查看黑名单列表",
      { authority: 2 },
    )
    .alias("黑名单")
    .action(async ({ session }, limitArg, platformArg, imageArg) => {
      const parsedLimit = Number(limitArg);
      const limit = Math.max(
        1,
        Math.min(
          Number.isFinite(parsedLimit)
            ? parsedLimit
            : config.blacklistDefaultLimit,
          100,
        ),
      );
      const shouldRenderImage =
        imageArg === undefined
          ? !!config.blacklistRenderAsImage
          : !["0", "false", "text", "no", "n"].includes(
              String(imageArg).toLowerCase(),
            );
      const puppeteer = (
        ctx as unknown as { puppeteer?: { page?: () => Promise<unknown> } }
      ).puppeteer;
      if (shouldRenderImage && !puppeteer?.page)
        return "当前环境未启用 puppeteer，已改为文本模式。";

      const platform = platformArg || session?.platform;
      const groupId = session ? resolveGroupId(session as Session) : "";
      const memberIds =
        groupId && session
          ? await fetchGroupMemberIds(session as Session)
          : null;

      if (groupId && (!memberIds || memberIds.size === 0)) {
        return "无法获取本群成员列表，暂时无法展示黑名单。";
      }

      const permanentRecords = await blacklist.listPermanent(platform);
      const tempRecords = await blacklist.listTemporary(platform);

      const merged: MergedBlacklistEntry[] = [
        ...permanentRecords
          .filter((r) => !memberIds || memberIds.has(stripAtPrefix(r.userId)))
          .map((r) => ({ ...r, isTemp: false as const })),
        ...tempRecords
          .filter((r) => !memberIds || memberIds.has(stripAtPrefix(r.userId)))
          .map((r) => ({
            userId: r.userId,
            nickname: r.nickname,
            blockedAt: r.blockedAt,
            note: r.note,
            isTemp: true as const,
            expiresAt: r.expiresAt,
            durationHours: Number(r.durationHours) || undefined,
            penalty: Number(r.penalty) || undefined,
          })),
      ];

      if (!merged.length) return "当前暂无拉黑记录。";

      const limited = merged.slice(0, limit);
      const enriched = await enrichBlacklistRecords(
        limited,
        session as Session,
        deps,
      );
      const textLines = [
        "# 昵称 用户ID 类型 时间 备注",
        ...enriched.map((item, index) => {
          const note = item.note ? item.note : "——";
          const time = item.isTemp
            ? item.expiresAt || "——"
            : item.blockedAt || "——";
          const nickname = stripAtPrefix(item.nickname || item.userId);
          const userIdDisplay = stripAtPrefix(item.userId);
          const tag = item.isTemp ? "[临时]" : "[永久]";
          return `${index + 1}. ${nickname} ${userIdDisplay} ${tag} ${time} ${note}`;
        }),
      ];

      if (shouldRenderImage) {
        const items = enriched.map((item, index) => ({
          index: index + 1,
          nickname: stripAtPrefix(item.nickname || item.userId),
          userId: stripAtPrefix(item.userId),
          timeInfo: item.isTemp
            ? `到期: ${item.expiresAt || "——"}`
            : item.blockedAt || "——",
          note: item.note || "——",
          isTemp: item.isTemp,
          penalty: item.penalty,
          tag: item.isTemp ? "临时" : "永久",
          avatarUrl: (() => {
            const rawId = stripAtPrefix(item.userId);
            const numericId = rawId.match(/^\d+$/) ? rawId : undefined;
            return numericId
              ? `https://q1.qlogo.cn/g?b=qq&nk=${numericId}&s=640`
              : undefined;
          })(),
        }));
        const buffer = await renders.blacklist("黑名单", items);
        if (buffer) return h.image(buffer, "image/png");
        return textLines.join("\n");
      }

      return textLines.join("\n");
    });
}
