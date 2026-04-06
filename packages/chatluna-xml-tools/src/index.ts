/**
 * 共享导出入口
 * 对外暴露 XML 解析、消息提取与 runtime 能力
 */

export * from "./xml/parse-self-closing-xml-tags";
export * from "./message/assistant-text";
export * from "./runtime/types";
export * from "./runtime/get-temp-listener";
export * from "./runtime/completion-messages-listener";
export * from "./runtime/character-temp-runtime";
