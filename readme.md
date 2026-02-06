# koishi-plugin-chatluna-affinity

为 ChatLuna Character 提供「好感度」「关系」「工具」等一整套 Affinity 能力。

## 特性速览

1. **好感度模型**：采用「系数 × 长期好感」的复合结果，短期情绪仅作为分析输入。
2. **延迟分析**：在 `chatluna-character` 输出完成后收集 Bot 的多段回复，再启动模型分析，确保上下文与回复一致。
3. **互动系数**：记录每日 increase/decrease，满足"连续互动且 increase > decrease"或"长时间未互动/负向占优"时，按天数累积提升或衰减系数。
4. **自定义关系链**：提供好感度区间→关系映射、特殊关系配置、自动调整工具，便于角色扮演差异化。
5. **多工具联动**：支持手动调整好感、切换关系、管理黑名单、NapCat/OneBot Poke、自定义随机变量等实用工具。
6. **查看状态**：
   - `affinity.inspect`：查看好感度、长期好感、短期好感、系数、连续互动天数。
   - `affinity.rank`：查看排行榜，支持文本/图片输出。

## 核心概念

| 概念 | 说明 |
| --- | --- |
| 好感度 | `affinity()` 变量与 `{affinity}` 模板均返回「系数 × 长期好感」，实时缓存与数据库一致。 |
| 长期好感度 | 代表关系基准，满足短期阈值后才会被调节。 |
| 短期好感度 | 描述即时情绪波动，仅用于分析与可视化，不直接参与最终结果。 |
| 互动系数 | 记录连续天数与日增减。`increase > decrease` 时提升，长时间未互动或 `decrease > increase` 则衰减。 |
| 关系 | 根据好感度区间自动匹配的称谓，也可为特定用户配置特殊关系。 |

## 好感度是如何计算的

1. **长期好感度 (LongTerm Affinity)**
   - 存储于数据库 `longTermAffinity` 字段，由短期阈值触发的 promote/demote 事件在 `longTermPromoteStep` / `longTermDemoteStep` 控制下递增或递减。
   - 任何手动调整（如 `adjust_affinity`）会直接写入该值并同步关系。

2. **互动系数 (Coefficient)**
   - 基于 `affinityDynamics.coefficient` 配置，包含 `base`、`maxDrop`、`maxBoost`、`decayPerDay`、`boostPerDay`。
   - 每日统计 `increase` / `decrease` 次数：
     - 长时间未互动或 `decrease > increase` → 按天数衰减，累计不超过 `maxDrop`。
     - 连续互动且 `increase > decrease` → 按连续天数提升，累计不超过 `maxBoost`。
   - 结果保存到 `coefficientState` 中（含 `coefficient` 与 `streak`）。

3. **综合好感度 (Composite Affinity)**
   - 计算公式：`composite = clamp(coefficient * longTermAffinity, min, max)`。
   - `affinity()` 变量、`{affinity}` 模板与提示词 `{{currentAffinity}}` 均使用该值。
   - 写入数据库的字段为 `affinityOverride`，供后续读取与缓存。

4. **历史与上下文参与方式**
   - 短期好感度、历史上下文、Bot 回复等信息只影响模型输出的 `delta`，不会直接参与最终公式。
   - 每次模型执行产生的行动记录会写入 `actionStats`，下一次分析会参考这些数据决定阈值与提示信息。

## 变量与模板占位符

| 变量 | 说明 |
| --- | --- |
| `{affinity}` / `affinity()` | 好感度（系数 × 长期好感）。 |
| `{relationship}` / `relationship()` | 当前好感度区间对应的关系。 |
| `{userInfo}` / `userInfo()` | 当前用户信息（可配置显示项）。 |
| `{botInfo}` / `botInfo()` | 机器人信息（可配置显示项）。 |
| `{groupInfo}` / `groupInfo()` | 当前群信息（NapCat/OneBot）。 |
| `{contextAffinity}` / `contextAffinity()` | 近期消息用户的好感度概览。 |
| `{random}` / `random()` | 随机数变量。 |
| `{{currentAffinity}}` | 渲染提示词时的好感度。 |
| `{{historyText}}` | 上下文。 |
| `{{userMessage}}` / `{{botReply}}` | 当前轮消息与聚合后的 Bot 回复。 |
| `{{longTermCoefficient}}` | 计算后的系数结果。 |

## 指令

| 指令 | 说明 |
| --- | --- |
| `affinity.inspect [userId] [platform]` | 查看好感度、长期/短期、系数、连续互动天数、交互统计。 |
| `affinity.rank [limit] [platform] [image]` | 查看排行榜，支持图片输出（依赖 puppeteer）。 |
| `affinity.blacklist [limit] [platform] [image]` | 查看黑名单（包含永久和临时）。 |
| `affinity.block <userId> [platform] [-n note]` | 将用户加入永久黑名单。 |
| `affinity.unblock <userId> [platform]` | 解除永久黑名单。 |
| `affinity.tempBlock <userId> [hours] [platform]` | 临时拉黑用户。 |
| `affinity.tempUnblock <userId> [platform]` | 解除临时黑名单。 |
| `affinity.adjust <userId> <delta> [platform]` | 手动调整用户好感度。 |
| `affinity.groupList` | 列出 Bot 所在群（NapCat/OneBot）。 |

## 工具

| 工具 | 功能 |
| --- | --- |
| `adjust_affinity` | 将综合好感度设置为指定值，并重新计算关系。 |
| `adjust_relationship` | 强制切换关系到指定称谓，同时把好感调整到区间下限。 |
| `adjust_blacklist` | 管理自动黑名单，支持新增或解除。 |
| `poke_user` | （可选）NapCat/OneBot「戳一戳」工具。 |
| `set_self_profile` | （可选）NapCat/OneBot 修改机器人资料。 |

## 数据存储

插件会在数据库中维护 `chatluna_affinity_records` 表，常见字段：

| 字段 | 说明 |
| --- | --- |
| `platform` / `userId` / `selfId` | 用户标识 |
| `affinity` | 好感度（系数 × 长期好感） |
| `longTermAffinity` / `shortTermAffinity` | 长期/短期好感度 |
| `relation` | 当前关系 |
| `coefficientState` | 系数状态（含 `coefficient` 与 `streak`） |
| `actionStats` | 模型建议的行为历史 |
| `chatCount` / `lastInteractionAt` | 聊天次数与最后互动时间 |

## 调试与排查

- 开启 `debugLogging` 可查看：触发条件、聚合后的 Bot 回复、模型原始输出、delta、综合好感变化、系数计算过程等。
- `affinity.inspect` 将展示：综合/长期/短期好感、系数、连续互动天数、动态阈值、最近聊天次数，便于调参。

## 许可证

MIT © 2024-present chatluna-affinity contributors

## 更新日志

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
- 关系设置新增新增好感度区间变量 relationshipAffinityLevel ，按配置逐行展示所有好感度区间、关系与备注

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
