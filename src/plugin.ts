/**
 * 插件主逻辑
 * 组装所有模块并初始化插件功能
 */

import * as path from 'path'
import { Context, Session } from 'koishi'
import { ChatLunaPlugin } from 'koishi-plugin-chatluna/services/chat'
import { getMessageContent } from 'koishi-plugin-chatluna/utils/string'

import type { Config, LogFn } from './types'
import { BASE_AFFINITY_DEFAULTS } from './constants'
import { registerModels } from './models'
import { createLogger } from './helpers'
import { stripAtPrefix, renderTemplate, formatTimestamp } from './utils'
import { createAffinityStore } from './services/affinity/store'
import { createAffinityCache } from './services/affinity/cache'
import { resolveShortTermConfig, resolveActionWindowConfig } from './services/affinity/calculator'
import { applyAffinityDelta } from './services/affinity/apply-delta'
import { createMessageHistory } from './services/message/history'
import { createMessageStore } from './services/message/store'
import { createPermanentBlacklistManager } from './services/blacklist/permanent'
import { createTemporaryBlacklistManager } from './services/blacklist/temporary'
import { createBlacklistGuard } from './services/blacklist/guard'
import { createLevelResolver } from './services/relationship/level-resolver'
import { createManualRelationshipManager } from './services/relationship/manual-config'
import { createScheduleManager } from './services/schedule'
import { createRenderService } from './renders'
import {
    createAffinityProvider,
    createRelationshipProvider,
    createRelationshipLevelProvider,
    createContextAffinityProvider,
    createUserInfoProvider,
    createBotInfoProvider,
    createGroupInfoProvider,
    createRandomProvider,
    createWeatherProvider
} from './integrations/chatluna/variables'
import { createWeatherApi } from './services/weather'
import {
    createAffinityTool,
    createRelationshipTool,
    createBlacklistTool,
    createWeatherTool
} from './integrations/chatluna/tools'
import { createPokeTool, sendPoke } from './integrations/onebot/tools/poke'
import type { OneBotProtocol } from './integrations/onebot'
import { createSetProfileTool } from './integrations/onebot/tools/profile'
import { createSetGroupCardTool } from './integrations/onebot/tools/set-group-card'
import { createSetMsgEmojiTool, sendMsgEmoji } from './integrations/onebot/tools/set-msg-emoji'
import { createFakeMessageTool } from './integrations/onebot/tools/send-fake-msg'
import { createForwardMessageTool } from './integrations/onebot/tools/send-forward-msg'
import { createDeleteMessageTool, sendDeleteMessage } from './integrations/onebot/tools/delete-msg'
import {
    registerRankCommand,
    registerInspectCommand,
    registerBlacklistCommand,
    registerBlockCommand,
    registerTempBlockCommand,
    registerGroupListCommand,
    registerClearAllCommand,
    registerAdjustCommand,
    registerEnabledListCommands
} from './commands'
import {
    fetchMember,
    resolveUserIdentity,
    findMemberByName,
    fetchGroupMemberIds,
    fetchGroupList,
    resolveGroupId
} from './helpers/member'

const BASE_KEYS = Object.keys(BASE_AFFINITY_DEFAULTS)

function normalizeBaseAffinityConfig(config: Config): void {
    const base = { ...BASE_AFFINITY_DEFAULTS, ...(config.baseAffinityConfig || {}) }
    for (const key of BASE_KEYS) {
        const legacy = (config as unknown as Record<string, unknown>)[key]
        if (legacy !== undefined && legacy !== null) {
            const numeric = Number(legacy)
            if (Number.isFinite(numeric)) (base as Record<string, number>)[key] = numeric
        }
    }
    config.baseAffinityConfig = base
    for (const key of BASE_KEYS) {
        if (Object.prototype.hasOwnProperty.call(config, key))
            delete (config as unknown as Record<string, unknown>)[key]
        Object.defineProperty(config, key, {
            configurable: true,
            enumerable: true,
            get() {
                const target = (config.baseAffinityConfig as unknown as Record<string, number>)?.[key]
                return Number.isFinite(target)
                    ? target
                    : (BASE_AFFINITY_DEFAULTS as unknown as Record<string, number>)[key]
            },
            set(value: number) {
                if (!config.baseAffinityConfig)
                    config.baseAffinityConfig = { ...BASE_AFFINITY_DEFAULTS }
                ;(config.baseAffinityConfig as unknown as Record<string, number>)[key] = value
            }
        })
    }
}

export function apply(ctx: Context, config: Config): void {
    normalizeBaseAffinityConfig(config)
    registerModels(ctx)

    // @ts-expect-error - Config type compatibility with ChatLunaPlugin
    const plugin = new ChatLunaPlugin(ctx, config, 'affinity', false)

    ctx.inject(['console'], (innerCtx) => {
        const consoleService = (
            innerCtx as unknown as { console?: { addEntry?: (entry: unknown) => void } }
        ).console
        consoleService?.addEntry?.({
            dev: path.resolve(__dirname, '../client/index.ts'),
            prod: path.resolve(__dirname, '../dist')
        })
    })

    const log = createLogger(ctx, config)

    const resolveOneBotProtocol = (): OneBotProtocol => {
        if (config.enableNapCatProtocol && config.enableLlbotProtocol) {
            log('warn', 'NapCat 与 LLBot 协议同时启用，将优先使用 LLBot。')
            return 'llbot'
        }
        if (config.enableLlbotProtocol) return 'llbot'
        if (config.enableNapCatProtocol) return 'napcat'
        log('warn', '未启用 OneBot 协议选项，默认使用 NapCat。')
        return 'napcat'
    }

    const onebotProtocol = resolveOneBotProtocol()

    log('warn', '⚠️ 升级提示：0.2.1-alpha.10 版本后数据库结构已重构，若出现数据库相关错误，请执行 affinity.clearall 命令清除数据后重试。好感度分析提示词与日程生成提示词已更新，若您自定义过提示词，请将其恢复默认以应用最新版本。')
    const cache = createAffinityCache()
    const store = createAffinityStore({ ctx, config, log })
    const shortTermConfig = resolveShortTermConfig(config)
    const actionWindowConfig = resolveActionWindowConfig(config)
    const history = createMessageHistory({ ctx, config, log })
    const messageStore = createMessageStore({ ctx, log, limit: 100 })
    const levelResolver = createLevelResolver(config)
    const manualRelationship = createManualRelationshipManager({
        ctx,
        config,
        log,
        applyConfigUpdate: () => {
            ctx.scope.update(config, false)
        }
    })
    const permanentBlacklist = createPermanentBlacklistManager({
        config,
        log,
        applyConfigUpdate: () => {
            ctx.scope.update(config, false)
        }
    })

    const shortTermCfg = config.shortTermBlacklist || {}
    const shortTermOptions = {
        enabled: Boolean(shortTermCfg.enabled),
        windowHours: Math.max(1, Number.isFinite(shortTermCfg.windowHours) ? shortTermCfg.windowHours! : 24),
        windowMs: 0,
        decreaseThreshold: Math.max(1, Number.isFinite(shortTermCfg.decreaseThreshold) ? shortTermCfg.decreaseThreshold! : 15),
        durationHours: Math.max(1, Number.isFinite(shortTermCfg.durationHours) ? shortTermCfg.durationHours! : 12),
        durationMs: 0,
        penalty: Math.max(0, Number.isFinite(shortTermCfg.penalty) ? shortTermCfg.penalty! : 5)
    }
    shortTermOptions.windowMs = shortTermOptions.windowHours * 3600 * 1000
    shortTermOptions.durationMs = shortTermOptions.durationHours * 3600 * 1000

    const temporaryBlacklist = createTemporaryBlacklistManager({
        config,
        shortTermOptions,
        log,
        applyConfigUpdate: () => {
            ctx.scope.update(config, false)
        }
    })
    const renders = createRenderService({ ctx, log })

    const weatherConfig = config.weather || {
        enabled: false,
        variableName: 'weather',
        apiToken: '',
        searchType: 'city' as const,
        cityName: '',
        hourlyRefresh: false,
        registerTool: false,
        toolName: 'get_weather'
    }
    const weatherApi = createWeatherApi({ ctx, weatherConfig, log })

    const resolveSchedulePersonaPreset = (_session?: Session): string => {
        const scheduleCfg = config.schedule || {}
        const source = scheduleCfg.personaSource || 'none'
        const chatluna = (
            ctx as unknown as {
                chatluna?: {
                    preset?: { getPreset?: (name: string) => { value?: unknown } }
                    personaPrompt?: string
                }
            }
        ).chatluna

        if (source === 'chatluna') {
            let presetName = String(scheduleCfg.personaChatlunaPreset ?? '').trim()
            if (presetName === '无') presetName = ''
            if (presetName) {
                const presetRef = chatluna?.preset?.getPreset?.(presetName)
                const presetValue = presetRef?.value
                if (typeof presetValue === 'string') return presetValue
                const rawText = (presetValue as { rawText?: string })?.rawText
                if (typeof rawText === 'string') return rawText
                const configPrompt = (presetValue as { config?: { prompt?: string } })?.config?.prompt
                if (typeof configPrompt === 'string') return configPrompt
            }
            return chatluna?.personaPrompt || ''
        }

        if (source === 'custom') {
            return String(scheduleCfg.personaCustomPreset ?? '').trim()
        }

        return ''
    }

    let scheduleModelRef: { value?: unknown } | unknown
    let defaultModelRef: { value?: unknown } | unknown

    const scheduleManager = createScheduleManager(ctx, config, {
        getModel: () =>
            (scheduleModelRef as { value?: unknown })?.value ??
            scheduleModelRef ??
            (defaultModelRef as { value?: unknown })?.value ??
            defaultModelRef ??
            null,
        getMessageContent: getMessageContent as (content: unknown) => string,
        resolvePersonaPreset: () => resolveSchedulePersonaPreset(),
        getWeatherText: () => weatherApi.getDailyWeather(),
        renderSchedule: renders.schedule,
        log
    })
    scheduleManager.registerCommand()

    ctx.accept(
        ['relationships'],
        () => {
            manualRelationship
                .syncToDatabase()
                .catch((error) => log('warn', '同步特殊关系配置到数据库失败', error))
        },
        { passive: true }
    )

    const blacklistGuard = createBlacklistGuard({
        config,
        permanent: permanentBlacklist,
        temporary: temporaryBlacklist,
        log
    })
    ctx.middleware(blacklistGuard.middleware as Parameters<typeof ctx.middleware>[0], true)

    let rawModelResponseGuildId: string | null = null
    const rawModelResponseSessionMap = new Map<string, Session>()
    let lastCharacterSession: Session | null = null
    let rawInterceptorRetryHandle: (() => void) | null = null

    const initRawModelInterceptor = (): boolean => {
        const characterService = (
            ctx as unknown as {
                chatluna_character?: {
                    collect?: (callback: (session: Session) => Promise<void>) => void
                    logger?: {
                        debug: (...args: unknown[]) => void
                    }
                }
            }
        ).chatluna_character
        if (!characterService) return false

        characterService.collect?.(async (session: Session) => {
            const guildId =
                (session as unknown as { guildId?: string })?.guildId ||
                session?.channelId ||
                session?.userId ||
                null
            rawModelResponseGuildId = guildId
            if (guildId) rawModelResponseSessionMap.set(guildId, session)
            lastCharacterSession = session
        })

        const characterLogger = characterService.logger
        if (!characterLogger || typeof characterLogger.debug !== 'function') return false

        const originalDebug = characterLogger.debug.bind(characterLogger)
        characterLogger.debug = (...args: unknown[]) => {
            originalDebug(...args)
            const message = args[0]
            if (typeof message === 'string' && message.startsWith('model response: ')) {
                const response = message.substring('model response: '.length)
                if (!rawModelResponseGuildId || !response) return
                if (config.debugLogging) {
                    log('debug', '拦截到原始输出', {
                        guildId: rawModelResponseGuildId,
                        length: response.length
                    })
                }

                const affinityMatches = Array.from(
                    response.matchAll(/<affinity\s+delta="([^"]+)"\s+action="(increase|decrease)"\s+id="([^"]+)"\s*\/>/gi)
                )
                if (config.affinityEnabled && affinityMatches.length) {
                    const session =
                        rawModelResponseSessionMap.get(rawModelResponseGuildId) ||
                        lastCharacterSession ||
                        null
                    if (session) {
                        for (const match of affinityMatches) {
                            const delta = parseInt(String(match[1] || '0').trim(), 10)
                            const action = String(match[2] || 'increase').trim().toLowerCase() as 'increase' | 'decrease'
                            const userId = String(match[3] || '').trim()
                            if (!isNaN(delta) && delta > 0 && userId) {
                                void applyAffinityDelta({
                                    session,
                                    userId,
                                    delta,
                                    action,
                                    store: {
                                        ensureForUser: store.ensureForUser,
                                        save: store.save as (seed: { platform: string; userId: string; selfId?: string; session?: Session }, value: number, relation: string, extra?: Record<string, unknown>) => Promise<unknown>,
                                        clamp: store.clamp
                                    },
                                    levelResolver: { resolveLevelByAffinity: levelResolver.resolveLevelByAffinity },
                                    maxIncrease: config.maxIncreasePerMessage || 5,
                                    maxDecrease: config.maxDecreasePerMessage || 3,
                                    maxActionEntries: actionWindowConfig.maxEntries,
                                    shortTermConfig,
                                    log
                                })
                            }
                        }
                    } else {
                        log('warn', '检测到好感度标记但缺少会话上下文', {
                            guildId: rawModelResponseGuildId
                        })
                    }
                }

                if (config.enablePokeXmlTool) {
                    const pokeMatches = Array.from(
                        response.matchAll(/<poke\s+id="([^"]+)"\s*\/>/gi)
                    )
                    if (pokeMatches.length) {
                        const targetIds = Array.from(
                            new Set(pokeMatches.map((match) => String(match[1] || '').trim()).filter(Boolean))
                        )
                        const session = rawModelResponseSessionMap.get(rawModelResponseGuildId) || null
                        if (session && targetIds.length) {
                            for (const userId of targetIds) {
                                void sendPoke({ session, userId, log, protocol: onebotProtocol })
                            }
                        } else if (targetIds.length) {
                            log('warn', '检测到戳一戳标记但缺少会话上下文', {
                                guildId: rawModelResponseGuildId
                            })
                        }
                    }
                }

                if (config.enableEmojiXmlTool) {
                    const emojiMatches = Array.from(
                        response.matchAll(
                            /<emoji\s+message_id="([^"]+)"\s+emoji_id="([^"]+)"\s*\/>/gi
                        )
                    )
                    if (emojiMatches.length) {
                        const session = rawModelResponseSessionMap.get(rawModelResponseGuildId) || null
                        if (session) {
                            for (const match of emojiMatches) {
                                const messageId = String(match[1] || '').trim()
                                const emojiId = String(match[2] || '').trim()
                                if (messageId && emojiId) {
                                    void sendMsgEmoji({
                                        session,
                                        messageId,
                                        emojiId,
                                        log,
                                        protocol: onebotProtocol
                                    })
                                }
                            }
                        } else {
                            log('warn', '检测到表情标记但缺少会话上下文', {
                                guildId: rawModelResponseGuildId
                            })
                        }
                    }
                }

                if (config.enableDeleteXmlTool) {
                    const deleteMatches = Array.from(
                        response.matchAll(/<delete\s+message_id="([^"]+)"\s*\/?>/gi)
                    )
                    if (deleteMatches.length) {
                        const session =
                            rawModelResponseSessionMap.get(rawModelResponseGuildId) ||
                            lastCharacterSession ||
                            null
                        if (session) {
                            const ids = Array.from(
                                new Set(
                                    deleteMatches
                                        .map((match) => String(match[1] || '').trim())
                                        .filter(Boolean)
                                )
                            )
                            for (const messageId of ids) {
                                void sendDeleteMessage({ session, messageId, log })
                            }
                        } else {
                            log('warn', '检测到撤回标记但缺少会话上下文', {
                                guildId: rawModelResponseGuildId
                            })
                        }
                    }
                }
            }
        }
        ctx.on('dispose', () => {
            characterLogger.debug = originalDebug
        })
        return true
    }

    const startRawInterceptorRetry = (): void => {
        if (rawInterceptorRetryHandle) return
        rawInterceptorRetryHandle = ctx.setInterval(() => {
            log('info', '原始输出拦截重试中...')
            if (initRawModelInterceptor()) {
                log('info', '原始输出拦截重试成功')
                if (rawInterceptorRetryHandle) {
                    rawInterceptorRetryHandle()
                    rawInterceptorRetryHandle = null
                }
            }
        }, 10 * 60 * 1000)
    }

    const startDelay = 3000
    log('debug', `原始输出拦截将在 ${startDelay}ms 后启动`)
    ctx.setTimeout(() => {
        if (initRawModelInterceptor()) {
            log('info', '已启用原始输出拦截模式')
        } else {
            log('warn', 'chatluna_character 服务不可用，将每10分钟重试一次')
            startRawInterceptorRetry()
        }
    }, startDelay)


    const fetchMemberBound = (session: Session, userId: string) => fetchMember(session, userId)
    const resolveUserIdentityBound = (session: Session, input: string) =>
        resolveUserIdentity(session, input)
    const findMemberByNameBound = (session: Session, name: string) =>
        findMemberByName(session, name, log)
    const fetchGroupMemberIdsBound = (session: Session) => fetchGroupMemberIds(session, log)
    const fetchGroupListBound = (session: Session) => fetchGroupList(session, log)

    const commandDeps = {
        ctx,
        config,
        log,
        store,
        cache,
        renders,
        fetchMember: fetchMemberBound,
        resolveUserIdentity: resolveUserIdentityBound,
        findMemberByName: findMemberByNameBound,
        fetchGroupMemberIds: fetchGroupMemberIdsBound,
        fetchGroupList: fetchGroupListBound,
        resolveGroupId,
        stripAtPrefix
    }

    registerRankCommand(commandDeps)
    registerInspectCommand(commandDeps)
    registerAdjustCommand(commandDeps)
    registerBlacklistCommand({ ...commandDeps, permanentBlacklist, temporaryBlacklist })
    registerBlockCommand({ ...commandDeps, permanentBlacklist })
    registerTempBlockCommand({ ...commandDeps, temporaryBlacklist })
    registerGroupListCommand(commandDeps)
    registerClearAllCommand(commandDeps)
    registerEnabledListCommands(commandDeps)

    const initializeServices = async () => {
        log('info', '插件初始化开始...')

        try {
            await manualRelationship.syncToDatabase()
        } catch (error) {
            log('warn', '同步特殊关系配置到数据库失败', error)
        }

        const chatlunaService = (
            ctx as unknown as {
                chatluna?: {
                    createChatModel?: (model: string) => Promise<unknown>
                    config?: { defaultModel?: string }
                    promptRenderer?: {
                        registerFunctionProvider?: (name: string, provider: unknown) => void
                    }
                }
            }
        ).chatluna

        const scheduleModelName = String(config.schedule?.model || '').trim()

        if (scheduleModelName) {
            try {
                scheduleModelRef = await chatlunaService?.createChatModel?.(scheduleModelName)
            } catch (error) {
                log('warn', `日程模型 ${scheduleModelName} 初始化失败`, error)
            }
        }

        try {
            defaultModelRef = await chatlunaService?.createChatModel?.(
                chatlunaService?.config?.defaultModel || ''
            )
        } catch (error) {
            log('warn', '默认模型初始化失败', error)
        }

        const promptRenderer = chatlunaService?.promptRenderer

        const affinityProvider = createAffinityProvider({ cache, store })
        promptRenderer?.registerFunctionProvider?.(config.affinityVariableName, affinityProvider)
        log('info', `好感度变量已注册: ${config.affinityVariableName}`)

        const relationshipProvider = createRelationshipProvider({ store })
        promptRenderer?.registerFunctionProvider?.(
            config.relationshipVariableName,
            relationshipProvider
        )
        log('info', `关系变量已注册: ${config.relationshipVariableName}`)

        const relationshipLevelName = String(
            config.relationshipAffinityLevelVariableName || 'relationshipAffinityLevel'
        ).trim()
        if (relationshipLevelName) {
            const relationshipLevelProvider = createRelationshipLevelProvider({ store, config })
            promptRenderer?.registerFunctionProvider?.(
                relationshipLevelName,
                relationshipLevelProvider
            )
            log('info', `好感度区间变量已注册: ${relationshipLevelName}`)
        }

        const overviewName = String(
            config.contextAffinityOverview?.variableName || 'contextAffinity'
        ).trim()
        if (overviewName) {
            const contextAffinityProvider = createContextAffinityProvider({
                config,
                store,
                fetchEntries: history.fetchEntries.bind(history)
            })
            promptRenderer?.registerFunctionProvider?.(overviewName, contextAffinityProvider)
            log('info', `上下文好感度变量已注册: ${overviewName}`)
        }

        const userInfoProvider = createUserInfoProvider({
            config,
            log,
            fetchMember: fetchMemberBound
        })
        const userInfoName = String(
            config.userInfo?.variableName || config.otherVariables?.userInfo?.variableName || 'userInfo'
        ).trim()
        if (userInfoName) {
            promptRenderer?.registerFunctionProvider?.(userInfoName, userInfoProvider)
            log('info', `用户信息变量已注册: ${userInfoName}`)
        }

        const botInfoProvider = createBotInfoProvider({
            config,
            log,
            fetchMember: fetchMemberBound
        })
        const botInfoName = String(
            config.botInfo?.variableName || config.otherVariables?.botInfo?.variableName || 'botInfo'
        ).trim()
        if (botInfoName) {
            promptRenderer?.registerFunctionProvider?.(botInfoName, botInfoProvider)
            log('info', `Bot信息变量已注册: ${botInfoName}`)
        }

        const groupInfoProvider = createGroupInfoProvider({
            config,
            log,
            fetchGroupList: fetchGroupListBound
        })
        const groupInfoName = String(
            config.groupInfo?.variableName ||
                config.otherVariables?.groupInfo?.variableName ||
                'groupInfo'
        ).trim()
        if (groupInfoName) {
            promptRenderer?.registerFunctionProvider?.(groupInfoName, groupInfoProvider)
            log('info', `群组信息变量已注册: ${groupInfoName}`)
        }

        const randomProvider = createRandomProvider({ config })
        const randomName = String(
            config.random?.variableName || config.otherVariables?.random?.variableName || 'random'
        ).trim()
        if (randomName) {
            promptRenderer?.registerFunctionProvider?.(randomName, randomProvider)
            log('info', `随机数变量已注册: ${randomName}`)
        }

        if (weatherConfig.enabled) {
            const weatherProvider = createWeatherProvider({ weatherApi })
            const weatherVariableName = String(weatherConfig.variableName || 'weather').trim()
            if (weatherVariableName) {
                promptRenderer?.registerFunctionProvider?.(weatherVariableName, weatherProvider)
                log('info', `天气变量已注册: ${weatherVariableName}`)
            }
        }

        const toolDeps = {
            config,
            store,
            cache,
            permanentBlacklist,
            temporaryBlacklist,
            clamp: store.clamp,
            resolveLevelByAffinity: levelResolver.resolveLevelByAffinity,
            resolveLevelByRelation: levelResolver.resolveLevelByRelation,
            resolveUserIdentity: resolveUserIdentityBound
        }

        if (config.registerAffinityTool) {
            const toolName = String(config.affinityToolName || 'adjust_affinity').trim()
            plugin.registerTool(toolName, {
                selector: () => true,
                createTool: () => createAffinityTool(toolDeps)
            })
            log('info', `好感度工具已注册: ${toolName}`)
        }

        if (config.registerRelationshipTool) {
            const toolName = String(config.relationshipToolName || 'adjust_relationship').trim()
            plugin.registerTool(toolName, {
                selector: () => true,
                createTool: () => createRelationshipTool(toolDeps)
            })
            log('info', `关系工具已注册: ${toolName}`)
        }

        if (config.registerBlacklistTool) {
            const toolName = String(config.blacklistToolName || 'adjust_blacklist').trim()
            plugin.registerTool(toolName, {
                selector: () => true,
                createTool: () => createBlacklistTool(toolDeps)
            })
            log('info', `黑名单工具已注册: ${toolName}`)
        }

        if (config.enablePokeTool) {
            const toolName = String(config.pokeToolName || 'poke_user').trim()
            plugin.registerTool(toolName, {
                selector: () => true,
                authorization: (session: Session | undefined) => session?.platform === 'onebot',
                createTool: () => createPokeTool({ ctx, toolName, log, protocol: onebotProtocol })
            })
            log('info', `戳一戳工具已注册: ${toolName}`)
        }

        if (weatherConfig.enabled && weatherConfig.registerTool) {
            const weatherToolName = String(weatherConfig.toolName || 'get_weather').trim() || 'get_weather'
            plugin.registerTool(weatherToolName, {
                selector: () => true,
                createTool: () => createWeatherTool({ weatherApi })
            })
            log('info', `天气工具已注册: ${weatherToolName}`)
        }

        if (config.enableSetSelfProfileTool) {
            const toolName = String(config.setSelfProfileToolName || 'set_self_profile').trim()
            plugin.registerTool(toolName, {
                selector: () => true,
                authorization: (session: Session | undefined) => session?.platform === 'onebot',
                createTool: () => createSetProfileTool({ ctx, toolName, log, protocol: onebotProtocol })
            })
            log('info', `设置资料工具已注册: ${toolName}`)
        }

        if (config.enableSetGroupCardTool) {
            const toolName = String(config.setGroupCardToolName || 'set_group_card').trim()
            plugin.registerTool(toolName, {
                selector: () => true,
                authorization: (session: Session | undefined) => session?.platform === 'onebot',
                createTool: () => createSetGroupCardTool({ ctx, toolName, log })
            })
            log('info', `群昵称工具已注册: ${toolName}`)
        }

        if (config.enableSetMsgEmojiTool) {
            const toolName = String(config.setMsgEmojiToolName || 'set_msg_emoji').trim()
            plugin.registerTool(toolName, {
                selector: () => true,
                authorization: (session: Session | undefined) => session?.platform === 'onebot',
                createTool: () => createSetMsgEmojiTool({ toolName, log, protocol: onebotProtocol })
            })
            log('info', `消息表情工具已注册: ${toolName}`)
        }

        if (config.enableForwardMessageTool) {
            const toolName = String(config.forwardMessageToolName || 'send_forward_msg').trim()
            plugin.registerTool(toolName, {
                selector: () => true,
                authorization: (session: Session | undefined) => session?.platform === 'onebot',
                createTool: () =>
                    createForwardMessageTool({
                        toolName,
                        messageStore,
                        log,
                        protocol: onebotProtocol
                    })
            })
            log('info', `合并转发消息工具已注册: ${toolName}`)
        }

        if (config.enableFakeMessageTool) {
            const toolName = String(config.fakeMessageToolName || 'send_fake_msg').trim()
            plugin.registerTool(toolName, {
                selector: () => true,
                authorization: (session: Session | undefined) => session?.platform === 'onebot',
                createTool: () => createFakeMessageTool({ toolName, log, protocol: onebotProtocol })
            })
            log('info', `伪造消息工具已注册: ${toolName}`)
        }

        if (config.enableDeleteMessageTool) {
            const toolName = String(config.deleteMessageToolName || 'delete_msg').trim()
            plugin.registerTool(toolName, {
                selector: () => true,
                authorization: (session: Session | undefined) => session?.platform === 'onebot',
                createTool: () => createDeleteMessageTool({ toolName, log })
            })
            log('info', `删除消息工具已注册: ${toolName}`)
        }

        try {
            scheduleManager.registerVariables()
            scheduleManager.registerTool(plugin)
            scheduleManager.start()
        } catch (error) {
            log('warn', '日程管理器初始化失败', error)
        }

        log('info', '插件初始化完成')
    }

    if (ctx.root.lifecycle.isActive) {
        initializeServices()
    } else {
        ctx.on('ready', initializeServices)
    }
}
