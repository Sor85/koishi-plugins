/**
 * 默认值常量
 * 包含好感度、时间、阈值等默认配置
 */

export const AFFINITY_DEFAULTS = {
  MIN: 0,
  MAX: 100,
  INITIAL_MIN: 20,
  INITIAL_MAX: 40,
} as const;

export const SHORT_TERM_DEFAULTS = {
  PROMOTE_THRESHOLD: 15,
  DEMOTE_THRESHOLD: -15,
  LONG_TERM_STEP: 3,
} as const;

export const ACTION_WINDOW_DEFAULTS = {
  WINDOW_HOURS: 24,
  INCREASE_BONUS: 2,
  DECREASE_BONUS: 2,
  BONUS_CHAT_THRESHOLD: 0,
  MAX_ENTRIES: 60,
} as const;

export const COEFFICIENT_DEFAULTS = {
  BASE: 1,
  MAX_DROP: 0.3,
  MAX_BOOST: 0.3,
  DECAY_PER_DAY_RATIO: 3,
  BOOST_PER_DAY_RATIO: 3,
  FALLBACK_DECAY: 0.1,
  FALLBACK_BOOST: 0.1,
} as const;

export const TIME_CONSTANTS = {
  MS_PER_SECOND: 1000,
  MS_PER_MINUTE: 60 * 1000,
  MS_PER_HOUR: 60 * 60 * 1000,
  MS_PER_DAY: 24 * 60 * 60 * 1000,
  SECONDS_THRESHOLD: 1e11,
} as const;

export const THRESHOLDS = {
  BLACKLIST_DEFAULT: -50,
  MIN_ENTRIES: 10,
  MIN_WINDOW_HOURS: 1,
  UNBLOCK_PERMANENT_INITIAL_AFFINITY: 10,
} as const;

export const RENDER_CONSTANTS = {
  VIEWPORT_WIDTH: 800,
  VIEWPORT_BASE_HEIGHT: 220,
  VIEWPORT_ROW_HEIGHT: 48,
} as const;

export const TIMING_CONSTANTS = {
  ANALYSIS_TIMEOUT: 30000,
  BOT_REPLY_DELAY: 3000,
  SCHEDULE_RETRY_DELAY: 2000,
  SCHEDULE_CHECK_INTERVAL: 60000,
} as const;

export const FETCH_CONSTANTS = {
  HISTORY_LIMIT_MULTIPLIER: 6,
  MIN_HISTORY_LIMIT: 60,
  RANK_FETCH_MULTIPLIER: 5,
  RANK_FETCH_OFFSET: 20,
  MAX_RANK_FETCH: 200,
} as const;

export const BASE_AFFINITY_DEFAULTS = {
  initialAffinity: 30,
} as const;

export const AFFINITY_DYNAMICS_DEFAULTS = {
  shortTerm: {
    promoteThreshold: 15,
    demoteThreshold: -10,
    longTermPromoteStep: 3,
    longTermDemoteStep: 5,
  },
  actionWindow: {
    windowHours: 24,
    increaseBonus: 2,
    decreaseBonus: 2,
    bonusChatThreshold: 10,
    maxEntries: 80,
  },
  coefficient: {
    base: 1,
    maxDrop: 0.3,
    maxBoost: 0.3,
    decayPerDay: 0.05,
    boostPerDay: 0.05,
  },
} as const;
