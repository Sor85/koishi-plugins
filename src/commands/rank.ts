/**
 * 排行榜命令
 * 查看好感度排行榜
 */

import { h } from "koishi";
import type { Session } from "koishi";
import type { CommandDependencies } from "./types";
import { buildScopedCommandName } from "../helpers";
import { MODEL_NAME_V2 } from "../models";

export function registerRankCommand(deps: CommandDependencies) {
  const {
    ctx,
    config,
    renders,
    fetchGroupMemberIds,
    resolveUserIdentity,
    resolveGroupId,
    stripAtPrefix,
  } = deps;

  ctx
    .command(
      buildScopedCommandName(config.scopeId, "rank") +
        " [limit:number] [image]",
      "查看当前好感度排行",
      {
        authority: 1,
      },
    )
    .alias("好感度排行")
    .action(async ({ session }, limitArg, imageArg) => {
      const parsedLimit = Number(limitArg);
      const limit = Math.max(
        1,
        Math.min(
          Number.isFinite(parsedLimit) ? parsedLimit : config.rankDefaultLimit,
          50,
        ),
      );
      const groupId = resolveGroupId(session as Session);
      const shouldRenderImage =
        imageArg === undefined
          ? !!config.rankRenderAsImage
          : !["0", "false", "text", "no", "n"].includes(
              String(imageArg).toLowerCase(),
            );
      const puppeteer = (
        ctx as unknown as { puppeteer?: { page?: () => Promise<unknown> } }
      ).puppeteer;
      if (shouldRenderImage && !puppeteer?.page) {
        return "当前环境未启用 puppeteer，已改为文本模式。";
      }

      type AffinityRow = {
        userId: string;
        nickname: string | null;
        relation: string | null;
        specialRelation: string | null;
        affinity: number;
      };

      let scopedRows: AffinityRow[] = [];

      if (groupId) {
        const memberIds = await fetchGroupMemberIds(session as Session);
        if (!memberIds || memberIds.size === 0) {
          return "无法获取本群成员列表，暂时无法展示排行。";
        }

        const rows = await ctx.database
          .select(MODEL_NAME_V2)
          .where({ scopeId: config.scopeId })
          .orderBy("affinity", "desc")
          .execute();

        scopedRows = rows
          .filter((row) => memberIds.has(stripAtPrefix(row.userId)))
          .slice(0, limit) as AffinityRow[];

        if (!scopedRows.length) return "本群暂无好感度记录。";
      } else {
        const rows = await ctx.database
          .select(MODEL_NAME_V2)
          .where({ scopeId: config.scopeId })
          .orderBy("affinity", "desc")
          .limit(limit)
          .execute();
        if (!rows.length) return "当前暂无好感度记录。";
        scopedRows = rows as AffinityRow[];
      }

      const lines = await Promise.all(
        scopedRows.map(async (row) => {
          let name = row.nickname || row.userId;
          if (groupId) {
            const resolved = await resolveUserIdentity(
              session as Session,
              row.userId,
            );
            if (resolved?.nickname && resolved.nickname !== row.userId) {
              name = resolved.nickname;
            }
          }
          return {
            name,
            relation: row.specialRelation || row.relation || "——",
            affinity: row.affinity,
            userId: row.userId,
          };
        }),
      );

      const textLines = [
        "群昵称 关系 好感度",
        ...lines.map(
          (item, index) =>
            `${index + 1}. ${item.name} ${item.relation} ${item.affinity}`,
        ),
      ];

      if (shouldRenderImage) {
        const rankItems = lines.map((item, index) => {
          const rawId = stripAtPrefix(item.userId);
          const idParts = rawId.split(":");
          const id = idParts.length > 1 ? idParts[1] : idParts[0];
          const numericId = id.match(/^\d+$/) ? id : undefined;
          const avatarUrl = numericId
            ? `https://q1.qlogo.cn/g?b=qq&nk=${numericId}&s=640`
            : undefined;

          return {
            rank: index + 1,
            name: item.name,
            relation: item.relation,
            affinity: item.affinity,
            avatarUrl,
          };
        });

        const buffer = await renders.rankList("好感度排行", rankItems);
        if (buffer) return h.image(buffer, "image/png");
        return textLines.join("\n");
      }
      return textLines.join("\n");
    });
}
