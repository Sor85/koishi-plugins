/**
 * scopeId 辅助函数
 * 提供 scopeId 校验、命令名拼接与变量参数解析
 */

const SCOPE_ID_PATTERN = /^[A-Za-z0-9_\-\u4e00-\u9fff]{1,32}$/;

export function normalizeScopeId(value: unknown): string {
  return String(value || "").trim();
}

export function isValidScopeId(value: string): boolean {
  return SCOPE_ID_PATTERN.test(value);
}

export function assertScopeId(value: unknown): string {
  const scopeId = normalizeScopeId(value);
  if (!scopeId) {
    throw new Error("scopeId 不能为空");
  }
  if (!isValidScopeId(scopeId)) {
    throw new Error(
      "scopeId 非法，只允许中文、英文、数字、_、-，长度 1-32，且不能包含 . 或空白",
    );
  }
  return scopeId;
}

export function buildScopedCommandName(
  scopeId: string,
  suffix: string,
): string {
  return `${scopeId}.${suffix}`;
}

export function resolveScopedVariableArgs(args: unknown[] | undefined): {
  scopeId: string;
  targetUserId: string;
} | null {
  const normalizedArgs = Array.isArray(args)
    ? args
    : args === undefined
      ? []
      : [args];
  const [scopeArg, userArg] = normalizedArgs;
  const scopeId = normalizeScopeId(scopeArg);
  if (!scopeId) return null;
  return {
    scopeId,
    targetUserId: String(userArg || "").trim(),
  };
}
