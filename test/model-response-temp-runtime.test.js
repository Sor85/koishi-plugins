/**
 * temp 模型响应运行时测试
 * 验证 getTemp 与 completionMessages.push 的接管、分发与恢复行为
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { createCharacterTempModelResponseRuntime } = require("../lib/index.js");

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

function createRuntimeHarness() {
  const messages = [];
  const temp = { completionMessages: messages };
  const calls = {
    process: [],
    log: [],
    getTemp: [],
  };

  const service = {
    async getTemp(...args) {
      calls.getTemp.push(args);
      return temp;
    },
  };

  const runtime = createCharacterTempModelResponseRuntime({
    getCharacterService: () => service,
    async processModelResponse(context) {
      calls.process.push(context);
    },
    log(level, message, detail) {
      calls.log.push({ level, message, detail });
    },
  });

  return { runtime, service, temp, messages, calls };
}

test("createCharacterTempModelResponseRuntime 未开启调试时不输出启用 info 日志", () => {
  const calls = [];
  const service = {
    async getTemp() {
      return { completionMessages: [] };
    },
  };

  const runtime = createCharacterTempModelResponseRuntime({
    getCharacterService: () => service,
    async processModelResponse() {},
    log(level, message, detail) {
      calls.push({ level, message, detail });
    },
  });

  assert.equal(runtime.start(), true);
  assert.deepEqual(calls, []);
});

test("createCharacterTempModelResponseRuntime 显式开启激活日志时输出 info", () => {
  const calls = [];
  const service = {
    async getTemp() {
      return { completionMessages: [] };
    },
  };

  const runtime = createCharacterTempModelResponseRuntime({
    getCharacterService: () => service,
    async processModelResponse() {},
    logActivation: true,
    log(level, message, detail) {
      calls.push({ level, message, detail });
    },
  });

  assert.equal(runtime.start(), true);
  assert.deepEqual(
    calls.map((item) => item.message),
    ["已启用基于 getTemp 的模型响应适配"],
  );
});

test("createCharacterTempModelResponseRuntime 在 getTemp 不可用时返回 false", () => {
  const calls = [];
  const runtime = createCharacterTempModelResponseRuntime({
    getCharacterService: () => null,
    async processModelResponse() {},
    log(level, message, detail) {
      calls.push({ level, message, detail });
    },
  });

  assert.equal(runtime.start(), false);
  assert.equal(runtime.isActive(), false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].level, "warn");
  assert.equal(
    calls[0].message,
    "chatluna_character.getTemp 不可用，跳过 temp 模型响应适配",
  );
});

test("createCharacterTempModelResponseRuntime 在 AI 消息写入时转发响应文本与 session", async () => {
  const { runtime, service, calls } = createRuntimeHarness();
  const session = { userId: "1001", selfId: "bot-a" };

  runtime.start();
  const temp = await service.getTemp(session);
  temp.completionMessages.push({
    role: "assistant",
    content: [
      {
        text: '<affinity scopeId="宁宁" userId="1001" action="increase" delta="1" />',
      },
    ],
  });
  await flush();

  assert.deepEqual(calls.process, [
    {
      response:
        '<affinity scopeId="宁宁" userId="1001" action="increase" delta="1" />',
      session,
    },
  ]);
});

test("createCharacterTempModelResponseRuntime 在未传 session 时也转发响应文本", async () => {
  const { runtime, service, calls } = createRuntimeHarness();

  runtime.start();
  const temp = await service.getTemp();
  temp.completionMessages.push({
    role: "assistant",
    content:
      '<affinity scopeId="宁宁" userId="1001" action="increase" delta="1" />',
  });
  await flush();

  assert.deepEqual(calls.process, [
    {
      response:
        '<affinity scopeId="宁宁" userId="1001" action="increase" delta="1" />',
      session: null,
    },
  ]);
});

test("createCharacterTempModelResponseRuntime 忽略非 AI 消息", async () => {
  const { runtime, service, calls } = createRuntimeHarness();

  runtime.start();
  const temp = await service.getTemp("session");
  temp.completionMessages.push({
    role: "user",
    content:
      '<affinity scopeId="宁宁" userId="1001" action="increase" delta="1" />',
  });
  await flush();

  assert.equal(calls.process.length, 0);
});

test("createCharacterTempModelResponseRuntime 对同一消息对象只处理一次", async () => {
  const { runtime, service, calls } = createRuntimeHarness();
  const session = { id: "session" };

  runtime.start();
  const temp = await service.getTemp(session);
  const message = {
    role: "assistant",
    content:
      '<relationship scopeId="宁宁" userId="1001" action="set" relation="朋友" />',
  };

  temp.completionMessages.push(message);
  temp.completionMessages.push(message);
  await flush();

  assert.equal(calls.process.length, 1);
  assert.deepEqual(calls.process[0], {
    response:
      '<relationship scopeId="宁宁" userId="1001" action="set" relation="朋友" />',
    session,
  });
});

test("createCharacterTempModelResponseRuntime stop 后恢复原始 push 并停止分发", async () => {
  const { runtime, service, temp, calls } = createRuntimeHarness();

  runtime.start();
  await service.getTemp("session");
  const patchedPush = temp.completionMessages.push;

  runtime.stop();

  assert.equal(runtime.isActive(), false);
  assert.notEqual(temp.completionMessages.push, patchedPush);

  temp.completionMessages.push({
    role: "assistant",
    content: '<userAlias scopeId="宁宁" userId="1001" name="小明" />',
  });
  await flush();

  assert.equal(calls.process.length, 0);
});

test("createCharacterTempModelResponseRuntime 支持多个 runtime 共享同一 temp dispatcher", async () => {
  const temp = { completionMessages: [] };
  const service = {
    async getTemp() {
      return temp;
    },
  };
  const seenA = [];
  const seenB = [];

  const runtimeA = createCharacterTempModelResponseRuntime({
    getCharacterService: () => service,
    async processModelResponse(context) {
      seenA.push(context);
    },
  });
  const runtimeB = createCharacterTempModelResponseRuntime({
    getCharacterService: () => service,
    async processModelResponse(context) {
      seenB.push(context);
    },
  });

  assert.equal(runtimeA.start(), true);
  assert.equal(runtimeB.start(), true);
  await service.getTemp("session");

  temp.completionMessages.push({
    role: "assistant",
    content:
      '<affinity scopeId="宁宁" userId="1001" action="increase" delta="3" />',
  });
  await flush();

  assert.equal(seenA.length, 1);
  assert.equal(seenB.length, 1);

  runtimeB.stop();
  temp.completionMessages.push({
    role: "assistant",
    content:
      '<affinity scopeId="宁宁" userId="1001" action="increase" delta="4" />',
  });
  await flush();

  assert.equal(seenA.length, 2);
  assert.equal(seenB.length, 1);

  runtimeA.stop();
});

test("createCharacterTempModelResponseRuntime 在处理器报错时记录 warn 且继续处理后续消息", async () => {
  const temp = { completionMessages: [] };
  const processCalls = [];
  const logCalls = [];
  let shouldFail = true;
  const session = { id: "session" };
  const service = {
    async getTemp() {
      return temp;
    },
  };

  const runtime = createCharacterTempModelResponseRuntime({
    getCharacterService: () => service,
    async processModelResponse(context) {
      processCalls.push(context);
      if (shouldFail) {
        shouldFail = false;
        throw new Error("boom");
      }
    },
    log(level, message, detail) {
      logCalls.push({ level, message, detail });
    },
  });

  runtime.start();
  await service.getTemp(session);

  temp.completionMessages.push({
    role: "assistant",
    content:
      '<affinity scopeId="宁宁" userId="1001" action="increase" delta="1" />',
  });
  await flush();
  temp.completionMessages.push({
    role: "assistant",
    content: '<relationship scopeId="宁宁" userId="1001" action="clear" />',
  });
  await flush();

  assert.deepEqual(processCalls, [
    {
      response:
        '<affinity scopeId="宁宁" userId="1001" action="increase" delta="1" />',
      session,
    },
    {
      response: '<relationship scopeId="宁宁" userId="1001" action="clear" />',
      session,
    },
  ]);
  assert.equal(logCalls.length, 1);
  assert.equal(logCalls[0].level, "warn");
  assert.equal(logCalls[0].message, "处理 completionMessages 模型响应失败");
  assert.equal(logCalls[0].detail.message, "boom");
});

test("createCharacterTempModelResponseRuntime 在 character 服务实例被替换后会重新挂载到新实例", async () => {
  const tempA = { completionMessages: [] };
  const tempB = { completionMessages: [] };
  const serviceA = {
    async getTemp() {
      return tempA;
    },
  };
  const serviceB = {
    async getTemp() {
      return tempB;
    },
  };

  let currentService = serviceA;
  const processCalls = [];
  const beforeSession = { id: "before-reload" };
  const afterSession = { id: "after-reload" };
  const runtime = createCharacterTempModelResponseRuntime({
    getCharacterService: () => currentService,
    async processModelResponse(context) {
      processCalls.push(context);
    },
  });

  assert.equal(runtime.start(), true);
  await serviceA.getTemp(beforeSession);

  tempA.completionMessages.push({
    role: "assistant",
    content:
      '<affinity scopeId="宁宁" userId="1001" action="increase" delta="1" />',
  });
  await flush();

  currentService = serviceB;
  assert.equal(runtime.start(), true);
  await serviceB.getTemp(afterSession);

  tempB.completionMessages.push({
    role: "assistant",
    content:
      '<affinity scopeId="宁宁" userId="1001" action="increase" delta="2" />',
  });
  await flush();

  assert.deepEqual(processCalls, [
    {
      response:
        '<affinity scopeId="宁宁" userId="1001" action="increase" delta="1" />',
      session: beforeSession,
    },
    {
      response:
        '<affinity scopeId="宁宁" userId="1001" action="increase" delta="2" />',
      session: afterSession,
    },
  ]);
});
