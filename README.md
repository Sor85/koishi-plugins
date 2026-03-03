# koishi-plugin-chatluna-meme-generator

为 chatluna 提供 meme-generator（python）能力的 Koishi 插件，支持指令触发、随机模板、XML 工具调用、模板筛选与头像/文案自动补全。

## 功能简介

- 基础命令
  - `meme <key> [...texts]`：按模板生成图片
  - `meme.list`：查看可用模板（支持文本或图片渲染）
  - `meme.info <key>`：查看模板参数约束
  - `meme.preview <key>`：预览模板
  - `meme.random [...texts]`：随机模板生成
- 触发增强
  - 支持中文别名直连触发（可开关）
  - 支持 XML 工具调用触发（可开关）
  - 支持戳一戳触发随机模板（可开关）
- 自动补全策略
  - 文案补全：模板默认文案 / 用户昵称（可配权重）
  - 图片补全：发送者头像、被@头像、bot 头像组合补齐
- 模板筛选
  - 排除仅文字模板
  - 排除仅需 1 张图片模板
  - 排除需 2 张图片模板
  - 排除图文模板
  - 按 key 黑名单排除模板

### 依赖要求

- 必需服务：`http`
- 可选服务：`notifier`、`puppeteer`、`chatluna_character`
- 后端服务：需可访问 meme-generator（python）服务地址

## 快速上手

1. 在 Koishi 控制台安装并启用本插件。
2. 配置 `baseUrl` 为你的 meme-generator 服务地址。
3. 先执行 `meme.list` 确认可用模板。
4. 使用 `meme <key>` 或 `meme.random` 生成图片。

示例：

```text
meme.list
meme.info can_can_need
meme can_can_need @uesr
meme.random
```

## 更新日志

### 0.0.8

- 修复 `allowLeadingAtBeforeCommand` 与前置@触发逻辑：开启时支持 `@用户 别名` 与 `@用户 meme`，并正确改写到 meme 指令链路。
- 修复 `@bot` 对话被误拦截问题：在关闭 `allowLeadingAtBeforeCommand` 时，`@bot 别名` 不再被插件吞消息，恢复 bot 正常对话；开启时可按配置触发别名。
- 完善前置@与直连别名相关调试日志与单元测试覆盖，包含 `@bot`/`@用户`、开关双态与不吞消息场景。

### 0.0.7

- 新增 `allowLeadingAtBeforeCommand` 开关（默认关闭），用于允许前置@参数格式（如 `@用户 meme`）。
- 新增前置@参数拦截逻辑与开关双态单元测试，开启该开关后可恢复兼容前置@参数格式。

### 0.0.5

- 修复单图模板在 `meme @用户` 场景下头像补全优先级：优先使用被@用户头像，缺失时回退发送者头像。
- 优化 `enableRandomKeywordNotice` 输出格式：`meme.random` 结果附带 `key` 与中文别名，按“一行一项”展示。
