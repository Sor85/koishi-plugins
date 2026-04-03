/**
 * 插件主逻辑
 * 编排变量、原生工具与 XML 工具生命周期
 */

import { Context } from "koishi";
import type { Config } from "./types";
import { createLogger } from "./helpers";
import {
  registerNativeTools,
  resolveOneBotProtocol,
} from "./features/native-tools/register";
import {
  hasReplyToolsEnabled,
  registerCharacterReplyTools,
} from "./features/reply-tools/register";
import { registerXmlTools } from "./features/xml-tools/register";
import { registerVariables } from "./features/variables/register";

export function apply(ctx: Context, config: Config): void {
  const chatlunaService = (
    ctx as unknown as {
      chatluna?: {
        platform?: {
          registerTool?: (name: string, tool: any) => void;
        };
      };
    }
  ).chatluna;

  const plugin = {
    registerTool: (name: string, tool: any) => {
      chatlunaService?.platform?.registerTool?.(name, tool);
    },
  };
  const log = createLogger(ctx, config);
  const enableXmlRuntime =
    !config.injectXmlToolAsReplyTool &&
    (config.enablePokeXmlTool ||
      config.enableEmojiXmlTool ||
      config.enableDeleteXmlTool ||
      config.enableBanXmlTool);

  let xmlRuntime: ReturnType<typeof registerXmlTools> | null = null;
  let characterCtx: Context | null = null;
  let replyToolsDispose: (() => void) | null = null;

  const initializeServices = async (): Promise<void> => {
    log("info", "toolbox 初始化开始");

    registerVariables({ ctx, config, log });

    const protocol = resolveOneBotProtocol(config, log);
    registerNativeTools({ ctx, config, plugin, protocol, log });
    xmlRuntime = enableXmlRuntime
      ? registerXmlTools({ ctx, config, protocol, log })
      : null;
    if (characterCtx && xmlRuntime?.start()) {
      log("info", "XML 工具已启用");
    }

    log("info", "toolbox 初始化完成");
  };

  const dispose = (): void => {
    characterCtx = null;
    replyToolsDispose?.();
    replyToolsDispose = null;
    xmlRuntime?.stop();
    xmlRuntime = null;
  };

  if (
    hasReplyToolsEnabled(config) ||
    enableXmlRuntime
  ) {
    ctx.inject(["chatluna_character"], (innerCtx) => {
      characterCtx = innerCtx;
      replyToolsDispose?.();
      replyToolsDispose = hasReplyToolsEnabled(config)
        ? registerCharacterReplyTools({
            ctx: innerCtx,
            config,
            protocol: resolveOneBotProtocol(config, log),
            log,
          })
        : null;
      innerCtx.on("dispose", () => {
        if (characterCtx === innerCtx) characterCtx = null;
        replyToolsDispose?.();
        replyToolsDispose = null;
        xmlRuntime?.stop();
      });
      if (!xmlRuntime) return;
      const started = xmlRuntime.start();
      if (started) log("info", "XML 工具已启用");
    });
  }

  ctx.on("dispose", dispose);

  if (ctx.root.lifecycle.isActive) {
    void initializeServices();
  } else {
    ctx.on("ready", () => {
      void initializeServices();
    });
  }
}
