/**
 * 错误映射单元测试
 * 验证后端状态码与网络错误提示输出
 */

import { describe, expect, it } from 'vitest'
import { mapBackendStatus, mapNetworkError } from './errors'

describe('mapBackendStatus', () => {
  it('已知状态码 531 映射模板不存在', () => {
    expect(mapBackendStatus(531)).toContain('模板不存在')
  })

  it('已知状态码 541 映射图片数量错误', () => {
    expect(mapBackendStatus(541)).toContain('图片数量')
  })

  it('未知状态码使用兜底文案', () => {
    expect(mapBackendStatus(499)).toContain('请求失败')
  })

  it('无状态码时使用 detail 或默认文案', () => {
    expect(mapBackendStatus(undefined, 'x')).toBe('x')
    expect(mapBackendStatus(undefined)).toContain('后端返回异常')
  })
})

describe('mapNetworkError', () => {
  it('Error 对象输出包含 message', () => {
    const text = mapNetworkError(new Error('timeout'))
    expect(text).toContain('timeout')
  })

  it('非 Error 输入返回默认网络文案', () => {
    expect(mapNetworkError('unknown')).toContain('后端不可用或超时')
  })
})
