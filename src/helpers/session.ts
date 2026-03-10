/**
 * Session 辅助函数
 * 提供从 Koishi Session 对象中安全提取常用信息的工具
 */

import type { Session } from "koishi";

interface SessionLike {
  channelId?: string;
  guildId?: string;
  groupId?: string;
  roomId?: string;
  platform?: string;
  userId?: string;
  selfId?: string;
  event?: {
    channel?: { id?: string };
    guild?: { id?: string };
    group?: { id?: string };
    platform?: string;
    user?: { id?: string };
    selfId?: string;
  };
  bot?: {
    platform?: string;
    selfId?: string;
  };
}

export function getChannelId(
  session: Session | SessionLike | null | undefined,
): string {
  if (!session) return "";
  const s = session as SessionLike;
  return (
    s.guildId ||
    s.groupId ||
    s.channelId ||
    s.event?.guild?.id ||
    s.event?.group?.id ||
    s.event?.channel?.id ||
    s.roomId ||
    ""
  );
}

export function getGuildId(
  session: Session | SessionLike | null | undefined,
): string {
  if (!session) return "";
  const s = session as SessionLike;
  return s.guildId || s.event?.guild?.id || "";
}

export function getPlatform(
  session: Session | SessionLike | null | undefined,
): string {
  if (!session) return "";
  const s = session as SessionLike;
  return s.platform || s.event?.platform || s.bot?.platform || "";
}

export function getUserId(
  session: Session | SessionLike | null | undefined,
): string {
  if (!session) return "";
  const s = session as SessionLike;
  return s.userId || s.event?.user?.id || "";
}

export function getSelfId(
  session: Session | SessionLike | null | undefined,
): string {
  if (!session) return "";
  const s = session as SessionLike;
  return s.selfId || s.event?.selfId || s.bot?.selfId || "";
}

export function makeUserKey(platform: string, userId: string): string {
  return `${platform || "unknown"}:${userId || "anonymous"}`;
}
