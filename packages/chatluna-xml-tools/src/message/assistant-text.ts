/**
 * assistant 消息文本提取
 * 统一处理 content/text/children/attrs 结构
 */

export interface AssistantMessageLike {
  _getType?: () => unknown;
  type?: unknown;
  role?: unknown;
  content?: unknown;
  text?: unknown;
}

export function getMessageType(
  message: AssistantMessageLike | null | undefined,
): string {
  if (!message) return "";
  if (typeof message._getType === "function") {
    return String(message._getType() || "")
      .trim()
      .toLowerCase();
  }
  return String(message.type || message.role || "")
    .trim()
    .toLowerCase();
}

export function isAssistantMessage(
  message: AssistantMessageLike | null | undefined,
): boolean {
  const type = getMessageType(message);
  return type === "assistant" || type === "ai";
}

export function extractTextContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (Array.isArray(value)) {
    return value.map((item) => extractTextContent(item)).join("");
  }
  if (typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  if (typeof record.text === "string") return record.text;
  if (record.content !== undefined && record.content !== value) {
    return extractTextContent(record.content);
  }
  if (Array.isArray(record.children)) {
    return extractTextContent(record.children);
  }
  if (typeof record.attrs === "object" && record.attrs) {
    const attrs = record.attrs as Record<string, unknown>;
    if (typeof attrs.content === "string") return attrs.content;
    if (typeof attrs.text === "string") return attrs.text;
  }
  return "";
}

export function extractAssistantText(
  message: AssistantMessageLike | null | undefined,
): string {
  if (!isAssistantMessage(message)) return "";
  return extractTextContent(message?.content ?? message?.text).trim();
}
