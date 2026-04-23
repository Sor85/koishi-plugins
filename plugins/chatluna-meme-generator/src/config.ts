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

export type RandomMemeBucketCategory =
  | "text-only"
  | "single-image-only"
  | "two-image-only"
  | "image-and-text"
  | "other";

export interface RandomMemeBucketWeightRule {
  category: RandomMemeBucketCategory;
  enabled: boolean;
  weight: number;
}

export interface Config {
  baseUrl: string;
  timeoutMs: number;
  emptyTextAutoFillRules: EmptyTextAutoFillRule[];
  autoUseAvatarWhenMinImagesOneAndNoImage: boolean;
  autoFillOneMissingImageWithAvatar: boolean;
  autoFillSenderAndBotAvatarsWhenMinImagesTwoAndNoImage: boolean;
  autoUseGroupNicknameWhenNoDefaultText: boolean;
  enableQuotedImageTrigger: boolean;
  enableQuotedTextTrigger: boolean;
  renderMemeListAsImage: boolean;
  enableDirectAliasWithoutPrefix: boolean;
  allowKeyWithoutPrefixTrigger?: boolean;
  allowMentionPrefixDirectAliasTrigger: boolean;
  allowLeadingAtBeforeCommand: boolean;
  enableDeveloperDebugLog: boolean;
  enableMemeXmlTool: boolean;
  injectMemeXmlToolAsReplyTool: boolean;
  memeXmlReferencePrompt?: string;
  enableRandomDedupeWithinHours: boolean;
  randomDedupeWindowHours: number;
  enableRandomKeywordNotice: boolean;
  randomMemeBucketWeightRules: RandomMemeBucketWeightRule[];
  infoFetchConcurrency: number;
  initLoadRetryTimes: number;
  disableErrorReplyToPlatform: boolean;
  excludeTextOnlyMemes: boolean;
  excludeSingleImageOnlyMemes: boolean;
  excludeTwoImageOnlyMemes: boolean;
  excludeImageAndTextMemes: boolean;
  excludeOtherMemes: boolean;
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
  enableQuotedImageTrigger: true,
  enableQuotedTextTrigger: false,
  renderMemeListAsImage: true,
  enableDirectAliasWithoutPrefix: true,
  allowKeyWithoutPrefixTrigger: false,
  allowMentionPrefixDirectAliasTrigger: false,
  allowLeadingAtBeforeCommand: false,
  enableDeveloperDebugLog: false,
  enableMemeXmlTool: false,
  injectMemeXmlToolAsReplyTool: false,
  memeXmlReferencePrompt: `## 动作指令
你可以根据需要在模型回复中输出一个独立的 <actions> 元素。它用于执行非语言的系统指令。如果不需要执行任何动作，请省略此元素。
- meme: \`<meme key="" text="" image="" at=""/>\`
  - 固定用法
    - <meme key="can_can_need" at="{bot_id}|目标用户 ID"/> ## 看看你的，调侃用户时使用
    - <meme key="erciyuan" at="目标用户 ID"/> ## 嘲笑二次元
    - <meme key="turtle_jue" at="{bot_id}|目标用户 ID"/> ## 撅，当用户惹你生气时使用
    - <meme key="hug" at="{bot_id}|目标用户 ID"/> ## 抱抱
    - <meme key="taunt" at="目标用户 ID"/> ## 嘲讽用户
    - <meme key="crawl" at="目标用户 ID"/> ## 爬，让用户爬
    - <meme key="kiss" at="{bot_id}|目标用户 ID"/> ## 亲亲
  - 要求:
    - 必须按固定用法的 at 顺序使用，不能颠倒
  - 适用场景:
    - 作为表情包的补充，使用 meme 时不要额外发送表情包`,
  enableRandomDedupeWithinHours: true,
  randomDedupeWindowHours: 24,
  enableRandomKeywordNotice: true,
  randomMemeBucketWeightRules: [
    { category: "text-only", enabled: true, weight: 100 },
    { category: "single-image-only", enabled: true, weight: 100 },
    { category: "two-image-only", enabled: true, weight: 100 },
    { category: "image-and-text", enabled: true, weight: 100 },
    { category: "other", enabled: true, weight: 100 },
  ],
  infoFetchConcurrency: 0,
  initLoadRetryTimes: 3,
  disableErrorReplyToPlatform: true,
  excludeTextOnlyMemes: false,
  excludeSingleImageOnlyMemes: false,
  excludeTwoImageOnlyMemes: false,
  excludeImageAndTextMemes: false,
  excludeOtherMemes: false,
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
  randomMemeBucketWeightRules: Schema.array(
    Schema.object({
      category: Schema.union([
        Schema.const("text-only").description("仅需文字"),
        Schema.const("single-image-only").description("仅需 1 张图片"),
        Schema.const("two-image-only").description("需 2 张图片"),
        Schema.const("image-and-text").description("需图片+文字"),
        Schema.const("other").description("其他模板"),
      ]).required(),
      enabled: Schema.boolean().default(true).description("是否启用"),
      weight: Schema.number()
        .min(0)
        .max(1000)
        .step(1)
        .default(100)
        .description("权重"),
    }),
  )
    .role("table")
    .default(defaultConfig.randomMemeBucketWeightRules)
    .description("meme.random 随机时的权重配置"),
}).description("随机触发设置");

const triggerSchema = Schema.object({
  enableDirectAliasWithoutPrefix: Schema.boolean()
    .default(defaultConfig.enableDirectAliasWithoutPrefix)
    .description("是否允许中文别名跳过指令前缀直接触发"),
  allowKeyWithoutPrefixTrigger: Schema.boolean()
    .default(defaultConfig.allowKeyWithoutPrefixTrigger ?? false)
    .description("是否允许 key 跳过指令前缀直接触发"),
  allowMentionPrefixDirectAliasTrigger: Schema.boolean()
    .default(defaultConfig.allowMentionPrefixDirectAliasTrigger)
    .description("是否允许贴合参数触发（如 meme@用户1@用户2文本参数）"),
  allowLeadingAtBeforeCommand: Schema.boolean()
    .default(defaultConfig.allowLeadingAtBeforeCommand)
    .description("是否允许前置@参数触发（如 @用户 meme）"),
  enableQuotedImageTrigger: Schema.boolean()
    .default(defaultConfig.enableQuotedImageTrigger)
    .description("是否允许引用消息中的图片参与触发"),
  enableQuotedTextTrigger: Schema.boolean()
    .default(defaultConfig.enableQuotedTextTrigger)
    .description("是否在未提供文本参数时使用引用消息文字触发"),
  enableMemeXmlTool: Schema.boolean()
    .default(defaultConfig.enableMemeXmlTool)
    .description("是否启用 XML 形式的 meme 工具调用"),
  injectMemeXmlToolAsReplyTool: Schema.boolean()
    .default(defaultConfig.injectMemeXmlToolAsReplyTool)
    .description("是否将 XML 工具改为注入实验性“工具调用回复”的参数中"),
  memeXmlReferencePrompt: Schema.string()
    .role("textarea")
    .default(defaultConfig.memeXmlReferencePrompt || "")
    .description("模型回复 XML 参考提示词，自行写入提示词中，不会自动注入，将 {bot_id} 替换为 bot 的实际 id。text、image、at 支持多个参数，参数之间使用“|”隔开，如果缺少参数，会按预设的补全设置自动补全；若开启“将 XML 工具改为注入实验性工具调用回复”，则只需提供必要参数"),
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
  excludeOtherMemes: Schema.boolean()
    .default(defaultConfig.excludeOtherMemes)
    .description("是否排除未命中现有类别排除项的其他模板"),
  excludedMemeKeys: Schema.array(Schema.string().min(1))
    .role("table")
    .default(defaultConfig.excludedMemeKeys)
    .description("排除模板 key 列表"),
}).description("模板筛选设置");

const runtimeSchema = Schema.object({
  infoFetchConcurrency: Schema.number()
    .min(0)
    .max(100)
    .step(1)
    .default(defaultConfig.infoFetchConcurrency)
    .description("模板信息拉取并发上限（0 为不限制）"),
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
  enableDeveloperDebugLog: Schema.boolean()
    .default(defaultConfig.enableDeveloperDebugLog)
    .description("开启调试日志"),
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
