/**
 * 模型响应日志拦截测试
 * 验证日志提取、单次 hook 与 runtime 生命周期行为
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  extractModelResponseText,
  hookCharacterModelResponseLogger,
  createCharacterModelResponseRuntime,
} = require("../lib/index.js");

function createMockClock() {
  const timeouts = [];
  const intervals = [];

  return {
    ctx: {
      setTimeout(callback, delay) {
        const handle = { callback, delay, active: true };
        timeouts.push(handle);
        return () => {
          handle.active = false;
        };
      },
      setInterval(callback, delay) {
        const handle = { callback, delay, active: true };
        intervals.push(handle);
        return () => {
          handle.active = false;
        };
      },
    },
    runTimeout(index = 0) {
      const handle = timeouts[index];
      if (!handle || !handle.active) return false;
      handle.callback();
      return true;
    },
    runInterval(index = 0) {
      const handle = intervals[index];
      if (!handle || !handle.active) return false;
      handle.callback();
      return true;
    },
    getTimeoutCount() {
      return timeouts.length;
    },
    getIntervalCount() {
      return intervals.length;
    },
    getTimeoutDelay(index = 0) {
      return timeouts[index]?.delay;
    },
    getIntervalDelay(index = 0) {
      return intervals[index]?.delay;
    },
  };
}

test("extractModelResponseText 提取单字符串日志中的响应内容", () => {
  const response = extractModelResponseText([
    'model response: <affinity scopeId="宁宁" userId="1" delta="5" action="increase" />',
  ]);

  assert.equal(
    response,
    '<affinity scopeId="宁宁" userId="1" delta="5" action="increase" />',
  );
});

test("extractModelResponseText 支持分参数日志格式", () => {
  const response = extractModelResponseText([
    "model response:",
    '<relationship scopeId="宁宁" userId="1" action="set" relation="哥哥" />',
  ]);

  assert.equal(
    response,
    '<relationship scopeId="宁宁" userId="1" action="set" relation="哥哥" />',
  );
});

test("extractModelResponseText 忽略非目标日志", () => {
  const response = extractModelResponseText([
    'agent intermediate response: <affinity scopeId="宁宁" userId="1" delta="5" action="increase" />',
  ]);

  assert.equal(response, null);
});

test("hookCharacterModelResponseLogger 命中模型响应时转发到处理器", async () => {
  const debugCalls = [];
  const seen = [];
  const logger = {
    debug(...args) {
      debugCalls.push(args);
    },
  };

  const unhook = hookCharacterModelResponseLogger({
    logger,
    async processModelResponse(response) {
      seen.push(response);
    },
  });

  logger.debug(
    'model response: <affinity scopeId="宁宁" userId="1" delta="5" action="increase" />',
  );

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(debugCalls.length, 1);
  assert.equal(seen.length, 1);
  assert.equal(
    seen[0],
    '<affinity scopeId="宁宁" userId="1" delta="5" action="increase" />',
  );

  unhook();
});

test("hookCharacterModelResponseLogger 遇到多个 scopeId 时仍转发完整响应", async () => {
  const logger = {
    debug() {},
  };
  const seen = [];

  hookCharacterModelResponseLogger({
    logger,
    async processModelResponse(response) {
      seen.push(response);
    },
  });

  logger.debug(
    'model response: <affinity scopeId="宁宁" userId="1" delta="5" action="increase" /><relationship scopeId="宁宁" userId="1" action="set" relation="朋友" />',
  );

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(seen.length, 1);
  assert.equal(
    seen[0],
    '<affinity scopeId="宁宁" userId="1" delta="5" action="increase" /><relationship scopeId="宁宁" userId="1" action="set" relation="朋友" />',
  );
});

test("hookCharacterModelResponseLogger unhook 后恢复原始 debug", async () => {
  const calls = [];
  const logger = {
    debug(...args) {
      calls.push(args);
    },
  };
  let processed = 0;

  const unhook = hookCharacterModelResponseLogger({
    logger,
    async processModelResponse() {
      processed += 1;
    },
  });

  unhook();
  logger.debug(
    'model response: <affinity scopeId="宁宁" userId="1" delta="5" action="increase" />',
  );

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls.length, 1);
  assert.equal(processed, 0);
});

function createLogCollector() {
  const entries = [];
  return {
    entries,
    log(level, message, detail) {
      entries.push({ level, message, detail });
    },
  };
}

test("createCharacterModelResponseRuntime start 后首次挂载成功会记录日志", () => {
  const clock = createMockClock();
  const { entries, log } = createLogCollector();
  const logger = {
    debug() {},
  };

  const runtime = createCharacterModelResponseRuntime({
    ctx: clock.ctx,
    getCharacterService: () => ({ logger }),
    async processModelResponse() {},
    log,
  });

  runtime.start();
  assert.equal(clock.getTimeoutCount(), 1);
  assert.equal(clock.getTimeoutDelay(0), 3000);
  assert.deepEqual(
    entries.map(({ level, message }) => ({ level, message })),
    [
      { level: "info", message: "模型响应拦截 runtime start 已调用" },
      { level: "debug", message: "模型响应拦截 runtime 启动中" },
    ],
  );

  clock.runTimeout(0);

  assert.deepEqual(
    entries.map(({ level, message }) => ({ level, message })),
    [
      { level: "info", message: "模型响应拦截 runtime start 已调用" },
      { level: "debug", message: "模型响应拦截 runtime 启动中" },
      { level: "info", message: "模型响应拦截 runtime 启动定时器已触发" },
      { level: "info", message: "模型响应拦截 runtime attach 检查" },
      { level: "info", message: "已挂载 chatluna_character 模型响应拦截器" },
    ],
  );
  assert.equal(runtime.isActive(), true);
  runtime.stop();
});

test("createCharacterModelResponseRuntime start 后首次挂载失败会记录 warn", () => {
  const clock = createMockClock();
  const { entries, log } = createLogCollector();

  const runtime = createCharacterModelResponseRuntime({
    ctx: clock.ctx,
    getCharacterService: () => null,
    async processModelResponse() {},
    log,
  });

  runtime.start();
  assert.equal(clock.getTimeoutDelay(0), 3000);
  clock.runTimeout(0);

  assert.deepEqual(
    entries.map(({ level, message }) => ({ level, message })),
    [
      { level: "info", message: "模型响应拦截 runtime start 已调用" },
      { level: "debug", message: "模型响应拦截 runtime 启动中" },
      { level: "info", message: "模型响应拦截 runtime 启动定时器已触发" },
      { level: "info", message: "模型响应拦截 runtime attach 检查" },
      {
        level: "warn",
        message: "chatluna_character logger 不可用，将自动重试挂载",
      },
    ],
  );
  assert.equal(runtime.isActive(), false);
  assert.equal(clock.getIntervalCount(), 2);
  runtime.stop();
});

test("createCharacterModelResponseRuntime 在 logger 晚出现时会重试挂载", async () => {
  const clock = createMockClock();
  const seen = [];
  const { entries, log } = createLogCollector();
  let service = null;

  const runtime = createCharacterModelResponseRuntime({
    ctx: clock.ctx,
    getCharacterService: () => service,
    async processModelResponse(response) {
      seen.push(response);
    },
    log,
  });

  runtime.start();
  assert.equal(clock.getTimeoutCount(), 1);
  assert.equal(clock.getTimeoutDelay(0), 3000);
  clock.runTimeout(0);
  assert.equal(runtime.isActive(), false);
  assert.equal(clock.getIntervalCount(), 2);
  assert.equal(clock.getIntervalDelay(0), 3000);
  assert.equal(clock.getIntervalDelay(1), 5000);

  const calls = [];
  service = {
    logger: {
      debug(...args) {
        calls.push(args);
      },
    },
  };

  clock.runInterval(0);
  assert.equal(runtime.isActive(), true);
  assert.deepEqual(
    entries.map(({ level, message }) => ({ level, message })),
    [
      { level: "info", message: "模型响应拦截 runtime start 已调用" },
      { level: "debug", message: "模型响应拦截 runtime 启动中" },
      { level: "info", message: "模型响应拦截 runtime 启动定时器已触发" },
      { level: "info", message: "模型响应拦截 runtime attach 检查" },
      {
        level: "warn",
        message: "chatluna_character logger 不可用，将自动重试挂载",
      },
      { level: "info", message: "模型响应拦截 runtime attach 检查" },
      { level: "info", message: "已挂载 chatluna_character 模型响应拦截器" },
      { level: "info", message: "模型响应拦截器已恢复" },
    ],
  );

  service.logger.debug(
    'model response: <affinity scopeId="宁宁" userId="2" delta="1" action="increase" />',
  );
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(seen.length, 1);
  assert.equal(calls.length, 1);
  runtime.stop();
});

test("createCharacterModelResponseRuntime 不会重复 patch 已打标的 debug", () => {
  const clock = createMockClock();
  let patchCount = 0;
  const logger = {};
  Object.defineProperty(logger, "debug", {
    configurable: true,
    enumerable: true,
    get() {
      return this._debug;
    },
    set(value) {
      patchCount += 1;
      this._debug = value;
    },
  });
  logger.debug = function debug() {};

  const runtime = createCharacterModelResponseRuntime({
    ctx: clock.ctx,
    getCharacterService: () => ({ logger }),
    async processModelResponse() {},
  });

  assert.equal(runtime.attach(), true);
  const firstDebug = logger.debug;
  assert.equal(runtime.attach(), true);
  assert.equal(logger.debug, firstDebug);
  assert.ok(patchCount >= 2);
  runtime.stop();
});

test("createCharacterModelResponseRuntime 允许多个 runtime 级联接管同一个 logger", async () => {
  const clock = createMockClock();
  const logger = {
    debug() {},
  };
  const seenA = [];
  const seenB = [];

  const runtimeA = createCharacterModelResponseRuntime({
    ctx: clock.ctx,
    getCharacterService: () => ({ logger }),
    async processModelResponse(response) {
      seenA.push(response);
    },
  });
  const runtimeB = createCharacterModelResponseRuntime({
    ctx: clock.ctx,
    getCharacterService: () => ({ logger }),
    async processModelResponse(response) {
      seenB.push(response);
    },
  });

  assert.equal(runtimeA.attach(), true);
  const debugAfterA = logger.debug;
  assert.equal(runtimeB.attach(), true);
  assert.notEqual(logger.debug, debugAfterA);
  assert.equal(runtimeA.isActive(), true);
  assert.equal(runtimeB.isActive(), true);

  logger.debug(
    'model response: <affinity scopeId="宁宁" userId="2" delta="1" action="increase" />',
  );
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(seenA.length, 1);
  assert.equal(seenB.length, 1);

  runtimeB.stop();
  assert.equal(runtimeA.isActive(), true);
  assert.equal(runtimeB.isActive(), false);

  logger.debug(
    'model response: <affinity scopeId="宁宁" userId="3" delta="1" action="increase" />',
  );
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(seenA.length, 2);
  assert.equal(seenB.length, 1);
  runtimeA.stop();
});

test("createCharacterModelResponseRuntime 在 debug 被替换后会重新挂载", () => {
  const clock = createMockClock();
  const logger = {
    debug() {},
  };

  const runtime = createCharacterModelResponseRuntime({
    ctx: clock.ctx,
    getCharacterService: () => ({ logger }),
    async processModelResponse() {},
  });

  runtime.start();
  clock.runTimeout(0);
  const firstPatched = logger.debug;
  assert.equal(runtime.isActive(), true);

  logger.debug = function replacedDebug() {};
  assert.equal(runtime.isActive(), false);
  clock.runInterval(0);
  assert.notEqual(logger.debug, firstPatched);
  assert.equal(runtime.isActive(), true);
  runtime.stop();
});

test("createCharacterModelResponseRuntime stop 后按级联顺序恢复 debug", () => {
  const clock = createMockClock();
  const originalDebug = function originalDebug() {};
  const logger = {
    debug: originalDebug,
  };

  const runtimeA = createCharacterModelResponseRuntime({
    ctx: clock.ctx,
    getCharacterService: () => ({ logger }),
    async processModelResponse() {},
  });
  const runtimeB = createCharacterModelResponseRuntime({
    ctx: clock.ctx,
    getCharacterService: () => ({ logger }),
    async processModelResponse() {},
  });

  assert.equal(runtimeA.attach(), true);
  const debugAfterA = logger.debug;
  assert.equal(runtimeB.attach(), true);
  const debugAfterB = logger.debug;
  assert.notEqual(debugAfterA, originalDebug);
  assert.notEqual(debugAfterB, debugAfterA);

  runtimeA.stop();
  assert.equal(logger.debug, debugAfterB);

  runtimeB.stop();
  assert.equal(logger.debug, originalDebug);
});
