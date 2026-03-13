/**
 * 插件入口
 * 导出插件元信息和 apply 函数
 */

export { name, inject, ConfigSchema as Config } from "./schema";
export { apply } from "./plugin";

export * from "./types";
export * from "./constants";
export * from "./utils";
export * from "./helpers";
export * from "./models";
export * from "./services";
export * from "./renders";
export * from "./commands";
export * from "./integrations";
export {
  ConfigSchema,
  AffinitySchema,
  BlacklistSchema,
  RelationshipSchema,
  OtherSettingsSchema,
} from "./schema";
export const usage = `
## 更新日志

0.3.0-alpha.1

### 重构
- 引入 \`scopeId\` 作为新的核心作用域语义；数据隔离从旧版按 bot / 旧主键切换为按 \`scopeId\` 隔离。
- 单个实例内的多个 bot 现在共享同一份 \`scopeId\` 数据；共享范围覆盖好感度、黑名单、特殊关系与昵称。
- 数据库模型升级为 v2：
  - \`chatluna_affinity\` -> \`chatluna_affinity_v2\`
  - \`chatluna_blacklist\` -> \`chatluna_blacklist_v2\`
  - \`chatluna_user_alias\` -> \`chatluna_user_alias_v2\`
- 新增数据库迁移服务与迁移记录表，启动时会自动将旧表迁移到 v2 结构。
- 好感度、黑名单与模型响应处理链路重构为更清晰的服务化结构。

### 新增
- 新增 \`scopeId\` 配置；当前版本按 \`scopeId\` 区分数据，不同实例之间完全隔离。
- 新增 \`botSelfIds\` 配置，用于声明哪些 bot 归属当前 \`scopeId\`；同一 \`scopeId\` 下多个 bot 共享数据，用于首次互动初始化好感度。
- 新增作用域化命令前缀，命令由固定 \`affinity.*\` 改为 \`\${scopeId}.*\`。
- 新增永久黑名单解除后的好感度重置逻辑；解除后会同时重置好感度相关状态。
- 新增作用域化变量调用要求，变量现在需要显式传入 \`scopeId\`。

### 修改
- 好感度、黑名单、昵称数据的写入与读取主键语义改为以 \`scopeId\` 为核心：
  - 好感度：\`scopeId + userId\`
  - 黑名单：\`scopeId + userId + mode\`
  - 用户昵称：\`scopeId + userId\`
- 多 bot 共享方案从旧版分组配置改为统一的 \`scopeId\` 语义。
- 好感度初始化时机改为“与 bot 首次有效交互时入库”，不再在收到消息时提前初始化。
- 随机初始好感度改为固定初始好感度，默认值为 \`30\`。
- \`userAlias\` 的昵称信息已融入 \`affinity\` 变量输出；当前输出形态为 \`id name nickname affinity relationship\`。
- 对于尚未与 bot 产生有效互动的用户，\`affinity\` 变量现在会直接显示默认好感度，以及该默认值对应的关系。
- 关系区间变量名由 \`relationshipAffinityLevel\` 简化为 \`relationshipLevel\`。
- 所有变量现在都需要显式传入 \`scopeId\`，例如：
  - \`relationshipLevel(scopeId)\`
  - \`affinity(scopeId)\`
  - \`blacklistList(scopeId)\`
- XML 工具调用参数改为显式作用域风格，核心字段统一为 \`scopeId + userId\`。
- \`scopeId\` 会直接作为指令前缀；不要使用与 bot 名称相同的 \`scopeId\`，建议优先使用英文。
- 日程、天气能力拆分至 \`koishi-plugin-chatluna-schedule\`。
- 更多变量与 XML 工具能力拆分至 \`koishi-plugin-chatluna-toolbox\`。

### 删除
- 删除 ChatLuna 原生工具注册能力，当前版本不再提供原生工具。
- 删除旧版 \`affinityGroups\` 共享分组配置。
- 删除固定命令前缀 \`affinity.*\` 的命名方式。
- 删除 \`relationshipAffinityLevel\` 旧命名。
- 删除以下动态配置项：
  - 单次增加的短期好感最大幅度
  - 单次减少的短期好感最大幅度
  - 允许额外增减突破单次上限
- \`userAlias\` 不再作为独立变量暴露；昵称能力保留在 XML 与 \`affinity\` 变量输出中。

### 兼容性提醒
- 这是一次带有破坏性兼容变更的重构升级；旧命令、旧 XML 参数和旧变量调用方式都需要同步调整。
- 迁移会把旧数据整体归入当前实例的 \`scopeId\`，不会自动拆分为多个作用域。
`;
