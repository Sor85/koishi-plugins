/**
 * 详情查看命令
 * 查看指定用户的好感度详情
 */

import { h } from "koishi";
import type { Session } from "koishi";
import type { CommandDependencies } from "./types";
import { buildScopedCommandName } from "../helpers";
import { formatTimestamp, stripAtPrefix as stripAt } from "../utils";

export function registerInspectCommand(deps: CommandDependencies) {
  const { ctx, config, store, renders, fetchMember, stripAtPrefix } = deps;

  ctx
    .command(
      buildScopedCommandName(config.scopeId, "inspect") +
        " [targetUserId:string] [platform:string] [image]",
      "查看指定用户的好感度详情",
      { authority: 1 },
    )
    .alias("好感度详情")
    .action(async ({ session }, targetUserArg, platformArg, imageArg) => {
      const platform = platformArg || session?.platform || "";
      const userId = targetUserArg || session?.userId || "";
      const selfId = session?.selfId || "";
      if (!userId) return "请提供用户 ID。";

      const record = await store.load(config.scopeId, userId);
      if (!record) return "未找到好感度记录。";

      const state = store.extractState(record);
      const coefficient =
        state.coefficientState?.coefficient ??
        config.affinityDynamics?.coefficient?.base ??
        1.0;
      const currentCompositeAffinity = Math.round(
        coefficient * state.longTermAffinity,
      );

      const showImpression = config.inspectShowImpression !== false;
      const shouldRenderImage =
        imageArg === undefined
          ? !!config.inspectRenderAsImage
          : !["0", "false", "text", "no", "n"].includes(
              String(imageArg).toLowerCase(),
            );
      const puppeteer = (
        ctx as unknown as { puppeteer?: { page?: () => Promise<unknown> } }
      ).puppeteer;

      let displayNickname = record.nickname || userId;
      if (session) {
        const memberInfo = await fetchMember(session as Session, userId);
        if (memberInfo) {
          const raw = memberInfo as unknown as Record<string, unknown>;
          const card = raw.card || (raw.user as Record<string, unknown>)?.card;
          const nick =
            raw.nickname ||
            raw.nick ||
            (raw.user as Record<string, unknown>)?.nickname ||
            (raw.user as Record<string, unknown>)?.nick;
          const resolved = String(card || nick || "").trim();
          if (resolved) displayNickname = resolved;
        }
      }

      let impression: string | undefined;
      if (showImpression) {
        const analysisService = (
          ctx as unknown as {
            chatluna_group_analysis?: {
              getUserPersona?: (
                platform: string,
                selfId: string,
                userId: string,
              ) => Promise<{ profile: { summary: string } } | null>;
            };
          }
        ).chatluna_group_analysis;
        if (analysisService?.getUserPersona) {
          try {
            const persona = await analysisService.getUserPersona(
              platform,
              selfId,
              stripAtPrefix(userId),
            );
            if (persona?.profile?.summary) {
              impression = persona.profile.summary;
            }
          } catch {
            // ignore
          }
        }
      }

      const displayRelation = record.specialRelation || record.relation || "——";

      const lines = [
        `用户：${displayNickname} ${stripAtPrefix(userId)}`,
        `关系：${displayRelation}`,
        `好感度：${currentCompositeAffinity}`,
        `长期好感度：${state.longTermAffinity}`,
        `短期好感度：${state.shortTermAffinity}`,
        `好感度系数：${coefficient.toFixed(2)}（连续互动 ${state.coefficientState?.streak ?? 0} 天）`,
        `互动统计：总计 ${state.chatCount} 次`,
        `最后互动：${formatTimestamp(state.lastInteractionAt)}`,
        ...(showImpression && impression ? [`印象：${impression}`] : []),
      ];

      if (shouldRenderImage && puppeteer?.page) {
        const rawId = stripAtPrefix(userId);
        const idParts = rawId.split(":");
        const id = idParts.length > 1 ? idParts[1] : idParts[0];
        const numericId = id.match(/^\d+$/) ? id : undefined;
        const avatarUrl = numericId
          ? `https://q1.qlogo.cn/g?b=qq&nk=${numericId}&s=640`
          : undefined;
        const displayPlatform = platform === "onebot" ? "" : platform;

        const buffer = await renders.inspect({
          userId: stripAtPrefix(userId),
          nickname: displayNickname,
          platform: displayPlatform,
          relation: displayRelation,
          compositeAffinity: currentCompositeAffinity,
          longTermAffinity: state.longTermAffinity,
          shortTermAffinity: state.shortTermAffinity,
          coefficient,
          streak: state.coefficientState?.streak ?? 0,
          chatCount: state.chatCount,
          lastInteraction: formatTimestamp(state.lastInteractionAt),
          avatarUrl,
          impression: showImpression ? impression : undefined,
        });
        if (buffer) return h.image(buffer, "image/png");
      }

      return lines.join("\n");
    });
}
