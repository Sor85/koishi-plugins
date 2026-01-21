/**
 * 合并转发工具
 * 自动收集最近消息并通过 OneBot send_forward_msg 发送
 */

import { z } from 'zod'
import { StructuredTool } from '@langchain/core/tools'
import type { LogFn } from '../../../types'
import type { MessageStore } from '../../../services/message/store'
import { ensureOneBotSession, callOneBotAPI, type OneBotProtocol } from '../api'
import { getSession } from '../../chatluna/tools/types'

export interface ForwardMessageToolDeps {
    toolName: string
    messageStore: MessageStore
    protocol: OneBotProtocol
    log?: LogFn
}

interface ForwardContentSegment {
    type: string
    data: Record<string, string>
}

interface ForwardNode {
    type: 'node'
    data: {
        name: string
        uin: string
        content: ForwardContentSegment[]
    }
}

interface LegacyForwardNode {
    type: 'node'
    data: {
        name: string
        uin: string
        content: string
    }
}

export function createForwardMessageTool(deps: ForwardMessageToolDeps) {
    const { toolName, messageStore, log, protocol } = deps

    // @ts-ignore - Type instantiation depth issue with zod + StructuredTool
    return new (class extends StructuredTool {
        name = toolName || 'send_forward_msg'
        description =
            'Forward messages as a merged forward to a group. messageIds is required to specify messages to forward. Requires message_id exposure via chatluna-character enableMessageId.'
        schema = z.object({
            messageIds: z
                .array(z.string().min(1))
                .min(1, 'messageIds is required')
                .describe('Required: messageId list to forward (ordered).'),
            targetGroupId: z
                .string()
                .optional()
                .describe('Target group ID. Defaults to current group if omitted.')
        })

        async _call(
            input: {
                messageIds?: string[]
                targetGroupId?: string
            },
            _manager?: unknown,
            runnable?: unknown
        ) {
            try {
                const session = getSession(runnable)
                if (!session) return 'No session context available.'
                if (session.platform !== 'onebot') return 'This tool only supports OneBot platform.'

                const targetGroupId =
                    input.targetGroupId?.trim() ||
                    (session.guildId ? String(session.guildId) : '') ||
                    (session.channelId ? String(session.channelId) : '')

                if (!targetGroupId) {
                    return 'Missing targetGroupId. Provide targetGroupId or run inside a group session.'
                }

                const explicitIds =
                    Array.isArray(input.messageIds) && input.messageIds.length
                        ? input.messageIds.map((id) => id.trim()).filter(Boolean)
                        : []

                let legacyNodes: LegacyForwardNode[]

                if (explicitIds.length > 0) {
                    const found = messageStore.findByIds(session, explicitIds)
                    const map = new Map(found.map((msg) => [msg.messageId, msg]))
                    legacyNodes = explicitIds
                        .map((id) => {
                            const hit = map.get(id)
                            if (!hit) return null
                            return {
                                type: 'node' as const,
                                data: {
                                    name: hit.username || hit.userId || '未知用户',
                                    uin: hit.userId || session.userId || '',
                                    content: String(hit.content || '')
                                }
                            }
                        })
                        .filter((item): item is LegacyForwardNode => item !== null)

                    if (!legacyNodes.length) {
                        return 'No messages found for provided messageIds.'
                    }
                } else {
                    return 'messageIds is required.'
                }

                const { error, internal } = ensureOneBotSession(session)
                if (error) return error

                if (protocol === 'llbot') {
                    const llbotNodes: ForwardNode[] = legacyNodes.map((node) => ({
                        type: 'node' as const,
                        data: {
                            name: node.data.name,
                            uin: node.data.uin,
                            content: [{ type: 'text', data: { text: node.data.content } }]
                        }
                    }))
                    await callOneBotAPI(
                        internal!,
                        'send_group_forward_msg',
                        { group_id: targetGroupId, messages: llbotNodes },
                        ['sendGroupForwardMsg']
                    )
                } else {
                    await callOneBotAPI(
                        internal!,
                        'send_forward_msg',
                        { group_id: targetGroupId, messages: legacyNodes },
                        ['sendForwardMsg']
                    )
                }

                const success = `Forwarded ${legacyNodes.length} messages to group ${targetGroupId}.`
                log?.('info', success)
                return success
            } catch (error) {
                log?.('warn', 'send_forward_msg failed', error)
                return `send_forward_msg failed: ${(error as Error).message}`
            }
        }
    })()
}
