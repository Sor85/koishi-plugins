/**
 * 工具与变量设置 Schema
 * 定义 scopeId、XML 工具与变量名称配置
 */

import { Schema } from "koishi";

export const ScopeSettingsSchema = Schema.object({
  scopeId: Schema.string()
    .pattern(/^[A-Za-z0-9_\-\u4e00-\u9fff]{1,32}$/)
    .required()
    .description("作用域标识，只允许中文、英文、数字、_、-，长度 1-32"),
  affinityInitSelfIds: Schema.array(String)
    .role("table")
    .default([])
    .description(
      "允许触发首次好感度初始化的 bot selfId 列表；为空时表示当前实例任意 bot 均可触发",
    ),
}).description("作用域设置");

export const XmlToolSettingsSchema = Schema.object({
  enableAffinityXmlToolCall: Schema.boolean()
    .default(true)
    .description("启用好感度 XML 工具调用"),
  enableBlacklistXmlToolCall: Schema.boolean()
    .default(true)
    .description("启用黑名单 XML 工具调用"),
  enableRelationshipXmlToolCall: Schema.boolean()
    .default(true)
    .description("启用关系 XML 工具调用"),
  enableUserAliasXmlToolCall: Schema.boolean()
    .default(true)
    .description("启用自定义昵称 XML 工具调用"),
  characterPromptTemplate: Schema.string()
    .role("textarea")
    .default(
      `## 动作指令
你可以根据需要创建一个独立的 <actions> 元素。它用于执行非语言的系统指令。如果不需要执行任何动作，请省略此元素。
1. 好感度更新: \`<affinity scopeId="" userId="" action="" delta=""/>\`
  - scopeId: {scopeId}
  - userId: 目标用户 ID
  - action: increase 或 decrease
  - delta: 必须填写正整数
2. 黑名单管理: \`<blacklist scopeId="" userId="" action="" mode="" durationHours="" note=""/>\`
  - scopeId: {scopeId}
  - userId: 目标用户 ID
  - action: add 或 remove
  - mode: permanent 或 temporary
  - durationHours: 仅在 action=add 且 mode=temporary 时填写
  - note: 可选备注
3. 关系调整: \`<relationship scopeId="" userId="" action="" relation=""/>\`
  - scopeId: {scopeId}
  - userId: 目标用户 ID
  - action: set 或 clear
  - relation: 仅在 action=set 时填写
4. 自定义昵称设置: \`<userAlias scopeId="" userId="" name=""/>\`
  - scopeId: {scopeId}
  - userId: 目标用户 ID
  - name: 用户自定义昵称

格式示例:
\`\`\`xml
  <actions>
    <affinity scopeId="{scopeId}" userId="123456" action="increase" delta="5"/>
    <blacklist scopeId="{scopeId}" userId="123456" action="add" mode="permanent" note="violation"/>
    <blacklist scopeId="{scopeId}" userId="123456" action="add" mode="temporary" durationHours="12" note="spam"/>
    <relationship scopeId="{scopeId}" userId="123456" action="set" relation="小祥姐姐"/>
    <userAlias scopeId="{scopeId}" userId="123456" name="小祥"/>
  </actions>
\`\`\``,
    )
    .description("参考提示词，使用前请手动将 {scopeId} 替换为你的实际 scopeId")
    .collapse(),
}).description("XML 工具设置");

export const VariableSettingsSchema = Schema.object({
  affinityVariableName: Schema.string()
    .default("affinity")
    .description(
      '好感度变量名称，调用示例：{affinity("scopeId")}，请将 scopeId 替换为你设定的实际 scopeId。返回格式为文本行，包含 id、name、nickname、affinity、relationship；当展示范围大于 1 时会返回多行。',
    ),
  relationshipLevelVariableName: Schema.string()
    .default("relationshipLevel")
    .description(
      '好感度区间变量名称，调用示例：{relationshipLevel("scopeId")}，请将 scopeId 替换为你设定的实际 scopeId。返回格式为文本行，列出当前配置中的所有区间，包含 min、max、relationship、note。',
    ),
  blacklistListVariableName: Schema.string()
    .default("blacklistList")
    .description(
      '当前群黑名单列表变量名称，调用示例：{blacklistList("scopeId")}，请将 scopeId 替换为你设定的实际 scopeId。返回格式为文本行，列出当前群命中的黑名单记录，包含 id、name、affinity、mode、blockedAt；临时黑名单额外包含 expiresAt。',
    ),
}).description("变量设置");

export const OtherSettingsSchema = Schema.object({
  rankRenderAsImage: Schema.boolean()
    .default(false)
    .description("将好感度排行渲染为图片"),
  blacklistRenderAsImage: Schema.boolean()
    .default(false)
    .description("将黑名单渲染为图片"),
  shortTermBlacklistRenderAsImage: Schema.boolean()
    .default(false)
    .description("将临时黑名单渲染为图片"),
  inspectRenderAsImage: Schema.boolean()
    .default(false)
    .description("将好感度详情渲染为图片"),
  inspectShowImpression: Schema.boolean()
    .default(true)
    .description("在好感度详情中显示印象（依赖 chatluna-group-analysis）"),
  debugLogging: Schema.boolean().default(false).description("输出调试日志"),
}).description("其他设置");
