/**
 * 日志辅助
 * 提供统一日志输出方法
 */

import type { Context } from 'koishi'
import type { Config, LogFn } from '../types'

export function createLogger(ctx: Context, config: Config): LogFn {
  const logger = ctx.logger('chatluna-toolbox')

  return (level, message, meta) => {
    if (level === 'debug') {
      if (!config.debugLogging) return
      if (meta === undefined) {
        logger.info(message)
        return
      }
      logger.info(message, meta)
      return
    }

    if (meta === undefined) {
      logger[level](message)
      return
    }
    logger[level](message, meta)
  }
}
