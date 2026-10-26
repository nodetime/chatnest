-- 全量中文注释落库:为 0005 迁移后的 12 张表、全部字段、全部索引与约束写入 PG 目录注释。
-- 仅含 COMMENT ON 语句(天然幂等,可重复执行),不改动任何类型、约束逻辑与数据。
-- 对象名称以 0005 迁移后的实库为准(documents 的类型列沿用历史列名 text)。

-- ============ 表注释(12) ============

COMMENT ON TABLE users IS '用户账号表:认证体系的用户主档,其余业务表经外键引用';
--> statement-breakpoint
COMMENT ON TABLE chats IS '会话表:一次完整对话的元信息与可见范围';
--> statement-breakpoint
COMMENT ON TABLE messages IS '会话消息表:按角色存储会话内每一轮发言,内容以分片 JSON 保存';
--> statement-breakpoint
COMMENT ON TABLE votes IS '消息评价表:用户对单条消息点赞或点踩,用于反馈与排序';
--> statement-breakpoint
COMMENT ON TABLE documents IS '用户文档表:编辑器与知识检索共用的长文本载体,按时间保留多版本';
--> statement-breakpoint
COMMENT ON TABLE suggestions IS '文档修改建议表:针对文档选区生成的 AI 改写建议,等待用户采纳或忽略';
--> statement-breakpoint
COMMENT ON TABLE streams IS '流式生成续传表:登记可恢复的 SSE 流,客户端断线后凭流 id 恢复未完成的生成';
--> statement-breakpoint
COMMENT ON TABLE mcp_settings IS 'MCP 接入设置表:工作区级单例,连接配置以加密密文整体存放,明文不出库';
--> statement-breakpoint
COMMENT ON TABLE upload_settings IS '附件上传开关表:工作区级单例,控制上传功能总开关';
--> statement-breakpoint
COMMENT ON TABLE upload_assets IS '上传附件元数据表:库内只存元数据与解析结果,文件字节落在运维方持久目录';
--> statement-breakpoint
COMMENT ON TABLE upload_asset_messages IS '附件-消息关联表:记录消息实际引用了哪些附件,多对多关系';
--> statement-breakpoint
COMMENT ON TABLE model_settings IS '模型访问设置表:工作区级单例,模型供应商凭证以加密密文整体存放,明文不出库';

-- ============ 字段注释(69) ============

COMMENT ON COLUMN users.created_at IS '账号创建时间';
--> statement-breakpoint
COMMENT ON COLUMN users.email IS '登录邮箱,认证与账号找回的凭证';
--> statement-breakpoint
COMMENT ON COLUMN users.email_verified IS '邮箱是否已完成验证';
--> statement-breakpoint
COMMENT ON COLUMN users.id IS '用户唯一标识(uuid),全库各表通过外键引用';
--> statement-breakpoint
COMMENT ON COLUMN users.image IS '头像图片 URL';
--> statement-breakpoint
COMMENT ON COLUMN users.is_anonymous IS '是否匿名(访客)账号:无持久登录凭证';
--> statement-breakpoint
COMMENT ON COLUMN users.name IS '展示昵称';
--> statement-breakpoint
COMMENT ON COLUMN users.password IS '登录口令散列;匿名或第三方登录账号为空';
--> statement-breakpoint
COMMENT ON COLUMN users.updated_at IS '账号资料最近一次更新时间';
--> statement-breakpoint
COMMENT ON COLUMN chats.created_at IS '会话创建时间';
--> statement-breakpoint
COMMENT ON COLUMN chats.id IS '会话唯一标识';
--> statement-breakpoint
COMMENT ON COLUMN chats.title IS '会话标题,由首条消息自动生成摘要';
--> statement-breakpoint
COMMENT ON COLUMN chats.user_id IS '所属用户外键,指向 users.id';
--> statement-breakpoint
COMMENT ON COLUMN chats.visibility IS '可见性:public 全员可见 / private 仅本人可见';
--> statement-breakpoint
COMMENT ON COLUMN messages.attachments IS '消息附件引用列表 JSON:文件与工具产物在消息上的挂载点';
--> statement-breakpoint
COMMENT ON COLUMN messages.chat_id IS '所属会话外键,指向 chats.id';
--> statement-breakpoint
COMMENT ON COLUMN messages.created_at IS '消息发送时间';
--> statement-breakpoint
COMMENT ON COLUMN messages.id IS '消息唯一标识';
--> statement-breakpoint
COMMENT ON COLUMN messages.parts IS '消息内容分片 JSON(AI SDK UIMessage parts:文本/推理/工具调用等结构化片段)';
--> statement-breakpoint
COMMENT ON COLUMN messages.role IS '发言角色:user 用户提问 / assistant 助手回答 / system 系统指令';
--> statement-breakpoint
COMMENT ON COLUMN votes.chat_id IS '所属会话外键,指向 chats.id,联合主键之一';
--> statement-breakpoint
COMMENT ON COLUMN votes.is_upvoted IS '评价方向:true 点赞 / false 点踩';
--> statement-breakpoint
COMMENT ON COLUMN votes.message_id IS '被评价消息外键,指向 messages.id,联合主键之一';
--> statement-breakpoint
COMMENT ON COLUMN documents.content IS '文档正文内容';
--> statement-breakpoint
COMMENT ON COLUMN documents.created_at IS '本版本创建时间;同一文档每次保存生成新版本行';
--> statement-breakpoint
COMMENT ON COLUMN documents.id IS '文档标识:同一文档的多个历史版本共用同一 id';
--> statement-breakpoint
COMMENT ON COLUMN documents.text IS '文档类型枚举(text 文本 / code 代码 / image 图片 / sheet 表格);列名沿用历史名 text';
--> statement-breakpoint
COMMENT ON COLUMN documents.title IS '文档标题';
--> statement-breakpoint
COMMENT ON COLUMN documents.user_id IS '所属用户外键,指向 users.id';
--> statement-breakpoint
COMMENT ON COLUMN suggestions.created_at IS '建议生成时间';
--> statement-breakpoint
COMMENT ON COLUMN suggestions.description IS '建议说明:向用户解释本次改动的理由';
--> statement-breakpoint
COMMENT ON COLUMN suggestions.document_created_at IS '目标文档版本时间,复合外键之一,指向 documents.created_at';
--> statement-breakpoint
COMMENT ON COLUMN suggestions.document_id IS '目标文档标识,复合外键之一,指向 documents.id';
--> statement-breakpoint
COMMENT ON COLUMN suggestions.id IS '建议唯一标识';
--> statement-breakpoint
COMMENT ON COLUMN suggestions.is_resolved IS '建议是否已被处理(已采纳或已忽略)';
--> statement-breakpoint
COMMENT ON COLUMN suggestions.original_text IS '建议针对的原文选区';
--> statement-breakpoint
COMMENT ON COLUMN suggestions.suggested_text IS '建议替换后的文本';
--> statement-breakpoint
COMMENT ON COLUMN suggestions.user_id IS '所属用户外键,指向 users.id';
--> statement-breakpoint
COMMENT ON COLUMN streams.chat_id IS '所属会话外键,指向 chats.id';
--> statement-breakpoint
COMMENT ON COLUMN streams.created_at IS '流创建时间,过期流的清理依据';
--> statement-breakpoint
COMMENT ON COLUMN streams.id IS '流标识,续传(resume)接口凭此定位中断的生成';
--> statement-breakpoint
COMMENT ON COLUMN mcp_settings.encrypted IS '加密后的 MCP 连接配置密文,仅运维方持久目录中的密钥可解';
--> statement-breakpoint
COMMENT ON COLUMN mcp_settings.id IS '单例主键:恒为 workspace,保证全工作区仅一行配置';
--> statement-breakpoint
COMMENT ON COLUMN mcp_settings.revision IS '乐观锁版本号:每次保存自增,防止并发保存互相覆盖';
--> statement-breakpoint
COMMENT ON COLUMN mcp_settings.updated_at IS '最近一次保存时间';
--> statement-breakpoint
COMMENT ON COLUMN mcp_settings.updated_by IS '最后修改人外键,指向 users.id';
--> statement-breakpoint
COMMENT ON COLUMN upload_settings.enabled IS '是否开放附件上传:false 时所有上传入口一律拒绝';
--> statement-breakpoint
COMMENT ON COLUMN upload_settings.id IS '单例主键:恒为 workspace,保证全工作区仅一行配置';
--> statement-breakpoint
COMMENT ON COLUMN upload_settings.revision IS '乐观锁版本号:每次保存自增,防止并发保存互相覆盖';
--> statement-breakpoint
COMMENT ON COLUMN upload_settings.updated_at IS '最近一次保存时间';
--> statement-breakpoint
COMMENT ON COLUMN upload_settings.updated_by IS '最后修改人外键,指向 users.id;可空以兼容系统初始化场景';
--> statement-breakpoint
COMMENT ON COLUMN upload_assets.chat_id IS '归属会话 id(未设外键约束):用于按会话统计配额与清理,附件生命周期与会话行删除解耦';
--> statement-breakpoint
COMMENT ON COLUMN upload_assets.created_at IS '上传时间:pending/draft 孤儿附件超时清理的依据';
--> statement-breakpoint
COMMENT ON COLUMN upload_assets.derived_bytes IS '派生内容大小(解析抽取结果的字节数):与 size 一并计入存储配额';
--> statement-breakpoint
COMMENT ON COLUMN upload_assets.extraction IS '文档解析抽取结果 JSON:供检索与预览复用,避免重复解析';
--> statement-breakpoint
COMMENT ON COLUMN upload_assets.id IS '附件唯一标识:由服务端生成,不信任客户端指定';
--> statement-breakpoint
COMMENT ON COLUMN upload_assets.mime IS 'MIME 类型:决定大小上限档位与解析路径';
--> statement-breakpoint
COMMENT ON COLUMN upload_assets.name IS '原始文件名,仅用于展示';
--> statement-breakpoint
COMMENT ON COLUMN upload_assets.owner_id IS '上传者外键,指向 users.id';
--> statement-breakpoint
COMMENT ON COLUMN upload_assets.sha256 IS '文件内容 SHA-256 摘要:完整性校验与去重比对依据';
--> statement-breakpoint
COMMENT ON COLUMN upload_assets.size IS '原始文件字节数';
--> statement-breakpoint
COMMENT ON COLUMN upload_assets.state IS '生命周期状态机:pending 上传中 / draft 草稿 / used 已随消息使用 / deleting 待清理';
--> statement-breakpoint
COMMENT ON COLUMN upload_asset_messages.asset_id IS '附件外键,指向 upload_assets.id;附件删除时级联删除关联行';
--> statement-breakpoint
COMMENT ON COLUMN upload_asset_messages.message_id IS '消息外键,指向 messages.id;消息删除时级联删除关联行';
--> statement-breakpoint
COMMENT ON COLUMN model_settings.encrypted IS '加密后的模型供应商配置密文,仅运维方持久目录中的密钥可解';
--> statement-breakpoint
COMMENT ON COLUMN model_settings.id IS '单例主键:恒为 workspace,保证全工作区仅一行配置';
--> statement-breakpoint
COMMENT ON COLUMN model_settings.revision IS '乐观锁版本号:每次保存自增,防止并发保存互相覆盖';
--> statement-breakpoint
COMMENT ON COLUMN model_settings.updated_at IS '最近一次保存时间';
--> statement-breakpoint
COMMENT ON COLUMN model_settings.updated_by IS '最后修改人外键,指向 users.id';

-- ============ 索引注释(14) ============

COMMENT ON INDEX users_pkey IS 'users 主键索引:id 唯一,用户行的定位入口';
--> statement-breakpoint
COMMENT ON INDEX chats_pkey IS 'chats 主键索引:id 唯一,会话行的定位入口';
--> statement-breakpoint
COMMENT ON INDEX messages_pkey IS 'messages 主键索引:id 唯一,消息行的定位入口';
--> statement-breakpoint
COMMENT ON INDEX votes_pkey IS 'votes 联合主键索引:(chat_id, message_id) 唯一,防止同一消息被重复评价';
--> statement-breakpoint
COMMENT ON INDEX documents_pkey IS 'documents 联合主键索引:(id, created_at) 唯一,支撑同文档多版本按时间存取';
--> statement-breakpoint
COMMENT ON INDEX suggestions_pkey IS 'suggestions 主键索引:id 唯一,建议行的定位入口';
--> statement-breakpoint
COMMENT ON INDEX streams_pkey IS 'streams 主键索引:id 唯一,续传流凭此定位';
--> statement-breakpoint
COMMENT ON INDEX mcp_settings_pkey IS 'mcp_settings 主键索引:id 唯一(恒为 workspace),配合 CHECK 保证单例';
--> statement-breakpoint
COMMENT ON INDEX upload_settings_pkey IS 'upload_settings 主键索引:id 唯一(恒为 workspace),配合 CHECK 保证单例';
--> statement-breakpoint
COMMENT ON INDEX upload_assets_pkey IS 'upload_assets 主键索引:id 唯一,附件行的定位入口';
--> statement-breakpoint
COMMENT ON INDEX upload_asset_messages_pkey IS 'upload_asset_messages 联合主键索引:(asset_id, message_id) 唯一,防止附件与消息重复关联';
--> statement-breakpoint
COMMENT ON INDEX model_settings_pkey IS 'model_settings 主键索引:id 唯一(恒为 workspace),配合 CHECK 保证单例';
--> statement-breakpoint
COMMENT ON INDEX upload_asset_chat IS 'upload_assets 普通索引(chat_id):加速按会话统计配额与批量清理';
--> statement-breakpoint
COMMENT ON INDEX upload_asset_owner IS 'upload_assets 普通索引(owner_id):加速按上传者统计配额与隔离查询';

-- ============ 约束注释(35:主键 12 / 外键 14 / CHECK 9) ============

COMMENT ON CONSTRAINT users_pkey ON users IS '主键约束:用户 id 唯一非空';
--> statement-breakpoint
COMMENT ON CONSTRAINT chats_pkey ON chats IS '主键约束:会话 id 唯一非空';
--> statement-breakpoint
COMMENT ON CONSTRAINT chats_user_id_fkey ON chats IS '外键约束:会话必须归属既有用户(users.id),禁止悬挂会话';
--> statement-breakpoint
COMMENT ON CONSTRAINT messages_pkey ON messages IS '主键约束:消息 id 唯一非空';
--> statement-breakpoint
COMMENT ON CONSTRAINT messages_chat_id_fkey ON messages IS '外键约束:消息必须归属既有会话(chats.id),禁止悬挂消息';
--> statement-breakpoint
COMMENT ON CONSTRAINT votes_pkey ON votes IS '联合主键约束:(chat_id, message_id) 唯一,同一消息至多一条评价';
--> statement-breakpoint
COMMENT ON CONSTRAINT votes_chat_id_fkey ON votes IS '外键约束:评价必须归属既有会话(chats.id)';
--> statement-breakpoint
COMMENT ON CONSTRAINT votes_message_id_fkey ON votes IS '外键约束:评价必须指向既有消息(messages.id),禁止评价不存在的消息';
--> statement-breakpoint
COMMENT ON CONSTRAINT documents_pkey ON documents IS '联合主键约束:(id, created_at) 唯一,以版本时间为序保留同一文档多个历史版本';
--> statement-breakpoint
COMMENT ON CONSTRAINT documents_user_id_fkey ON documents IS '外键约束:文档必须归属既有用户(users.id),禁止悬挂文档';
--> statement-breakpoint
COMMENT ON CONSTRAINT suggestions_pkey ON suggestions IS '主键约束:建议 id 唯一非空';
--> statement-breakpoint
COMMENT ON CONSTRAINT suggestions_user_id_fkey ON suggestions IS '外键约束:建议必须归属既有用户(users.id),禁止悬挂建议';
--> statement-breakpoint
COMMENT ON CONSTRAINT suggestions_document_id_document_created_at_fkey ON suggestions IS '复合外键约束:(document_id, document_created_at) 指向 documents(id, created_at),把建议精确锚定到具体文档版本';
--> statement-breakpoint
COMMENT ON CONSTRAINT streams_pkey ON streams IS '主键约束:流 id 唯一非空';
--> statement-breakpoint
COMMENT ON CONSTRAINT streams_chat_id_fkey ON streams IS '外键约束:续传流必须归属既有会话(chats.id),禁止悬挂流记录';
--> statement-breakpoint
COMMENT ON CONSTRAINT mcp_settings_pkey ON mcp_settings IS '主键约束:id 唯一非空,单例语义的第一道防线';
--> statement-breakpoint
COMMENT ON CONSTRAINT mcp_settings_updated_by_fkey ON mcp_settings IS '外键约束:最后修改人必须是既有用户(users.id)';
--> statement-breakpoint
COMMENT ON CONSTRAINT mcp_settings_singleton ON mcp_settings IS 'CHECK 单例约束:id 必须等于 workspace,从数据层面杜绝出现第二行工作区配置';
--> statement-breakpoint
COMMENT ON CONSTRAINT mcp_settings_revision ON mcp_settings IS 'CHECK 约束:revision 必须为正整数,保证乐观锁版本号语义有效';
--> statement-breakpoint
COMMENT ON CONSTRAINT upload_settings_pkey ON upload_settings IS '主键约束:id 唯一非空,单例语义的第一道防线';
--> statement-breakpoint
COMMENT ON CONSTRAINT upload_settings_updated_by_fkey ON upload_settings IS '外键约束:最后修改人必须是既有用户(users.id);可空以兼容系统初始化';
--> statement-breakpoint
COMMENT ON CONSTRAINT upload_settings_singleton ON upload_settings IS 'CHECK 单例约束:id 必须等于 workspace,从数据层面杜绝出现第二行工作区配置';
--> statement-breakpoint
COMMENT ON CONSTRAINT upload_settings_revision ON upload_settings IS 'CHECK 约束:revision 必须为正整数,保证乐观锁版本号语义有效';
--> statement-breakpoint
COMMENT ON CONSTRAINT upload_assets_pkey ON upload_assets IS '主键约束:附件 id 唯一非空';
--> statement-breakpoint
COMMENT ON CONSTRAINT upload_assets_owner_id_fkey ON upload_assets IS '外键约束:上传者必须是既有用户(users.id),禁止悬挂附件';
--> statement-breakpoint
COMMENT ON CONSTRAINT upload_asset_size ON upload_assets IS 'CHECK 约束:图片类(png/jpeg)不超过 5MB,其余类型不超过 64MB';
--> statement-breakpoint
COMMENT ON CONSTRAINT upload_asset_derived ON upload_assets IS 'CHECK 约束:派生内容大小在 0 到 8MB 区间,防止解析结果无限膨胀';
--> statement-breakpoint
COMMENT ON CONSTRAINT upload_asset_state ON upload_assets IS 'CHECK 约束:state 仅允许 pending/draft/used/deleting 四个合法状态';
--> statement-breakpoint
COMMENT ON CONSTRAINT upload_asset_messages_pkey ON upload_asset_messages IS '联合主键约束:(asset_id, message_id) 唯一,防止附件与消息重复关联';
--> statement-breakpoint
COMMENT ON CONSTRAINT upload_asset_messages_asset_id_fkey ON upload_asset_messages IS '外键约束:关联行必须指向既有附件(upload_assets.id),附件删除时级联删除';
--> statement-breakpoint
COMMENT ON CONSTRAINT upload_asset_messages_message_id_fkey ON upload_asset_messages IS '外键约束:关联行必须指向既有消息(messages.id),消息删除时级联删除';
--> statement-breakpoint
COMMENT ON CONSTRAINT model_settings_pkey ON model_settings IS '主键约束:id 唯一非空,单例语义的第一道防线';
--> statement-breakpoint
COMMENT ON CONSTRAINT model_settings_updated_by_fkey ON model_settings IS '外键约束:最后修改人必须是既有用户(users.id)';
--> statement-breakpoint
COMMENT ON CONSTRAINT model_settings_singleton ON model_settings IS 'CHECK 单例约束:id 必须等于 workspace,从数据层面杜绝出现第二行工作区配置';
--> statement-breakpoint
COMMENT ON CONSTRAINT model_settings_revision ON model_settings IS 'CHECK 约束:revision 必须为正整数,保证乐观锁版本号语义有效';
