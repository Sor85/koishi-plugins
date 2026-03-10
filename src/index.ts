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

0.2.6
- 新增
  - 新增黑名单、关系调整 XML 工具调用
  - 新增黑名单临时拉黑能力（XML）
  - 新增 blacklistList 变量（当前群黑名单信息）
  - 新增用户自定义昵称能力：userAlias XML 工具 + userAlias 变量，数据持久化到数据库
- 调整
  - 黑名单能力改为由 Bot 通过 XML 自主决策（含永久/临时与解除）
  - 黑名单相关数据由配置存储迁移为数据库存储
  - 独立 contextAffinity 变量能力并入 affinity 变量
  - 日程、天气能力拆分至 koishi-plugin-chatluna-schedule
  - 更多变量与 XML 工具能力拆分至 koishi-plugin-chatluna-toolbox
- 移除
  - 移除天气、日程、冗余变量与冗余工具（由拆分插件承接）
  - 移除设置好感度工具
  - 移除自动拉黑逻辑，改为由 Bot 决策触发

0.2.5
- 将 puppeteer 从可选依赖改为可选服务

0.2.4
- 修复状态改变后 XML 工具拦截失效的问题
`;
