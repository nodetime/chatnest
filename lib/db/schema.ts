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

export const user = pgTable("User", {
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  email: varchar("email", { length: 64 }).notNull(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  image: text("image"),
  isAnonymous: boolean("isAnonymous").notNull().default(false),
  name: text("name"),
  password: varchar("password", { length: 64 }),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type User = InferSelectModel<typeof user>;

export const chat = pgTable("Chat", {
  createdAt: timestamp("createdAt").notNull(),
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  title: text("title").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  visibility: varchar("visibility", { enum: ["public", "private"] })
    .notNull()
    .default("private"),
});

export type Chat = InferSelectModel<typeof chat>;

export const message = pgTable("Message_v2", {
  attachments: json("attachments").notNull(),
  chatId: uuid("chatId")
    .notNull()
    .references(() => chat.id),
  createdAt: timestamp("createdAt").notNull(),
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  parts: json("parts").notNull(),
  role: varchar("role").notNull(),
});

export type DBMessage = InferSelectModel<typeof message>;

export const vote = pgTable(
  "Vote_v2",
  {
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id),
    isUpvoted: boolean("isUpvoted").notNull(),
    messageId: uuid("messageId")
      .notNull()
      .references(() => message.id),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.chatId, table.messageId] }),
  })
);

export type Vote = InferSelectModel<typeof vote>;

export const document = pgTable(
  "Document",
  {
    content: text("content"),
    createdAt: timestamp("createdAt").notNull(),
    id: uuid("id").notNull().defaultRandom(),
    kind: varchar("text", { enum: ["text", "code", "image", "sheet"] })
      .notNull()
      .default("text"),
    title: text("title").notNull(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id, table.createdAt] }),
  })
);

export type Document = InferSelectModel<typeof document>;

export const suggestion = pgTable(
  "Suggestion",
  {
    createdAt: timestamp("createdAt").notNull(),
    description: text("description"),
    documentCreatedAt: timestamp("documentCreatedAt").notNull(),
    documentId: uuid("documentId").notNull(),
    id: uuid("id").notNull().defaultRandom(),
    isResolved: boolean("isResolved").notNull().default(false),
    originalText: text("originalText").notNull(),
    suggestedText: text("suggestedText").notNull(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
  },
  (table) => ({
    documentRef: foreignKey({
      columns: [table.documentId, table.documentCreatedAt],
      foreignColumns: [document.id, document.createdAt],
    }),
    pk: primaryKey({ columns: [table.id] }),
  })
);

export type Suggestion = InferSelectModel<typeof suggestion>;

export const stream = pgTable(
  "Stream",
  {
    chatId: uuid("chatId").notNull(),
    createdAt: timestamp("createdAt").notNull(),
    id: uuid("id").notNull().defaultRandom(),
  },
  (table) => ({
    chatRef: foreignKey({
      columns: [table.chatId],
      foreignColumns: [chat.id],
    }),
    pk: primaryKey({ columns: [table.id] }),
  })
);

export type Stream = InferSelectModel<typeof stream>;

// One deployment is one shared workspace. All connection data lives in the encrypted list.
export const mcpSettings = pgTable(
  "McpSettings",
  {
    encrypted: text("encrypted").notNull(),
    id: text("id").primaryKey().notNull(),
    revision: integer("revision").notNull(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
    updatedBy: uuid("updatedBy")
      .notNull()
      .references(() => user.id),
  },
  (table) => [
    check("mcp_settings_singleton", sql`${table.id} = 'workspace'`),
    check("mcp_settings_revision", sql`${table.revision} > 0`),
  ]
);

// Private attachment bytes live only in the operator's persistent directory.
export const uploadSettings = pgTable(
  "UploadSettings",
  {
    enabled: boolean("enabled").notNull().default(false),
    id: text("id").primaryKey().notNull().default("workspace"),
    revision: integer("revision").notNull().default(1),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
    updatedBy: uuid("updatedBy").references(() => user.id),
  },
  (table) => [
    check("upload_settings_singleton", sql`${table.id} = 'workspace'`),
    check("upload_settings_revision", sql`${table.revision} > 0`),
  ]
);
export const uploadAsset = pgTable(
  "UploadAsset",
  {
    chatId: uuid("chatId").notNull(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    derivedBytes: integer("derivedBytes").notNull().default(0),
    extraction:
      json("extraction").$type<
        import("../uploads/document-types").DocumentExtraction
      >(),
    id: uuid("id").primaryKey().notNull(),
    mime: text("mime").notNull(),
    name: text("name").notNull(),
    ownerId: uuid("ownerId")
      .notNull()
      .references(() => user.id),
    sha256: text("sha256").notNull(),
    size: integer("size").notNull(),
    state: text("state").notNull(),
  },
  (table) => [
    check(
      "upload_asset_size",
      sql`${table.size} > 0 AND ${table.size} <= CASE WHEN ${table.mime} IN ('image/png','image/jpeg') THEN 5242880 ELSE 67108864 END`
    ),
    check(
      "upload_asset_derived",
      sql`${table.derivedBytes} >= 0 AND ${table.derivedBytes} <= 8388608`
    ),
    check(
      "upload_asset_state",
      sql`${table.state} IN ('pending','draft','used','deleting')`
    ),
  ]
);
export const uploadAssetMessage = pgTable(
  "UploadAssetMessage",
  {
    assetId: uuid("assetId")
      .notNull()
      .references(() => uploadAsset.id, { onDelete: "cascade" }),
    messageId: uuid("messageId")
      .notNull()
      .references(() => message.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.assetId, table.messageId] })]
);

export const modelSettings = pgTable(
  "ModelSettings",
  {
    encrypted: text("encrypted").notNull(),
    id: text("id").primaryKey().notNull(),
    revision: integer("revision").notNull(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
    updatedBy: uuid("updatedBy")
      .notNull()
      .references(() => user.id),
  },
  (table) => [
    check("model_settings_singleton", sql`${table.id} = 'workspace'`),
    check("model_settings_revision", sql`${table.revision} > 0`),
  ]
);
