/**
 * 通用 temp runtime 测试
 * 覆盖接管、分发、恢复与 service 切换行为
 */

import { describe, expect, it, vi } from "vitest";
import { createCharacterTempRuntime } from "../src/runtime/character-temp-runtime";

interface SessionLike {
  id?: string;
}

interface TempLike {
  completionMessages?: unknown[];
}

describe("createCharacterTempRuntime", () => {
  it("service 缺失时 start 返回 false 并触发 onServiceMissing", () => {
    const onServiceMissing = vi.fn();
    const runtime = createCharacterTempRuntime<TempLike, SessionLike>({
      getCharacterService: () => null,
      symbolNamespace: "runtime-unit-missing",
      onServiceMissing,
      onResponse: () => {},
    });

    expect(runtime.start()).toBe(false);
    expect(runtime.isActive()).toBe(false);
    expect(onServiceMissing).toHaveBeenCalledTimes(1);
  });

  it("assistant 消息会触发 onResponse 并透传 session", async () => {
    const temp = { completionMessages: [] as unknown[] };
    const service = {
      getTemp: vi.fn(async () => temp),
    };
    const onResponse = vi.fn();

    const runtime = createCharacterTempRuntime<TempLike, SessionLike>({
      getCharacterService: () => service,
      symbolNamespace: "runtime-unit-dispatch",
      resolveSession: (args) => (args[0] as SessionLike) ?? null,
      onResponse,
    });

    expect(runtime.start()).toBe(true);
    await service.getTemp({ id: "s-1" });
    temp.completionMessages?.push({ role: "assistant", content: "  hello " });
    await Promise.resolve();

    expect(onResponse).toHaveBeenCalledTimes(1);
    expect(onResponse).toHaveBeenCalledWith({
      response: "hello",
      message: { role: "assistant", content: "  hello " },
      session: { id: "s-1" },
    });
  });

  it("stop 后恢复原始 getTemp 与 push", async () => {
    const completionMessages: unknown[] = [];
    const originalPush = completionMessages.push;
    const temp = { completionMessages };
    const originalGetTemp = vi.fn(async () => temp);
    const service = {
      getTemp: originalGetTemp,
    };

    const runtime = createCharacterTempRuntime<TempLike, SessionLike>({
      getCharacterService: () => service,
      symbolNamespace: "runtime-unit-stop",
      onResponse: () => {},
    });

    expect(runtime.start()).toBe(true);
    expect(service.getTemp).not.toBe(originalGetTemp);
    await service.getTemp({ id: "s-2" });
    expect(completionMessages.push).not.toBe(originalPush);

    runtime.stop();

    expect(service.getTemp).toBe(originalGetTemp);
    expect(completionMessages.push).toBe(originalPush);
    expect(runtime.isActive()).toBe(false);
  });

  it("service 切换后恢复旧 service 并绑定新 service", async () => {
    const tempA = { completionMessages: [] as unknown[] };
    const tempB = { completionMessages: [] as unknown[] };
    const serviceA = {
      getTemp: vi.fn(async () => tempA),
    };
    const serviceB = {
      getTemp: vi.fn(async () => tempB),
    };

    const originalAGetTemp = serviceA.getTemp;
    const originalBGetTemp = serviceB.getTemp;
    let currentService: typeof serviceA | typeof serviceB = serviceA;

    const onResponse = vi.fn();
    const runtime = createCharacterTempRuntime<TempLike, SessionLike>({
      getCharacterService: () => currentService,
      symbolNamespace: "runtime-unit-switch",
      onResponse,
      resolveSession: (args) => (args[0] as SessionLike) ?? null,
    });

    expect(runtime.start()).toBe(true);
    await serviceA.getTemp({ id: "a" });
    tempA.completionMessages?.push({ role: "assistant", content: "A" });
    await Promise.resolve();

    currentService = serviceB;
    expect(runtime.start()).toBe(true);
    expect(serviceA.getTemp).toBe(originalAGetTemp);
    await serviceB.getTemp({ id: "b" });
    tempB.completionMessages?.push({ role: "assistant", content: "B" });
    await Promise.resolve();

    expect(onResponse).toHaveBeenCalledTimes(2);
    expect(serviceB.getTemp).not.toBe(originalBGetTemp);

    runtime.stop();
    expect(serviceB.getTemp).toBe(originalBGetTemp);
  });
});
