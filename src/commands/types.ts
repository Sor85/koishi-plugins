/**
 * 命令模块类型定义
 * 定义命令注册所需的依赖和上下文类型
 */

import type { Context, Session } from "koishi";
import type { Config, LogFn, MemberInfo, SessionSeed } from "../types";
import type { AffinityStore } from "../services/affinity/store";
import type { AffinityCache } from "../types";
import type { RenderService } from "../renders";
import type { UnblockPermanentResult } from "../services/blacklist";

export interface CommandDependencies {
  ctx: Context;
  config: Config;
  log: LogFn;
  store: AffinityStore;
  cache: AffinityCache;
  renders: RenderService;
  fetchMember: (session: Session, userId: string) => Promise<MemberInfo | null>;
  resolveUserIdentity: (
    session: Session,
    input: string,
  ) => Promise<{ userId: string; nickname: string } | null>;
  findMemberByName: (
    session: Session,
    name: string,
  ) => Promise<{ userId: string; nickname: string } | null>;
  fetchGroupMemberIds: (session: Session) => Promise<Set<string> | null>;
  resolveGroupId: (session: Session) => string;
  stripAtPrefix: (text: string) => string;
  unblockPermanent: (input: {
    source: "command" | "xml";
    platform: string;
    userId: string;
    seed?: SessionSeed;
  }) => Promise<UnblockPermanentResult>;
}

export interface RankLineItem {
  name: string;
  relation: string;
  affinity: number;
  userId: string;
}

export interface BlacklistEnrichedItem {
  userId: string;
  nickname: string;
  blockedAt?: string;
  note?: string;
  platform?: string;
}
