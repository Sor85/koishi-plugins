/**
 * 戳一戳工具
 * 提供 OneBot 平台的戳一戳功能
 */

import { z } from 'zod'
import { StructuredTool } from '@langchain/core/tools'
import type { Context, Session } from 'koishi'
import type { LogFn } from '../../../types'
import { ensureOneBotSession, type OneBotProtocol } from '../api'
import { getSession } from '../../chatluna/tools/types'

export interface PokeToolDeps {
    ctx: Context
    toolName: string
    protocol: OneBotProtocol
    log?: LogFn
}

export interface SendPokeParams {
    session: Session | null
    userId: string
    groupId?: string
    protocol: OneBotProtocol
    log?: LogFn
}

export async function sendPoke(params: SendPokeParams): Promise<string> {
    try {
        const { session, userId, groupId, log, protocol } = params
        const { error, internal, session: validatedSession } = ensureOneBotSession(session)
        if (error) return error

        const resolvedGroupId =
            groupId?.trim() ||
            (validatedSession as unknown as { guildId?: string })?.guildId ||
            validatedSession?.channelId ||
            (validatedSession as unknown as { roomId?: string })?.roomId

        const payload: Record<string, unknown> = { user_id: userId }
        if (resolvedGroupId) payload.group_id = resolvedGroupId

        if (protocol === 'llbot') {
            const action = payload.group_id ? 'group_poke' : 'friend_poke'
            if (typeof internal!._request === 'function') {
                await internal!._request(action, payload)
            } else if (typeof internal![action] === 'function') {
                await (internal![action] as (p: Record<string, unknown>) => Promise<void>)(payload)
            } else {
                throw new Error(`当前适配器未实现 ${action} API。`)
            }
        } else if (typeof internal!._request === 'function') {
            await internal!._request('send_poke', payload)
        } else if (typeof internal!.sendPoke === 'function') {
            await (internal!.sendPoke as (g: unknown, u: unknown) => Promise<void>)(
                payload.group_id,
                payload.user_id
            )
        } else if (typeof internal!.pokeUser === 'function') {
            await (internal!.pokeUser as (p: Record<string, unknown>) => Promise<void>)(payload)
        } else {
            throw new Error('当前适配器未实现 send_poke API。')
        }

        const location = payload.group_id ? `群 ${payload.group_id}` : '私聊'
        const message = `已在 ${location} 戳了一下 ${payload.user_id}。`
        log?.('info', message)
        return message
    } catch (error) {
        params.log?.('warn', '戳一戳工具执行失败', error)
        return `戳一戳失败：${(error as Error).message}`
    }
}

export function createPokeTool(deps: PokeToolDeps) {
    const { toolName, log, protocol } = deps

    // @ts-expect-error - Type instantiation depth issue with zod + StructuredTool
    return new (class extends StructuredTool {
        name = toolName || 'poke_user'
        description = 'Poke (nudge) a specified user in a group or private conversation.'
        schema = z.object({
            userId: z.string().min(1, 'userId is required').describe('The user ID to poke.'),
            groupId: z
                .string()
                .optional()
                .describe(
                    'Optional: specify a different group ID if the poke should happen in another group.'
                )
        })

        async _call(
            input: { userId: string; groupId?: string },
            _manager?: unknown,
            runnable?: unknown
        ) {
            const session = getSession(runnable)
            return sendPoke({ session, userId: input.userId, groupId: input.groupId, log, protocol })
        }
    })()
}
