/**
 * getTemp 监听测试
 * 覆盖 patch、监听与恢复行为
 */

import { describe, expect, it } from "vitest";
import { registerGetTempListener } from "../src/runtime/get-temp-listener";

describe("registerGetTempListener", () => {
  it("在 getTemp 调用后分发 temp 与 session", async () => {
    const messages: unknown[] = [];
    const temp = { completionMessages: messages };
    const service = {
      getTemp: async (..._args: unknown[]) => temp,
    };

    const seen: Array<{ temp: unknown; session: unknown }> = [];
    const stop = registerGetTempListener(
      service,
      (nextTemp, session) => {
        seen.push({ temp: nextTemp, session });
      },
      { symbolNamespace: "unit-test" },
    );

    await service.getTemp?.({ userId: "1001" });
    expect(seen).toEqual([{ temp, session: { userId: "1001" } }]);

    stop?.();
  });

  it("最后一个监听器移除后恢复原始 getTemp", async () => {
    const service = {
      getTemp: async (..._args: unknown[]) => ({ completionMessages: [] as unknown[] }),
    };
    const original = service.getTemp;

    const stopA = registerGetTempListener(
      service,
      () => {},
      { symbolNamespace: "unit-test-restore" },
    );
    const stopB = registerGetTempListener(
      service,
      () => {},
      { symbolNamespace: "unit-test-restore" },
    );

    expect(service.getTemp).not.toBe(original);
    stopA?.();
    expect(service.getTemp).not.toBe(original);
    stopB?.();
    expect(service.getTemp).toBe(original);
  });
});
