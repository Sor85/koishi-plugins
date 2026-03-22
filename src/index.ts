/**
 * 插件入口
 * 导出 Koishi 插件元信息与主 apply 函数
 */

export { name, inject, ConfigSchema as Config } from "./schema";
export { apply } from "./plugin";

export * from "./types";
export * from "./schema";
export * from "./features/native-tools/register";
export * from "./features/native-tools/onebot-api";
export * from "./features/native-tools/session";
export * from "./features/native-tools/tools/poke";
export * from "./features/native-tools/tools/profile";
export * from "./features/native-tools/tools/set-group-card";
export * from "./features/native-tools/tools/set-group-ban";
export * from "./features/native-tools/tools/set-msg-emoji";
export * from "./features/native-tools/tools/delete-msg";
export * from "./features/xml-tools/parser";
export * from "./features/xml-tools/processor";
export * from "./features/xml-tools/temp-runtime";
export * from "./features/xml-tools/register";
export * from "./features/variables/register";
export * from "./features/variables/providers/user-info";
export * from "./features/variables/providers/bot-info";
export * from "./features/variables/providers/group-info";
export * from "./features/variables/providers/random";
export * from "./helpers";
export * from "./constants";
