/**
 * 伪造消息工具
 * 将指定用户 ID 与多条文本组装为节点消息后，通过 OneBot send_forward_msg 发送
 */

import { z } from 'zod'
import { StructuredTool } from '@langchain/core/tools'
import type { LogFn } from '../../../types'
import { ensureOneBotSession, callOneBotAPI, type OneBotProtocol } from '../api'
import { getSession } from '../../chatluna/tools/types'
import { collectNicknameCandidates, fetchMember } from '../../../helpers/member'

export interface FakeMessageToolDeps {
    toolName: string
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

export function createFakeMessageTool(deps: FakeMessageToolDeps) {
    const { toolName, log, protocol } = deps

    // @ts-ignore - Type instantiation depth issue with zod + StructuredTool
    return new (class extends StructuredTool {
        name = toolName || 'send_fake_msg'
        description =
            'Forge messages for one or more users and send as a merged forward. Accepts messages array or senderId + texts. Requires OneBot and send_forward_msg support.'
        schema = z.object({
            messages: z
                .union([
                    z.string(),
                    z.array(
                        z.object({
                            senderId: z.string().optional(),
                            userId: z.string().optional(),
                            id: z.string().optional(),
                            uin: z.string().optional(),
                            senderName: z.string().optional(),
                            name: z.string().optional(),
                            text: z.string().optional(),
                            content: z.string().optional(),
                            msg: z.string().optional()
                        })
                    )
                ])
                .optional()
                .describe(
                    'Optional: array or JSON string of messages. Each item supports senderId/userId and text/content fields.'
                ),
            senderId: z.string().optional().describe('Fallback user ID when messages is not provided.'),
            texts: z.array(z.string().min(1)).optional().describe('Fallback texts when messages is not provided.'),
            senderName: z.string().optional().describe('Display name for the fake sender. Defaults to senderId.'),
            targetGroupId: z
                .string()
                .optional()
                .describe('Target group ID. Defaults to current group if omitted.'),
            groupId: z.string().optional().describe('Alias of targetGroupId.')
        })
            .refine(
                (data) =>
                    Boolean(data.messages) ||
                    (Boolean(data.senderId?.trim()) && Array.isArray(data.texts) && data.texts.length > 0),
                {
                    message: 'Provide messages array/string, or senderId with texts.'
                }
            )

        async _call(
            input: {
                senderId: string
                texts?: string[]
                senderName?: string
                targetGroupId?: string
                groupId?: string
                messages?:
                    | string
                    | {
                          senderId?: string
                          userId?: string
                          id?: string
                          uin?: string
                          senderName?: string
                          name?: string
                          text?: string
                          content?: string
                          msg?: string
                      }[]
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
                    input.groupId?.trim() ||
                    (session.guildId ? String(session.guildId) : '') ||
                    (session.channelId ? String(session.channelId) : '')
                if (!targetGroupId) {
                    return 'Missing targetGroupId. Provide targetGroupId or run inside a group session.'
                }

                const buildForwardContent = (content: string): ForwardContentSegment[] => [{
                    type: 'text',
                    data: { text: content }
                }]

                const buildLegacyNodes = (targets: ForwardNode[]): LegacyForwardNode[] =>
                    targets.map((node) => ({
                        type: 'node' as const,
                        data: {
                            name: node.data.name,
                            uin: node.data.uin,
                            content: node.data.content
                                .map((segment) => segment.data.text || '')
                                .filter(Boolean)
                                .join('')
                        }
                    }))

                const nodes = (() => {
                    const buildNodesFromMessages = (
                        messages:
                            | {
                                  senderId?: string
                                  userId?: string
                                  id?: string
                                  uin?: string
                                  senderName?: string
                                  name?: string
                                  text?: string
                                  content?: string
                                  msg?: string
                              }[]
                    ): ForwardNode[] => {
                        return messages
                            .map((item) => {
                                const senderId =
                                    item.senderId ||
                                    item.userId ||
                                    item.id ||
                                    item.uin ||
                                    item.name ||
                                    ''
                                const content = item.text || item.content || item.msg || ''
                                const displayName = item.senderName || item.name || senderId
                                const uin = senderId.trim()
                                const text = String(content || '').trim()
                                if (!uin || !text) return null
                                return {
                                    type: 'node' as const,
                                    data: {
                                        name: displayName || uin,
                                        uin,
                                        content: buildForwardContent(text)
                                    }
                                }
                            })
                            .filter((v): v is ForwardNode => Boolean(v))
                    }

                    if (input.messages) {
                        let parsed: unknown
                        if (typeof input.messages === 'string') {
                            try {
                                parsed = JSON.parse(input.messages)
                            } catch (error) {
                                throw new Error(`messages parse failed: ${(error as Error).message}`)
                            }
                        } else {
                            parsed = input.messages
                        }

                        if (Array.isArray(parsed)) {
                            const built = buildNodesFromMessages(parsed as never[])
                            if (built.length) return built
                        }
                    }

                    const senderId = input.senderId?.trim() || ''
                    const texts = Array.isArray(input.texts)
                        ? input.texts.map((t) => String(t || '').trim()).filter(Boolean)
                        : []

                    if (!senderId || !texts.length) {
                        return []
                    }

                    const displayName = input.senderName?.trim() || senderId
                    return texts.map((content) => ({
                        type: 'node' as const,
                        data: {
                            name: displayName,
                            uin: senderId,
                            content: buildForwardContent(content)
                        }
                    }))
                })()

                if (!nodes.length) return 'messages is empty or invalid. Provide messages array or senderId + texts.'

                const nameCache = new Map<string, string>()
                const resolveDisplayName = async (uin: string, providedName?: string): Promise<string> => {
                    if (nameCache.has(uin)) return nameCache.get(uin) as string
                    const member = await fetchMember(session, uin)
                    const name =
                        collectNicknameCandidates(member, uin, providedName ? [providedName] : []).shift() ||
                        providedName ||
                        uin
                    nameCache.set(uin, name)
                    return name
                }

                await Promise.all(
                    nodes.map(async (node) => {
                        node.data.name = await resolveDisplayName(node.data.uin, node.data.name)
                    })
                )

                const { error, internal } = ensureOneBotSession(session)
                if (error) return error

                if (protocol === 'llbot') {
                    await callOneBotAPI(
                        internal!,
                        'send_group_forward_msg',
                        { group_id: targetGroupId, messages: nodes },
                        ['sendGroupForwardMsg']
                    )
                } else {
                    const legacyNodes = buildLegacyNodes(nodes)
                    await callOneBotAPI(
                        internal!,
                        'send_forward_msg',
                        { group_id: targetGroupId, messages: legacyNodes },
                        ['sendForwardMsg']
                    )
                }

                const senderSet = Array.from(new Set(nodes.map((n) => n.data.uin || n.data.name).filter(Boolean)))
                const senderLabel = senderSet.length ? senderSet.join(',') : 'unknown'
                const success = `Forged ${nodes.length} messages from ${senderLabel} and forwarded to group ${targetGroupId}.`
                log?.('info', success)
                return success
            } catch (error) {
                log?.('warn', 'send_fake_msg failed', error)
                return `send_fake_msg failed: ${(error as Error).message}`
            }
        }
    })()
}
