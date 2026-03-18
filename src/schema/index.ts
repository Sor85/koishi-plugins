/**
 * Schema 统一导出
 * 聚合插件的全部配置定义
 */

import { Schema } from "koishi";
import { BasicSettingsSchema } from "./basic-settings";
import { NativeToolsSchema } from "./native-tools";
import { XmlToolsSchema } from "./xml-tools";
import { VariablesSchema } from "./variables";

const OtherSettingsSchema = Schema.object({
  debugLogging: Schema.boolean().default(false).description("输出调试日志"),
}).description("其他设置");

export * from "./basic-settings";
export * from "./native-tools";
export * from "./xml-tools";
export * from "./variables";

export const name = "chatluna-toolbox";

export const inject = {
  required: ["chatluna"],
  optional: ["chatluna_character"],
};

export const ConfigSchema = Schema.intersect([
  BasicSettingsSchema,
  NativeToolsSchema,
  XmlToolsSchema,
  VariablesSchema,
  OtherSettingsSchema,
]);

export { ConfigSchema as Config };
