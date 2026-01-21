/**
 * 工具 Schema
 * 定义 OneBot 工具和其他工具相关的配置项
 */

import { Schema } from 'koishi'

export const NativeToolsSchema = Schema.object({
    enableNapCatProtocol: Schema.boolean().default(true).description('启用 NapCat OneBot 协议（与 LLBot 二选一）'),
    enableLlbotProtocol: Schema.boolean().default(false).description('启用 LLBot OneBot 协议（与 NapCat 二选一）'),
    enablePokeTool: Schema.boolean().default(false).description('注册 ChatLuna 工具：戳一戳'),
    pokeToolName: Schema.string().default('poke_user').description('ChatLuna 工具名称：戳一戳'),
    enableSetSelfProfileTool: Schema.boolean().default(false).description('注册 ChatLuna 工具：修改自身账户信息'),
    setSelfProfileToolName: Schema.string().default('set_self_profile').description('ChatLuna 工具名称：修改自身账户信息（支持昵称/签名/性别）'),
    enableSetGroupCardTool: Schema.boolean().default(false).description('注册 ChatLuna 工具：修改群成员昵称'),
    setGroupCardToolName: Schema.string().default('set_group_card').description('ChatLuna 工具名称：修改群成员昵称'),
    enableSetMsgEmojiTool: Schema.boolean()
        .default(false)
        .description(
            '注册 ChatLuna 工具：给消息添加表情（需 chatluna-character 开启 enableMessageId，可用表情 ID 见 https://bot.q.qq.com/wiki/develop/gosdk/model/emoji ）'
        ),
    setMsgEmojiToolName: Schema.string().default('set_msg_emoji').description('ChatLuna 工具名称：给消息添加表情'),
    enableForwardMessageTool: Schema.boolean()
        .default(false)
        .description('注册 ChatLuna 工具：合并转发消息（需 chatluna-character 开启 enableMessageId，未完成）'),
    forwardMessageToolName: Schema.string()
        .default('send_forward_msg')
        .description('ChatLuna 工具名称：合并转发消息'),
    enableFakeMessageTool: Schema.boolean()
        .default(false)
        .description('注册 ChatLuna 工具：伪造消息'),
    fakeMessageToolName: Schema.string()
        .default('send_fake_msg')
        .description('ChatLuna 工具名称：伪造消息'),
    enableDeleteMessageTool: Schema.boolean()
        .default(false)
        .description('注册 ChatLuna 工具：撤回消息（需 chatluna-character 开启 enableMessageId）'),
    deleteMessageToolName: Schema.string().default('delete_msg').description('ChatLuna 工具名称：撤回消息'),
    panSouTool: Schema.object({
        enablePanSouTool: Schema.boolean().default(false).description('注册 ChatLuna 工具：网盘搜索'),
        panSouToolName: Schema.string().default('pansou_search').description('ChatLuna 工具名称：网盘搜索'),
        panSouApiUrl: Schema.string().default('http://localhost:8888').description('PanSou API 地址'),
        panSouAuthEnabled: Schema.boolean().default(false).description('是否启用 PanSou 认证'),
        panSouUsername: Schema.string().default('').description('PanSou 认证用户名'),
        panSouPassword: Schema.string().role('secret').default('').description('PanSou 认证密码'),
        panSouDefaultCloudTypes: Schema.array(
            Schema.union([
                Schema.const('baidu').description('百度网盘'),
                Schema.const('aliyun').description('阿里云盘'),
                Schema.const('quark').description('夸克网盘'),
                Schema.const('tianyi').description('天翼云盘'),
                Schema.const('uc').description('UC网盘'),
                Schema.const('mobile').description('移动云盘'),
                Schema.const('115').description('115网盘'),
                Schema.const('pikpak').description('PikPak'),
                Schema.const('xunlei').description('迅雷网盘'),
                Schema.const('123').description('123网盘'),
                Schema.const('magnet').description('磁力链接'),
                Schema.const('ed2k').description('电驴链接')
            ])
        ).role('checkbox').default([]).description('默认返回的网盘类型（为空则返回所有类型）'),
        panSouMaxResults: Schema.number().default(5).min(1).max(20).description('每种网盘类型最大返回结果数')
    }).description('网盘搜索工具').collapse()
}).description('原生工具')

export const XmlToolsSchema = Schema.object({
    enablePokeXmlTool: Schema.boolean()
        .default(false)
        .description('启用 XML 形式的戳一戳调用（解析 &lt;poke id=""/&gt;）'),
    enableEmojiXmlTool: Schema.boolean()
        .default(false)
        .description(
            '启用 XML 形式的消息表情调用（解析 &lt;emoji message_id="" emoji_id=""/&gt;，需 chatluna-character 开启 enableMessageId，可用表情 ID 见 https://bot.q.qq.com/wiki/develop/gosdk/model/emoji ）'
        ),
    enableDeleteXmlTool: Schema.boolean()
        .default(false)
        .description('启用 XML 形式的消息撤回调用（解析 &lt;delete message_id=""/&gt;，需 chatluna-character 开启 enableMessageId）')
}).description('XML 工具')

export const OtherCommandsSchema = Schema.object({
    groupListRenderAsImage: Schema.boolean().default(false).description('将群聊列表渲染为图片（affinity.groupList）'),
    inspectRenderAsImage: Schema.boolean().default(false).description('将好感度详情渲染为图片（affinity.inspect）'),
    inspectShowImpression: Schema.boolean().default(true).description('在好感度详情中显示印象（affinity.inspect）')
}).description('其他指令')

export const OtherSettingsSchema = Schema.object({
    debugLogging: Schema.boolean().default(false).description('输出调试日志'),
    affinityGroups: Schema.array(
        Schema.object({
            groupName: Schema.string().required().description('分组名称'),
            botIds: Schema.array(Schema.string()).default([]).description('组内 Bot 的 selfId 列表')
        })
    ).default([]).description('好感度共享分组（同组 Bot 共享好感度数据）')
}).description('其他设置')
