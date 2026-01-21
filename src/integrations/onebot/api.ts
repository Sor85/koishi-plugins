/**
 * OneBot API 工具函数
 * 提供 OneBot 平台 API 调用的辅助函数
 */

import type { Session } from 'koishi'

export type OneBotProtocol = 'napcat' | 'llbot'

export interface OneBotInternal {
    _request?: (action: string, params: Record<string, unknown>) => Promise<unknown>
    [key: string]: unknown
}

export function ensureOneBotSession(session: Session | null): {
    error?: string
    session?: Session
    internal?: OneBotInternal
} {
    if (!session) return { error: '缺少会话上下文，无法执行 OneBot 工具。' }
    if (session.platform !== 'onebot') return { error: '该工具仅支持 OneBot 平台。' }
    if (!session.bot) return { error: '当前会话缺少 bot 实例，无法执行工具。' }
    const internal = (session.bot as unknown as { internal?: OneBotInternal }).internal
    if (!internal) return { error: 'Bot 适配器未暴露 OneBot internal 接口。' }
    return { session, internal }
}

export async function callOneBotAPI(
    internal: OneBotInternal,
    action: string,
    params: Record<string, unknown>,
    fallbacks: string[] = []
): Promise<unknown> {
    if (typeof internal._request === 'function') {
        return internal._request(action, params)
    }
    for (const key of fallbacks) {
        if (typeof internal[key] === 'function') {
            return (internal[key] as (params: Record<string, unknown>) => Promise<unknown>)(params)
        }
    }
    throw new Error(`当前 OneBot 适配器不支持 ${action} 接口。`)
}
