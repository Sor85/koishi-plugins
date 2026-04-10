/**
 * 校验模块单元测试
 * 覆盖 query/url 的边界与安全场景
 */
import { describe, expect, it } from "vitest";
import { validateQuery, validateUrl } from "./validate";

describe("validateQuery", () => {
  it("应返回去除首尾空白后的 query", () => {
    expect(validateQuery("  hello  ", 20)).toBe("hello");
  });

  it("应拒绝空 query", () => {
    expect(() => validateQuery("   ", 20)).toThrow("query 不能为空");
  });

  it("应拒绝超长 query", () => {
    expect(() => validateQuery("123456", 5)).toThrow("query 长度不能超过 5");
  });
});

describe("validateUrl", () => {
  it("应接受合法 https url", () => {
    expect(validateUrl("https://example.com/path", 2048)).toBe(
      "https://example.com/path",
    );
  });

  it("应拒绝非法协议", () => {
    expect(() => validateUrl("file:///etc/passwd", 2048)).toThrow(
      "url 协议仅支持 http 或 https",
    );
  });

  it("应拒绝 localhost", () => {
    expect(() => validateUrl("http://localhost:3000", 2048)).toThrow(
      "目标地址不被允许",
    );
  });

  it("应拒绝内网 ipv4", () => {
    expect(() => validateUrl("http://192.168.1.10/a", 2048)).toThrow(
      "目标地址不被允许",
    );
  });

  it("应拒绝 ipv6 回环地址", () => {
    expect(() => validateUrl("http://[::1]/secret", 2048)).toThrow(
      "目标地址不被允许",
    );
  });

  it("应拒绝 ipv4 映射的 ipv6 回环地址", () => {
    expect(() => validateUrl("http://[::ffff:127.0.0.1]/secret", 2048)).toThrow(
      "目标地址不被允许",
    );
  });
});
