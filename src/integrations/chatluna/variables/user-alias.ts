/**
 * 用户自定义昵称变量提供者
 * 为 ChatLuna 提供当前用户的自定义昵称
 */

import type { Session } from "koishi";
import type { UserAliasService } from "../../../services/user-alias/repository";
import { resolveScopedVariableArgs } from "../../../helpers";

interface ProviderConfigurable {
  session?: Session;
}

export interface UserAliasProviderDeps {
  scopeId: string;
  userAlias: UserAliasService;
}

export function createUserAliasProvider(deps: UserAliasProviderDeps) {
  const { scopeId, userAlias } = deps;

  return async (
    args: unknown[] | undefined,
    _variables: unknown,
    configurable?: ProviderConfigurable,
  ): Promise<string> => {
    const session = configurable?.session;
    const platform = session?.platform;
    const resolved = resolveScopedVariableArgs(args);
    const resolvedScopeId = resolved?.scopeId;
    if (!resolvedScopeId || resolvedScopeId !== scopeId) return "";

    const userId = String(
      resolved?.targetUserId || session?.userId || "",
    ).trim();
    if (!platform || !userId) return "";

    const alias = await userAlias.getAlias(platform, userId);
    if (!alias) return "";

    return `id:${userId} customNickname:${alias}`;
  };
}

export type UserAliasProvider = ReturnType<typeof createUserAliasProvider>;
