/**
 * 日程 Schema
 * 定义日程功能相关的配置项
 */

import { Schema } from 'koishi'
import { DEFAULT_SCHEDULE_PROMPT } from '../constants'

export const ScheduleSchema = Schema.object({
    schedule: Schema.object({
        enabled: Schema.boolean().default(true).description('是否启用日程功能'),
        model: Schema.dynamic('model')
            .default('')
            .description('日程生成使用的模型'),
        personaSource: Schema.union([
            Schema.const('none').description('不注入人设'),
            Schema.const('chatluna').description('使用 ChatLuna 主插件人设'),
            Schema.const('custom').description('使用自定义人设')
        ])
            .default('none')
            .description('人设注入来源'),
        personaChatlunaPreset: Schema.dynamic('preset')
            .default('无')
            // @ts-expect-error - Koishi Schema hidden accepts callback at runtime
            .hidden((_: unknown, cfg: { personaSource?: string } | undefined) => (cfg?.personaSource || 'none') !== 'chatluna')
            .description('当选择主插件预设时，指定要注入的 ChatLuna 预设'),
        personaCustomPreset: Schema.string()
            .role('textarea')
            .default('')
            // @ts-expect-error - Koishi Schema hidden accepts callback at runtime
            .hidden((_: unknown, cfg: { personaSource?: string } | undefined) => (cfg?.personaSource || 'none') !== 'custom')
            .description('当选择自定义人设时注入的文本内容'),
        variableName: Schema.string().default('schedule').description('今日日程变量名称'),
        currentVariableName: Schema.string().default('currentSchedule').description('当前日程变量名称'),
        outfitVariableName: Schema.string().default('outfit').description('今日穿搭变量名称'),
        currentOutfitVariableName: Schema.string().default('currentOutfit').description('当前穿搭变量名称'),
        timezone: Schema.string().default('Asia/Shanghai').description('用于日程生成的时区'),
        prompt: Schema.string()
            .role('textarea')
            .default(DEFAULT_SCHEDULE_PROMPT)
            .description('日程生成提示词'),
        renderAsImage: Schema.boolean().default(false).description('将今日日程渲染为图片'),
        startDelay: Schema.number().default(3000).description('启动延迟（毫秒），等待 ChatLuna 加载完成'),
        registerTool: Schema.boolean().default(true).description('注册 ChatLuna 工具：获取今日日程'),
        toolName: Schema.string().default('daily_schedule').description('ChatLuna 工具名称：获取今日日程')
    })
        .default({
            enabled: true,
            model: '',
            personaSource: 'none',
            personaChatlunaPreset: '无',
            personaCustomPreset: '',
            variableName: 'schedule',
            currentVariableName: 'currentSchedule',
            outfitVariableName: 'outfit',
            currentOutfitVariableName: 'currentOutfit',
            timezone: 'Asia/Shanghai',
            prompt: DEFAULT_SCHEDULE_PROMPT,
            renderAsImage: false,
            startDelay: 3000,
            registerTool: true,
            toolName: 'daily_schedule'
        })
        .description('日程设置')
})
