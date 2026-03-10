[项目约束]
- ChatLuna XML 工具语义约定：`affinity`、`blacklist`、`relationship` 三类 XML 直接按显式参数执行，不再依赖 `session`、最近会话或日志回绑来猜测目标
- 当前方向下，`affinity`、`blacklist`、`relationship` 都按 `scopeId` 做多实例隔离；是否命中哪条记录由 `scopeId + userId` 等主键字段决定，而不是由 `channelId` 决定
- 相同 `scopeId` 内共享好感度、黑名单、特殊关系；不同 `scopeId` 之间必须完全隔离，不能回退到全局语义
- 插件实例必须显式绑定 `scopeId`；XML 只能引用已声明且合法的 `scopeId`，缺失或非法时直接忽略或报错
- `platform` 在 XML 工具场景默认按 `onebot` 处理，除非用户明确要求修改，不要把它当成待修问题反复调整
- `blacklist` 指令和 `blacklistList` 变量的语义是“按当前群成员列表对当前 `scopeId` 下的黑名单做展示过滤”，这里的按群只用于展示过滤，不用于 blacklist 实际生效范围
- `rank` 的语义同样是“按当前群成员列表对当前 `scopeId` 下的 affinity 数据做展示过滤”，而不是按 `channelId` 存储或隔离 affinity
- 遇到“展示范围”和“实际生效范围”不同的设计时，先区分展示过滤与存储/拦截语义，避免把展示层约束误写进底层数据语义
