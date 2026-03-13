# koishi-plugin-chatluna-affinity

一个给 ChatLuna Character 使用的 Koishi 插件，用来管理角色与用户之间的长期互动状态。它提供好感度、关系、黑名单、自定义昵称，以及配套的模板变量、命令和 XML 动作调用。

## 项目简介

这个插件解决的是“角色记不住人”的问题。

它把互动状态落到数据库里，并按 `scopeId` 做实例隔离。你可以把 `scopeId` 理解为当前角色的人设作用域：同一个 `scopeId` 下的数据共享，不同 `scopeId` 之间完全隔离。

插件当前包含四类核心能力：

- 好感度：支持长期 / 短期好感与动态系数
- 关系：支持按好感区间映射关系，也支持手动指定特殊关系
- 黑名单：支持永久拉黑、临时拉黑与拦截
- 用户昵称：支持为用户保存自定义昵称，并在 `affinity` 变量中输出

## 安装

### 前置依赖

请先确保你的 Koishi 环境已经安装并启用以下依赖：

- `koishi-plugin-chatluna`
- `koishi-plugin-chatluna-character`
- 数据库服务（因为本插件依赖 `database`）

可选依赖：

- `koishi-plugin-puppeteer`：用于将排行、黑名单、详情渲染为图片
- `koishi-plugin-chatluna-group-analysis`：用于在详情页展示用户印象
- `@koishijs/plugin-console`：用于控制台配置界面

### 安装插件

```bash
npm install koishi-plugin-chatluna-affinity
```

安装后，在 Koishi 中启用本插件并完成配置。

## 快速上手

### 1. 先配置 `scopeId`

这是最重要的配置项。

- `scopeId` 必填
- 只允许中文、英文、数字、`_`、`-`
- 长度 1 到 32
- 建议直接使用角色名或角色代号，例如：`nene`、`宁宁`

结论很直接：

- 同一个 `scopeId` 下，所有 bot 共享一份互动数据
- 不同 `scopeId` 下，数据完全隔离

### 2. 保持默认配置先跑通

首次使用时，建议先只确认这些开关：

- `affinityEnabled = true`
- `enableAffinityXmlToolCall = true`
- `enableBlacklistXmlToolCall = true`
- `enableRelationshipXmlToolCall = true`
- `enableUserAliasXmlToolCall = true`

如果你希望只有指定 bot 的真实回复才能触发首次建档，再配置：

- `affinityInitSelfIds = ["你的bot selfId"]`

它为空时，表示当前实例内任意 bot 的有效回复都可以触发首次初始化。

如果你没特殊需求，不要一上来就乱改动态参数，先把链路跑通再说。

### 3. 在角色提示词里接入变量与 XML

如果你在 ChatLuna Character 模板里使用本插件：

- 用变量读取状态
- 用 XML 标签写入状态

最常见的组合就是：

- 模板里放 `{affinity("你的scopeId")}`
- 提示词里允许模型输出 `<affinity .../>`、`<relationship .../>`、`<blacklist .../>`、`<userAlias .../>`

## 变量

默认变量名如下：

- `affinity`
- `relationshipLevel`
- `blacklistList`

调用格式必须写成：

```text
{变量名("scopeId"[, "userId"])}
```

示例：

- `{affinity("宁宁")}`
- `{affinity("宁宁", "123456")}`
- `{relationshipLevel("宁宁")}`
- `{blacklistList("宁宁")}`

### `affinity`

返回当前用户或指定用户的好感信息。

输出示例：

```text
id:1511991473 name:蒸汽机 nickname:蒸汽机姐姐 affinity:20 relationship:熟悉
```

说明：

- `nickname` 只有在用户设置了自定义昵称时才会出现
- 当未显式传入 `userId` 时，默认取当前上下文用户
- `scopeId` 必须显式传入，不传就返回空字符串

### `relationshipLevel`

返回当前配置下的好感区间关系表，适合直接塞进角色提示词，让模型知道不同区间对应什么关系。

### `blacklistList`

返回当前上下文可见范围内的黑名单信息。

这里要分清楚：

- 黑名单的实际生效范围是当前 `scopeId`
- 群聊里的展示会按当前群成员做过滤

别把展示过滤当成存储隔离，这是两回事。

### 变量调用注意事项

`scopeId` 建议始终写成字符串字面量。

正确：

```text
{affinity("nene")}
```

错误：

```text
{affinity(nene)}
```

后者会先把 `nene` 当成模板变量求值，不是你想要的效果。

## XML 动作调用

插件会从模型原始输出中解析以下自闭合标签：

- `<affinity scopeId="" userId="" action="increase|decrease" delta=""/>`
- `<blacklist scopeId="" userId="" action="add|remove" mode="permanent|temporary" durationHours="" note=""/>`
- `<relationship scopeId="" userId="" action="set|clear" relation=""/>`
- `<userAlias scopeId="" userId="" name=""/>`

这些能力分别受对应配置开关控制。

### XML 规则

所有 XML 工具都遵守下面这几条：

- `scopeId` 必填
- `scopeId` 必须和当前插件实例配置一致
- 插件不会从会话里替你猜 `scopeId`
- `scopeId` 填错、缺失或非法时，该标签不会按你的预期生效
- `platform` 在未显式传入时默认按 `onebot` 处理

### 常见示例

增加好感：

```xml
<affinity scopeId="宁宁" userId="123456" action="increase" delta="5"/>
```

减少好感：

```xml
<affinity scopeId="宁宁" userId="123456" action="decrease" delta="3"/>
```

设置特殊关系：

```xml
<relationship scopeId="宁宁" userId="123456" action="set" relation="姐姐"/>
```

移除特殊关系：

```xml
<relationship scopeId="宁宁" userId="123456" action="clear"/>
```

永久拉黑：

```xml
<blacklist scopeId="宁宁" userId="123456" action="add" mode="permanent" note="violation"/>
```

临时拉黑：

```xml
<blacklist scopeId="宁宁" userId="123456" action="add" mode="temporary" durationHours="12" note="spam"/>
```

设置昵称：

```xml
<userAlias scopeId="宁宁" userId="123456" name="小祥"/>
```

### 关于初始化

首次好感度记录不再依赖 `<affinity .../>` 这类 XML 写路径。

当前语义是：

- 当 `chatluna-character` 的 `getTemp(session, ...)` 命中当前会话
- 且后续 `completionMessages.push(...)` 确实写入了一条有效 AI 回复
- 且该回复对应的 `session.selfId` 命中当前实例允许的 `affinityInitSelfIds`（或该列表为空）
- 且当前 `scopeId + userId` 还没有现存记录

插件才会为该用户执行一次首次初始化。

这意味着：

- 第一次真实互动就可以建档
- 已有记录时不会重复初始化，也不会重置旧值
- `affinityInitSelfIds` 只影响“谁能触发首次初始化”
- 存储隔离仍然只看 `scopeId`，不会因为 `selfId` 不同而拆成多份数据

显式写路径仍然会继续修改记录，例如：

- XML 的 `<affinity .../>`
- 手动命令 `adjust`
- 其他明确调用存储写入的逻辑

无记录时，初始化默认值来自 `initialAffinity`。

## 指令

指令统一为：

```text
scopeId.指令名
```

例如 `scopeId = 宁宁` 时：

- `宁宁.inspect [userId] [platform] [image]`：查看指定用户好感度详情
- `宁宁.rank [limit] [image]`：查看当前作用域好感度排行
- `宁宁.adjust <userId> <delta>`：手动增减好感度
- `宁宁.blacklist [limit] [platform] [image]`：查看黑名单列表
- `宁宁.block <userId> [platform]`：加入永久黑名单
- `宁宁.unblock <userId> [platform]`：解除永久黑名单，并尝试重置好感度
- `宁宁.tempBlock <userId> [durationHours] [platform]`：加入临时黑名单
- `宁宁.tempUnblock <userId> [platform]`：解除临时黑名单
- `宁宁.clearAll -y`：清空当前作用域下的好感度、黑名单、昵称数据

其中 `clearAll` 是危险操作，需要二次确认。

## 配置说明

插件配置主要分成这些部分：

- 作用域设置：`scopeId`
- 好感度设置：基础值、动态阈值、显示范围、排行默认数量
- 黑名单设置：默认列表、临时拉黑处罚、解除永久拉黑后的初始值等
- 关系设置：区间关系与特殊关系
- 变量设置：变量名重命名
- XML 工具设置：是否启用各类 XML 与参考提示词
- 其他设置：图片渲染、调试日志、详情显示印象等

如果你只是正常使用，优先关注这几个配置：

- `scopeId`
- `initialAffinity`
- `affinityInitSelfIds`
- `affinityDisplayRange`
- `rankDefaultLimit`
- `unblockPermanentInitialAffinity`
- `debugLogging`
- `characterPromptTemplate`

`characterPromptTemplate` 里出现的 `{scopeId}` 不会自动替换。那只是参考占位符，你要自己手动替换成真实值。

## 数据与迁移

插件使用 Koishi `database` 持久化数据，主要涉及好感度、黑名单、昵称和迁移状态记录。

### 当前数据语义

当前版本核心定位键是：

- `scopeId + userId`

这意味着：

- 同一角色实例内的数据按 `scopeId` 共享
- 不再依赖旧版本里的 `selfId` 语义做隔离

### 迁移行为

当前代码包含旧表到 `v2` 结构的迁移逻辑。

但你别自欺欺人，以为它会帮你完美保留旧语义。事实不是。

迁移时：

- 旧表记录会被映射到当前配置的 `scopeId`
- `selfId` 不会被迁移到新表中
- 如果你旧版本依赖 `selfId` 区分不同 bot，那这层语义会丢失

所以升级前你必须自己判断：

- 你要的是“把旧数据并到当前角色作用域里”
- 还是“保留旧版多 bot 隔离语义”

如果是后者，别指望自动迁移替你做对，你得自己处理数据库。

## 调试建议

排查问题时，先看这几个点：

- `scopeId` 是否填对
- 变量调用是否写成了 `{affinity("scopeId")}` 这种正确格式
- XML 标签里的 `scopeId` 是否与当前实例一致
- `debugLogging` 是否开启
- 当前环境是否安装了 `puppeteer`，否则图片模式会自动退回文本模式

如果你怀疑数据脏了，可以执行：

```text
你的scopeId.clearAll -y
```

这会清空当前作用域下的好感度、黑名单和昵称数据，无法恢复。

## 许可证

MIT © 2024-present chatluna-affinity contributors

## 更新日志

> 以下为历史版本记录，当前可用能力请以本文上方「变量与模板占位符 / 指令 / 工具」章节为准。

0.2.6

### 新增
- 黑名单、关系调整 XML 工具调用。
- 黑名单临时拉黑能力（XML）。
- `blacklistList` 变量（当前群黑名单信息）。
- 用户自定义昵称能力：`userAlias` XML 工具，昵称会融入 `affinity` 变量输出，数据持久化到数据库。

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
