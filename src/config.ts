/**
 * 插件配置模型与默认值
 * 按功能分组定义控制台配置项
 */

import { Schema } from "koishi";

export type EmptyTextAutoFillSource = "template-default" | "user-nickname";

export interface EmptyTextAutoFillRule {
  source: EmptyTextAutoFillSource;
  enabled: boolean;
  weight: number;
}

export interface Config {
  baseUrl: string;
  timeoutMs: number;
  emptyTextAutoFillRules: EmptyTextAutoFillRule[];
  autoFillDefaultTextsWhenEmpty?: boolean;
  autoUseAvatarWhenMinImagesOneAndNoImage: boolean;
  autoFillOneMissingImageWithAvatar: boolean;
  autoFillSenderAndBotAvatarsWhenMinImagesTwoAndNoImage: boolean;
  autoUseGroupNicknameWhenNoDefaultText: boolean;
  renderMemeListAsImage: boolean;
  enableDirectAliasWithoutPrefix: boolean;
  allowMentionPrefixDirectAliasTrigger: boolean;
  disallowLeadingAtBeforeCommand: boolean;
  enableMemeXmlTool: boolean;
  memeXmlReferencePrompt?: string;
  enableRandomDedupeWithinHours: boolean;
  randomDedupeWindowHours: number;
  enableRandomKeywordNotice: boolean;
  enablePokeTriggerRandom: boolean;
  pokeTriggerCooldownSeconds: number;
  enableInfoFetchConcurrencyLimit: boolean;
  infoFetchConcurrency: number;
  initLoadRetryTimes: number;
  disableErrorReplyToPlatform: boolean;
  excludeTextOnlyMemes: boolean;
  excludeSingleImageOnlyMemes: boolean;
  excludeTwoImageOnlyMemes: boolean;
  excludeImageAndTextMemes: boolean;
  excludedMemeKeys: string[];
}

export const defaultConfig: Config = {
  baseUrl: "",
  timeoutMs: 10000,
  emptyTextAutoFillRules: [
    {
      source: "template-default",
      enabled: true,
      weight: 100,
    },
    {
      source: "user-nickname",
      enabled: true,
      weight: 100,
    },
  ],
  autoUseAvatarWhenMinImagesOneAndNoImage: true,
  autoFillOneMissingImageWithAvatar: true,
  autoFillSenderAndBotAvatarsWhenMinImagesTwoAndNoImage: true,
  autoUseGroupNicknameWhenNoDefaultText: true,
  renderMemeListAsImage: true,
  enableDirectAliasWithoutPrefix: true,
  allowMentionPrefixDirectAliasTrigger: false,
  disallowLeadingAtBeforeCommand: true,
  enableMemeXmlTool: false,
  memeXmlReferencePrompt:
    '可用 XML 工具调用格式：<meme key="memekey" text="text1|text2" image="url1|url2" at="userid1|userid2"/>\n支持参数：key、text、image、at\n示例：<meme key="can_can_need" at="123456"/>\n如果缺少参数，会按预设的补全设置自动补全',
  enableRandomDedupeWithinHours: true,
  randomDedupeWindowHours: 24,
  enableRandomKeywordNotice: true,
  enablePokeTriggerRandom: false,
  pokeTriggerCooldownSeconds: 0,
  enableInfoFetchConcurrencyLimit: false,
  infoFetchConcurrency: 10,
  initLoadRetryTimes: 3,
  disableErrorReplyToPlatform: true,
  excludeTextOnlyMemes: false,
  excludeSingleImageOnlyMemes: false,
  excludeTwoImageOnlyMemes: false,
  excludeImageAndTextMemes: false,
  excludedMemeKeys: [],
};

const basicSchema = Schema.object({
  baseUrl: Schema.string()
    .role("link")
    .default(defaultConfig.baseUrl)
    .description("后端服务地址"),
  timeoutMs: Schema.number()
    .min(1000)
    .max(60000)
    .default(defaultConfig.timeoutMs)
    .description("请求超时时间（毫秒）"),
}).description("基础设置");

const textSchema = Schema.object({
  emptyTextAutoFillRules: Schema.array(
    Schema.object({
      source: Schema.union([
        Schema.const("template-default").description("模板默认文字"),
        Schema.const("user-nickname").description("用户昵称"),
      ]).required(),
      enabled: Schema.boolean().default(true).description("是否启用"),
      weight: Schema.number()
        .min(0)
        .max(1000)
        .step(1)
        .default(100)
        .description("权重（双开来源时用于随机分配）"),
    }),
  )
    .role("table")
    .default(defaultConfig.emptyTextAutoFillRules)
    .description("未提供文本时的自动补全文案来源"),
  autoFillDefaultTextsWhenEmpty: Schema.boolean()
    .default(true)
    .description("兼容旧配置：未提供文本时是否自动使用模板默认文字")
    .hidden(),
  autoUseGroupNicknameWhenNoDefaultText: Schema.boolean()
    .default(defaultConfig.autoUseGroupNicknameWhenNoDefaultText)
    .description("模板无默认文字时是否优先使用群昵称补文案"),
}).description("文本补全设置");

const imageSchema = Schema.object({
  autoUseAvatarWhenMinImagesOneAndNoImage: Schema.boolean()
    .default(defaultConfig.autoUseAvatarWhenMinImagesOneAndNoImage)
    .description("最少需 1 图且无图时自动补发送者头像"),
  autoFillOneMissingImageWithAvatar: Schema.boolean()
    .default(defaultConfig.autoFillOneMissingImageWithAvatar)
    .description("已提供图片且仅差 1 图时自动补发送者头像"),
  autoFillSenderAndBotAvatarsWhenMinImagesTwoAndNoImage: Schema.boolean()
    .default(
      defaultConfig.autoFillSenderAndBotAvatarsWhenMinImagesTwoAndNoImage,
    )
    .description("最少需 2 图且无图时自动补发送者与 bot 头像"),
}).description("图片补全设置");

const randomSchema = Schema.object({
  enableRandomDedupeWithinHours: Schema.boolean()
    .default(defaultConfig.enableRandomDedupeWithinHours)
    .description("是否开启 meme.random 时间窗口去重"),
  randomDedupeWindowHours: Schema.number()
    .min(1)
    .max(720)
    .step(1)
    .default(defaultConfig.randomDedupeWindowHours)
    .description("meme.random 去重时间窗口（小时）"),
  enableRandomKeywordNotice: Schema.boolean()
    .default(defaultConfig.enableRandomKeywordNotice)
    .description("meme.random 是否附带模板关键词提示"),
  enablePokeTriggerRandom: Schema.boolean()
    .default(defaultConfig.enablePokeTriggerRandom)
    .description("是否启用戳一戳触发 meme.random"),
  pokeTriggerCooldownSeconds: Schema.number()
    .min(0)
    .max(86400)
    .step(1)
    .default(defaultConfig.pokeTriggerCooldownSeconds)
    .description("戳一戳触发冷却（秒），0 为禁用"),
}).description("随机触发设置");

const triggerSchema = Schema.object({
  enableDirectAliasWithoutPrefix: Schema.boolean()
    .default(defaultConfig.enableDirectAliasWithoutPrefix)
    .description("是否允许中文别名跳过指令前缀直接触发"),
  allowMentionPrefixDirectAliasTrigger: Schema.boolean()
    .default(defaultConfig.allowMentionPrefixDirectAliasTrigger)
    .description("是否允许贴合参数触发（如 看看你的xxxx@user1@user2）"),
  disallowLeadingAtBeforeCommand: Schema.boolean()
    .default(defaultConfig.disallowLeadingAtBeforeCommand)
    .description("是否禁止前置@参数触发（如 @用户 meme）"),
  enableMemeXmlTool: Schema.boolean()
    .default(defaultConfig.enableMemeXmlTool)
    .description("是否启用 XML 形式的 meme 工具调用"),
  memeXmlReferencePrompt: Schema.string()
    .role("textarea")
    .default(defaultConfig.memeXmlReferencePrompt || "")
    .description("参考提示词"),
}).description("触发方式设置");

const filterSchema = Schema.object({
  excludeTextOnlyMemes: Schema.boolean()
    .default(defaultConfig.excludeTextOnlyMemes)
    .description("是否排除仅需文字的模板"),
  excludeSingleImageOnlyMemes: Schema.boolean()
    .default(defaultConfig.excludeSingleImageOnlyMemes)
    .description("是否排除仅需 1 张图片的模板"),
  excludeTwoImageOnlyMemes: Schema.boolean()
    .default(defaultConfig.excludeTwoImageOnlyMemes)
    .description("是否排除需 2 张图片的模板"),
  excludeImageAndTextMemes: Schema.boolean()
    .default(defaultConfig.excludeImageAndTextMemes)
    .description("是否排除需图片+文字的模板"),
  excludedMemeKeys: Schema.array(Schema.string().min(1))
    .role("table")
    .default(defaultConfig.excludedMemeKeys)
    .description("排除模板 key 列表"),
}).description("模板筛选设置");

const runtimeSchema = Schema.object({
  enableInfoFetchConcurrencyLimit: Schema.boolean()
    .default(defaultConfig.enableInfoFetchConcurrencyLimit)
    .description("是否开启模板信息拉取并发限制"),
  infoFetchConcurrency: Schema.number()
    .min(1)
    .max(100)
    .step(1)
    .default(defaultConfig.infoFetchConcurrency)
    .description("模板信息拉取并发上限"),
  initLoadRetryTimes: Schema.number()
    .min(0)
    .max(20)
    .step(1)
    .default(defaultConfig.initLoadRetryTimes)
    .description("初始化载入模板失败后的自动重试次数"),
  disableErrorReplyToPlatform: Schema.boolean()
    .default(defaultConfig.disableErrorReplyToPlatform)
    .description("是否关闭平台错误回复（仅写日志）"),
  renderMemeListAsImage: Schema.boolean()
    .default(defaultConfig.renderMemeListAsImage)
    .description("meme.list 是否以图片形式输出"),
}).description("其他设置");

export const ConfigSchema: Schema<Config> = Schema.intersect([
  basicSchema,
  textSchema,
  imageSchema,
  randomSchema,
  triggerSchema,
  filterSchema,
  runtimeSchema,
]);
