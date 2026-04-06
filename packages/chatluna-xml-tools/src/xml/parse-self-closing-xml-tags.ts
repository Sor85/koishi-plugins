/**
 * 自闭合 XML 标签解析
 * 提供标签属性提取能力
 */

export function parseSelfClosingXmlTags(
  text: string,
  tagName: string,
): Array<Record<string, string>> {
  const tags = Array.from(
    text.matchAll(new RegExp(`<${tagName}\\b([^>]*)\\/>`, "gi")),
  );
  if (!tags.length) return [];

  return tags.map((tag) => {
    const attrText = String(tag[1] || "");
    const attrs: Record<string, string> = {};
    for (const pair of attrText.matchAll(/([a-zA-Z_][\w-]*)="([^"]*)"/g)) {
      attrs[pair[1]] = pair[2];
    }
    return attrs;
  });
}
