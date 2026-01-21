/**
 * 插件入口
 * 导出插件元信息和 apply 函数
 */

export { name, inject, ConfigSchema as Config } from './schema'
export { apply } from './plugin'

export * from './types'
export * from './constants'
export * from './utils'
export * from './helpers'
export * from './models'
export * from './services'
export * from './renders'
export * from './commands'
export * from './integrations'
export {
    ConfigSchema,
    AffinitySchema,
    BlacklistSchema,
    RelationshipSchema,
    ScheduleSchema,
    OtherVariablesSchema,
    NativeToolsSchema,
    XmlToolsSchema,
    OtherCommandsSchema,
    OtherSettingsSchema
} from './schema'
export const usage = `
## 更新日志

0.2.3
- OneBot 协议新增 NapCat/LLBot 独立选项，按配置选择协议

0.2.3-alpha.4
- 修复日程生成提示词人设注入变量 {persona} 失效的问题，新增模型选择与人设注入选项
- 天气服务切换为 open-meteo，不再需要提供 token

0.2.3-alpha.3
- 修复无法选择日程模型的问题
`;