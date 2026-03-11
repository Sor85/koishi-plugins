# koishi-plugin-chatluna-affinity

一个面向 ChatLuna Character 的 Koishi 插件，提供可持久化的好感度、关系、黑名单与用户自定义昵称能力，并支持通过 XML 动作在对话过程中直接驱动状态更新。

## 项目简介

本插件聚焦「角色互动状态管理」，核心目标是让模型在生成回复时能够基于长期互动上下文做出稳定、可追踪的行为决策。

你可以把它理解为四个核心模块：

- 好感度：长期/短期状态与系数联动
- 关系：按好感区间自动映射 + 手动指定特殊关系
- 黑名单：永久/临时拉黑与自动拦截
- 用户自定义昵称：为指定用户存储专属称呼

## 功能一览

- 支持命令管理：查看排行、查看详情、调整好感、黑名单管理、清库
- 支持 ChatLuna 变量注入：`affinity(scopeId)`、`relationshipLevel(scopeId)`、`blacklistList(scopeId)`、`userAlias(scopeId)`
- 支持 XML 动作调用：好感度、黑名单、关系、自定义昵称
- 所有核心数据均按 `scopeId + userId` 隔离，不再回退到会话频道语义
- 数据写入 Koishi `ctx.database`，支持跨重启持久化

## 快速上手

### 1) 使用默认配置启动

默认配置可直接运行，建议优先确认：

- `scopeId` 已设置为当前角色实例的唯一标识
- `affinityEnabled = true`
- `baseAffinityConfig.initialAffinity = 30`（默认值，可自定义）
- `xmlToolSettings.enableAffinityXmlToolCall = true`
- `xmlToolSettings.enableBlacklistXmlToolCall = true`
- `xmlToolSettings.enableRelationshipXmlToolCall = true`
- `xmlToolSettings.enableUserAliasXmlToolCall = true`

### 2) 常用命令

命令统一改为 `scopeId.指令名`。

- `宁宁.inspect [userId] [platform] [image]`：查看好感度详情
- `宁宁.rank [limit] [image]`：查看好感度排行
- `宁宁.adjust <userId> <delta>`：手动调整好感度
- `宁宁.blacklist [limit] [platform] [image]`：查看黑名单
- `宁宁.block <userId> [platform]`：永久拉黑
- `宁宁.unblock <userId> [platform]`：解除永久拉黑，并将该用户好感度重置为黑名单设置中的初始值
- `宁宁.tempBlock <userId> [durationHours] [platform]`：临时拉黑
- `宁宁.tempUnblock <userId> [platform]`：解除临时拉黑
- `宁宁.clearAll -y`：清空当前作用域下的好感度、黑名单与昵称数据（危险操作）

### 3) 变量（默认名）

变量统一改为 `变量名(scopeId[, userId])`。

- `affinity(宁宁)`：当前用户好感度相关信息；若数据库无记录，则返回默认好感及对应关系
- `relationshipLevel(宁宁)`：完整好感区间关系表
- `blacklistList(宁宁)`：当前会话可见范围内的黑名单信息
- `userAlias(宁宁)`：指定用户的自定义昵称信息

变量名可通过 `variableSettings` 重命名，但调用时必须显式传入 `scopeId`；未传 scopeId 将返回空字符串。

## XML 动作调用

插件可从模型原始输出中解析以下自闭合标签：

- `<affinity scopeId="" userId="" action="increase|decrease" delta=""/>`
- `<blacklist scopeId="" userId="" action="add|remove" mode="permanent|temporary" durationHours="" note=""/>`
- `<relationship scopeId="" userId="" action="set|clear" relation=""/>`
- `<userAlias scopeId="" userId="" name=""/>`

对应开关位于 `xmlToolSettings`。

普通会话消息不会自动初始化好感度记录。只有 XML 的 `affinity increase/decrease`、手动 `adjust` 等显式写路径才会在无记录时按 `baseAffinityConfig.initialAffinity` 初始化到数据库。

其中 XML 的 `scopeId` 为必填字段，必须显式填写当前插件实例的 `scopeId`。插件不会回退到会话推导，也不会猜测或改写错误的 `scopeId`。

## 数据存储

插件通过 Koishi `ctx.database` 持久化，主要表如下：

- `chatluna_affinity`
- `chatluna_blacklist`
- `chatluna_user_alias`

## 配置概览

配置由以下分组组成：

- 好感度：`AffinitySchema`
- 黑名单：`BlacklistSchema`（含 `unblockPermanentInitialAffinity`，用于设置解除永久黑名单后的初始好感度）
- 关系：`RelationshipSchema`
- 作用域/变量/XML 工具/其他：`tools` 分组

完整配置入口：`ConfigSchema`。

## 迁移说明

### 数据库迁移

当前版本**不再提供 affinity 数据自动迁移**。

如果你是从旧版本升级，且历史数据库中的 `chatluna_affinity` 仍然保留旧结构，请先手动处理旧数据，再启动新版本；否则运行时可能直接出现数据库字段或约束错误。

已知变更点：

- affinity 侧已经移除 `selfId` 语义
- 当前结构改为以 `scopeId + userId` 作为核心定位键
- 多 bot 不再按 `selfId` 隔离 affinity 数据，而是按 `scopeId` 共享

如果你不需要保留旧好感度数据，最直接的处理方式是执行：

- `你的scopeId.clearAll -y`

这会清空好感度与黑名单数据，并按当前版本结构重新建立后续数据。

如果你需要保留旧数据，请在升级前自行完成数据库迁移，不要依赖插件启动时自动修复。

### 插件拆分

当前版本已将部分能力拆分为独立插件：

- 日程、天气：`koishi-plugin-chatluna-schedule`
- 更多变量与 XML 工具：`koishi-plugin-chatluna-toolbox`

## 调试建议

- 开启 `debugLogging` 查看 XML 拦截、状态写入、变量注册等日志。
- 若解除永久黑名单后希望用户从更安全的状态重新开始，可调整 `unblockPermanentInitialAffinity`。
- 若遇到旧数据结构问题，可使用 `你的scopeId.clearAll -y` 清理当前作用域后重建。

## 许可证

MIT © 2024-present chatluna-affinity contributors

## 更新日志

> 以下为历史版本记录，当前可用能力请以本文上方「变量与模板占位符 / 指令 / 工具」章节为准。

0.2.6

### 新增
- 黑名单、关系调整 XML 工具调用。
- 黑名单临时拉黑能力（XML）。
- `blacklistList` 变量（当前群黑名单信息）。
- 用户自定义昵称能力：`userAlias` XML 工具 + `userAlias` 变量，数据持久化到数据库。

### 调整
- 黑名单能力改为由 Bot 通过 XML 自主决策（含永久/临时与解除）。
- 黑名单相关数据由配置存储迁移为数据库存储。
- `contextAffinity` 变量能力并入 `affinity` 变量。
- 日程、天气能力拆分至 `koishi-plugin-chatluna-schedule`。
- 更多变量与 XML 工具能力拆分至 `koishi-plugin-chatluna-toolbox`。

### 移除
- 天气、日程、冗余变量与冗余工具（由拆分插件承接）。
- 设置好感度工具。
- 自动拉黑逻辑，改为由 Bot 决策触发。

0.2.5
- 将 puppeteer 从可选依赖改为可选服务

0.2.4
- userInfo 变量新增 chatCount 字段，可展示聊天次数
- 修复状态改变后 XML 工具拦截失效的问题

0.2.3
- OneBot 协议新增 NapCat/LLBot 独立选项，按配置选择协议

0.2.3-alpha.4
- 修复日程生成提示词人设注入变量 {persona} 失效的问题，新增模型选择与人设注入选项
- 天气服务切换为 open-meteo，不再需要提供 token

0.2.3-alpha.3
- 修复无法选择日程模型的问题

0.2.3-alpha.2
- 修复好感度更新时未更新 chatCount 的问题

0.2.3-alpha.1
- 新增 XML 工具，解析原始输出中的 <poke id=\"\" /> 戳一戳、<emoji id=\"\" /> 表情回应、<delete message_id=\"\" /> 撤回消息
- 重构好感度，从依赖外部模型改为解析原始输出中的 <affinity delta=\"\" action=\"increase|decrease\" id=\"\" />

0.2.2-alpha.13
- 新增 send_fake_msg 工具，用于伪造消息并发送合并转发

0.2.2-alpha.12
- groupInfo 变量新增 includeOwnersAndAdmins 配置，用于展示群主/管理员名单
- 关系设置新增新增好感度区间变量 relationshipLevel ，按配置逐行展示所有好感度区间、关系与备注

0.2.2-alpha.11
- 撤回工具修改为按 messageid 撤回，移除 lastN/关键词等模糊匹配路径
- 新增 set_msg_emoji 工具，按 messageid + emoji_id 对消息添加表情
- 新增 send_forward_msg 合并转发工具（未完成）
- 新增 varslist/toolslist 指令，分别列出已启用的变量与工具

0.2.2-alpha.10
- 好感度详情新增“印象”显示开关 inspectShowImpression，可关闭印象获取与展示（affinity.inspect）

0.2.2-alpha.9
- 新增群昵称工具，支持修改群成员昵称（OneBot 平台，需群管理权限）
- 好感度分析提示词调整：若 Bot 回复已包含好感度变化倾向，则以回复为准，避免冲突

0.2.2-alpha.8
- 好感度设置中新增“使用原始输出”开关，开启后好感度分析直接使用 chatluna-character 的原始输出
- 天气设置新增 get_weather 工具注册，可通过工具查询指定城市天气

0.2.2-alpha.7
- 在好感度分析提示词中新增 currentRelationship 变量

0.2.2-alpha.6
- 新增 weather、outfit 变量

0.2.2-alpha.5
- fix

0.2.2-alpha.4
- 修改好感度分组的存储键格式，使用 groupName,selfId 作为数据库记录的 selfId 字段
