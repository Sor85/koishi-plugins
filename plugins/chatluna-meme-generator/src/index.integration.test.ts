/**
 * 后端联调测试
 * 使用环境变量中的后端地址验证基础接口可达
 */

import { describe, expect, it } from 'vitest'

const baseUrl = process.env.MEME_BACKEND_BASE_URL

describe('backend integration', () => {
  it.runIf(Boolean(baseUrl))('memes keys endpoint is reachable', async () => {
    const response = await fetch(`${baseUrl}/memes/keys`)
    expect(response.ok).toBe(true)

    const keys = await response.json() as unknown
    expect(Array.isArray(keys)).toBe(true)
  })
})
