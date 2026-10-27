import type { InferSelectModel } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  integer,
  json,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// 用户账号表:认证体系(better-auth)的用户主档,其余业务表经外键引用。
export const user = pgTable("users", {
  // 账号创建时间
  createdAt: timestamp("created_at").notNull().defaultNow(),
  // 登录邮箱,认证与账号找回的凭证
  email: varchar("email", { length: 64 }).notNull(),
  // 邮箱是否已完成验证
  emailVerified: boolean("email_verified").notNull().default(false),
  // 用户唯一标识(uuid),全库各表通过外键引用
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  // 头像图片 URL
  image: text("image"),
  // 是否匿名(访客)账号:无持久登录凭证
  isAnonymous: boolean("is_anonymous").notNull().default(false),
  // 展示昵称
  name: text("name"),
  // 登录口令散列;匿名或第三方登录账号为空
  password: varchar("password", { length: 64 }),
  // 账号资料最近一次更新时间
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type User = InferSelectModel<typeof user>;

// 会话表:一次完整对话的元信息与可见范围。
export const chat = pgTable("chats", {
  // 会话创建时间
  createdAt: timestamp("created_at").notNull(),
  // 会话唯一标识
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  // 会话标题,由首条消息自动生成摘要
  title: text("title").notNull(),
  // 所属用户外键,指向 users.id
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id),
  // 可见性:public 全员可见 / private 仅本人可见
  visibility: varchar("visibility", { enum: ["public", "private"] })
    .notNull()
    .default("private"),
});

export type Chat = InferSelectModel<typeof chat>;

// 会话消息表:按角色存储会话内每一轮发言,内容以分片 JSON 保存。
export const message = pgTable("messages", {
  // 消息附件引用列表 JSON:文件与工具产物在消息上的挂载点
  attachments: json("attachments").notNull(),
  // 所属会话外键,指向 chats.id
  chatId: uuid("chat_id")
    .notNull()
    .references(() => chat.id),
  // 消息发送时间
  createdAt: timestamp("created_at").notNull(),
  // 消息唯一标识
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  // 消息内容分片 JSON(AI SDK UIMessage parts:文本/推理/工具调用等结构化片段)
  parts: json("parts").notNull(),
  // 发言角色:user 用户提问 / assistant 助手回答 / system 系统指令
  role: varchar("role").notNull(),
});

export type DBMessage = InferSelectModel<typeof message>;

// 消息评价表:用户对单条消息点赞或点踩,用于反馈与排序。
export const vote = pgTable(
  "votes",
  {
    // 所属会话外键,指向 chats.id,联合主键之一
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chat.id),
    // 评价方向:true 点赞 / false 点踩
    isUpvoted: boolean("is_upvoted").notNull(),
    // 被评价消息外键,指向 messages.id,联合主键之一
    messageId: uuid("message_id")
      .notNull()
      .references(() => message.id),
  },
  (table) => ({
    // 联合主键(chat_id, message_id):同会话内每条消息至多一条评价,天然防止重复投票
    pk: primaryKey({ columns: [table.chatId, table.messageId] }),
  })
);

export type Vote = InferSelectModel<typeof vote>;

// 用户文档表:编辑器与知识检索共用的长文本载体,按时间保留多版本。
export const document = pgTable(
  "documents",
  {
    // 文档正文内容
    content: text("content"),
    // 本版本创建时间;同一文档每次保存生成新版本行
    createdAt: timestamp("created_at").notNull(),
    // 文档标识:同一文档的多个历史版本共用同一 id
    id: uuid("id").notNull().defaultRandom(),
    // 文档类型枚举(text 文本 / code 代码 / image 图片 / sheet 表格);DB 列名沿用历史名 text
    kind: varchar("text", { enum: ["text", "code", "image", "sheet"] })
      .notNull()
      .default("text"),
    // 文档标题
    title: text("title").notNull(),
    // 所属用户外键,指向 users.id
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
  },
  (table) => ({
    // 联合主键(id, created_at):以版本时间为序保留同一文档的多个历史版本
    pk: primaryKey({ columns: [table.id, table.createdAt] }),
  })
);

export type Document = InferSelectModel<typeof document>;

// 文档修改建议表:针对文档选区生成的 AI 改写建议,等待用户采纳或忽略。
export const suggestion = pgTable(
  "suggestions",
  {
    // 建议生成时间
    createdAt: timestamp("created_at").notNull(),
    // 建议说明:向用户解释本次改动的理由
    description: text("description"),
    // 目标文档版本时间,复合外键之一,指向 documents.created_at
    documentCreatedAt: timestamp("document_created_at").notNull(),
    // 目标文档标识,复合外键之一,指向 documents.id
    documentId: uuid("document_id").notNull(),
    // 建议唯一标识
    id: uuid("id").notNull().defaultRandom(),
    // 建议是否已被处理(已采纳或已忽略)
    isResolved: boolean("is_resolved").notNull().default(false),
    // 建议针对的原文选区
    originalText: text("original_text").notNull(),
    // 建议替换后的文本
    suggestedText: text("suggested_text").notNull(),
    // 所属用户外键,指向 users.id
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
  },
  (table) => ({
    // 复合外键(document_id, document_created_at) -> documents(id, created_at):把建议精确锚定到具体文档版本
    documentRef: foreignKey({
      columns: [table.documentId, table.documentCreatedAt],
      foreignColumns: [document.id, document.createdAt],
    }),
    // 主键(id)
    pk: primaryKey({ columns: [table.id] }),
  })
);

export type Suggestion = InferSelectModel<typeof suggestion>;

// 流式生成续传表:登记可恢复的 SSE 流,客户端断线后凭流 id 恢复未完成的生成。
export const stream = pgTable(
  "streams",
  {
    // 所属会话外键,指向 chats.id
    chatId: uuid("chat_id").notNull(),
    // 流创建时间,过期流的清理依据
    createdAt: timestamp("created_at").notNull(),
    // 流标识,续传(resume)接口凭此定位中断的生成
    id: uuid("id").notNull().defaultRandom(),
  },
  (table) => ({
    // 外键 chat_id -> chats.id:每条续传流必须归属既有会话
    chatRef: foreignKey({
      columns: [table.chatId],
      foreignColumns: [chat.id],
    }),
    // 主键(id)
    pk: primaryKey({ columns: [table.id] }),
  })
);

export type Stream = InferSelectModel<typeof stream>;

// MCP 接入设置表:一次部署即一个共享工作区,全部连接数据以加密密文整体存放,明文不出库。
export const mcpSettings = pgTable(
  "mcp_settings",
  {
    // 加密后的 MCP 连接配置密文,仅运维方持久目录中的密钥可解
    encrypted: text("encrypted").notNull(),
    // 单例主键:恒为 'workspace',保证全工作区仅一行配置
    id: text("id").primaryKey().notNull(),
    // 乐观锁版本号:每次保存自增,防止并发保存互相覆盖
    revision: integer("revision").notNull(),
    // 最近一次保存时间
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    // 最后修改人外键,指向 users.id
    updatedBy: uuid("updated_by")
      .notNull()
      .references(() => user.id),
  },
  (table) => [
    // CHECK 单例约束:id 必须等于 'workspace',从数据层面杜绝出现第二行工作区配置
    check("mcp_settings_singleton", sql`${table.id} = 'workspace'`),
    // CHECK 约束:revision 必须为正整数,保证乐观锁版本号语义有效
    check("mcp_settings_revision", sql`${table.revision} > 0`),
  ]
);

// 附件上传开关表:工作区级单例,控制上传功能总开关;文件字节只存运维方持久目录。
export const uploadSettings = pgTable(
  "upload_settings",
  {
    // 是否开放附件上传:false 时所有上传入口一律拒绝
    enabled: boolean("enabled").notNull().default(false),
    // 单例主键:恒为 'workspace',保证全工作区仅一行配置
    id: text("id").primaryKey().notNull().default("workspace"),
    // 乐观锁版本号:每次保存自增,防止并发保存互相覆盖
    revision: integer("revision").notNull().default(1),
    // 最近一次保存时间
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    // 最后修改人外键,指向 users.id;可空以兼容系统初始化场景
    updatedBy: uuid("updated_by").references(() => user.id),
  },
  (table) => [
    // CHECK 单例约束:id 必须等于 'workspace',从数据层面杜绝出现第二行工作区配置
    check("upload_settings_singleton", sql`${table.id} = 'workspace'`),
    // CHECK 约束:revision 必须为正整数,保证乐观锁版本号语义有效
    check("upload_settings_revision", sql`${table.revision} > 0`),
  ]
);
// 上传附件元数据表:库内只存元数据与解析结果,文件字节落在运维方持久目录。
export const uploadAsset = pgTable(
  "upload_assets",
  {
    // 归属会话 id(未设外键约束):用于按会话统计配额与清理,附件生命周期与会话行删除解耦
    chatId: uuid("chat_id").notNull(),
    // 上传时间:pending/draft 孤儿附件超时清理的依据
    createdAt: timestamp("created_at").notNull().defaultNow(),
    // 派生内容大小(解析抽取结果的字节数):与 size 一并计入存储配额
    derivedBytes: integer("derived_bytes").notNull().default(0),
    // 文档解析抽取结果 JSON:供检索与预览复用,避免重复解析
    extraction:
      json("extraction").$type<
        import("@/server/domain/attachment/document-types").DocumentExtraction
      >(),
    // 附件唯一标识:由服务端生成,不信任客户端指定
    id: uuid("id").primaryKey().notNull(),
    // MIME 类型:决定大小上限档位与解析路径
    mime: text("mime").notNull(),
    // 原始文件名,仅用于展示
    name: text("name").notNull(),
    // 上传者外键,指向 users.id
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => user.id),
    // 文件内容 SHA-256 摘要:完整性校验与去重比对依据
    sha256: text("sha256").notNull(),
    // 原始文件字节数
    size: integer("size").notNull(),
    // 生命周期状态机:pending 上传中 / draft 草稿 / used 已随消息使用 / deleting 待清理
    state: text("state").notNull(),
  },
  (table) => [
    // CHECK 约束:图片类(png/jpeg)不超过 5MB,其余类型不超过 64MB
    check(
      "upload_asset_size",
      sql`${table.size} > 0 AND ${table.size} <= CASE WHEN ${table.mime} IN ('image/png','image/jpeg') THEN 5242880 ELSE 67108864 END`
    ),
    // CHECK 约束:派生内容大小在 [0, 8MB] 区间,防止解析结果无限膨胀
    check(
      "upload_asset_derived",
      sql`${table.derivedBytes} >= 0 AND ${table.derivedBytes} <= 8388608`
    ),
    // CHECK 约束:state 仅允许 pending/draft/used/deleting 四个合法状态
    check(
      "upload_asset_state",
      sql`${table.state} IN ('pending','draft','used','deleting')`
    ),
  ]
);
// 附件-消息关联表:记录消息实际引用了哪些附件,多对多关系。
export const uploadAssetMessage = pgTable(
  "upload_asset_messages",
  {
    // 附件外键,指向 upload_assets.id;附件删除时级联删除关联行
    assetId: uuid("asset_id")
      .notNull()
      .references(() => uploadAsset.id, { onDelete: "cascade" }),
    // 消息外键,指向 messages.id;消息删除时级联删除关联行
    messageId: uuid("message_id")
      .notNull()
      .references(() => message.id, { onDelete: "cascade" }),
  },
  (table) => [
    // 联合主键(asset_id, message_id):防止同一附件与同一消息重复关联
    primaryKey({ columns: [table.assetId, table.messageId] }),
  ]
);

// 模型访问设置表:工作区级单例,模型供应商凭证以加密密文整体存放,明文不出库。
export const modelSettings = pgTable(
  "model_settings",
  {
    // 加密后的模型供应商配置密文,仅运维方持久目录中的密钥可解
    encrypted: text("encrypted").notNull(),
    // 单例主键:恒为 'workspace',保证全工作区仅一行配置
    id: text("id").primaryKey().notNull(),
    // 乐观锁版本号:每次保存自增,防止并发保存互相覆盖
    revision: integer("revision").notNull(),
    // 最近一次保存时间
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    // 最后修改人外键,指向 users.id
    updatedBy: uuid("updated_by")
      .notNull()
      .references(() => user.id),
  },
  (table) => [
    // CHECK 单例约束:id 必须等于 'workspace',从数据层面杜绝出现第二行工作区配置
    check("model_settings_singleton", sql`${table.id} = 'workspace'`),
    // CHECK 约束:revision 必须为正整数,保证乐观锁版本号语义有效
    check("model_settings_revision", sql`${table.revision} > 0`),
  ]
);

// 个人能力配置表：按账号及配置种类隔离保存加密 MCP 连接或技能正文。
export const capabilitySettings = pgTable(
  "capability_settings",
  {
    // 绑定属主、种类及修订的 AES-GCM 密文。
    encrypted: text("encrypted").notNull(),
    // 配置种类：mcp 连接或 skills 个人技能。
    kind: text("kind").notNull(),
    // 单调递增修订；删除能力也保留配置行，防止旧授权复活。
    revision: integer("revision").notNull(),
    // 最近修改时间。
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    // 配置属主账号；仅服务端会话身份可访问。
    userId: uuid("user_id").notNull(),
  },
  (table) => [
    // 联合主键：每个账号每种配置仅有一行。
    primaryKey({
      columns: [table.userId, table.kind],
      name: "capability_settings_pk",
    }),
    // 属主外键：账号删除时移除个人密文。
    foreignKey({
      columns: [table.userId],
      foreignColumns: [user.id],
      name: "capability_settings_user_fk",
    }).onDelete("cascade"),
    // 种类约束：只接收明确支持的个人能力聚合。
    check("capability_settings_kind", sql`${table.kind} in ('mcp', 'skills')`),
    // 修订约束：持久修订必须为正整数。
    check("capability_settings_revision", sql`${table.revision} > 0`),
  ]
);

// 会话能力范围表：服务端保存本轮选择和授权指纹，审批续跑不得扩大范围。
export const chatCapabilityScope = pgTable(
  "chat_capability_scopes",
  {
    // 所属会话，也是范围表主键。
    chatId: uuid("chat_id").notNull(),
    // 已选择能力的授权指纹；不包含凭据明文。
    grants: json("grants").notNull(),
    // 当前范围修订；新用户轮次调整后递增。
    revision: integer("revision").notNull(),
    // 无凭据的连接和技能稳定标识选择。
    selection: json("selection").notNull(),
    // 最近绑定本轮范围的时间。
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    // 会话属主；仓储事务再次核实真实 chats.user_id。
    userId: uuid("user_id").notNull(),
  },
  (table) => [
    // 主键：每个会话最多一份当前能力范围。
    primaryKey({ columns: [table.chatId], name: "chat_capability_scopes_pk" }),
    // 会话外键：会话删除时清理范围。
    foreignKey({
      columns: [table.chatId],
      foreignColumns: [chat.id],
      name: "chat_capability_scopes_chat_fk",
    }).onDelete("cascade"),
    // 属主外键：账号删除时清理范围。
    foreignKey({
      columns: [table.userId],
      foreignColumns: [user.id],
      name: "chat_capability_scopes_user_fk",
    }).onDelete("cascade"),
    // 修订约束：范围修订必须为正整数。
    check("chat_capability_scopes_revision", sql`${table.revision} > 0`),
  ]
);
