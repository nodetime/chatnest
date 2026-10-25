-- Handwritten pure-RENAME migration: plural snake_case tables and snake_case columns.
-- Every statement is a RENAME; no DROP/ADD/CREATE, data stays in place.
-- Constraint names are taken from the live database (Postgres-generated <Table>_<col>_fkey / <Table>_pkey
-- plus the inline CHECK defaults from 0002), not guessed from drizzle defaults.
ALTER TABLE "User" RENAME TO users;
--> statement-breakpoint
ALTER TABLE users RENAME COLUMN "createdAt" TO created_at;
--> statement-breakpoint
ALTER TABLE users RENAME COLUMN "emailVerified" TO email_verified;
--> statement-breakpoint
ALTER TABLE users RENAME COLUMN "isAnonymous" TO is_anonymous;
--> statement-breakpoint
ALTER TABLE users RENAME COLUMN "updatedAt" TO updated_at;
--> statement-breakpoint
ALTER TABLE "Chat" RENAME TO chats;
--> statement-breakpoint
ALTER TABLE chats RENAME COLUMN "createdAt" TO created_at;
--> statement-breakpoint
ALTER TABLE chats RENAME COLUMN "userId" TO user_id;
--> statement-breakpoint
ALTER TABLE "Message_v2" RENAME TO messages;
--> statement-breakpoint
ALTER TABLE messages RENAME COLUMN "chatId" TO chat_id;
--> statement-breakpoint
ALTER TABLE messages RENAME COLUMN "createdAt" TO created_at;
--> statement-breakpoint
ALTER TABLE "Vote_v2" RENAME TO votes;
--> statement-breakpoint
ALTER TABLE votes RENAME COLUMN "chatId" TO chat_id;
--> statement-breakpoint
ALTER TABLE votes RENAME COLUMN "isUpvoted" TO is_upvoted;
--> statement-breakpoint
ALTER TABLE votes RENAME COLUMN "messageId" TO message_id;
--> statement-breakpoint
ALTER TABLE "Document" RENAME TO documents;
--> statement-breakpoint
ALTER TABLE documents RENAME COLUMN "createdAt" TO created_at;
--> statement-breakpoint
ALTER TABLE documents RENAME COLUMN "userId" TO user_id;
--> statement-breakpoint
ALTER TABLE "Suggestion" RENAME TO suggestions;
--> statement-breakpoint
ALTER TABLE suggestions RENAME COLUMN "createdAt" TO created_at;
--> statement-breakpoint
ALTER TABLE suggestions RENAME COLUMN "documentCreatedAt" TO document_created_at;
--> statement-breakpoint
ALTER TABLE suggestions RENAME COLUMN "documentId" TO document_id;
--> statement-breakpoint
ALTER TABLE suggestions RENAME COLUMN "isResolved" TO is_resolved;
--> statement-breakpoint
ALTER TABLE suggestions RENAME COLUMN "originalText" TO original_text;
--> statement-breakpoint
ALTER TABLE suggestions RENAME COLUMN "suggestedText" TO suggested_text;
--> statement-breakpoint
ALTER TABLE suggestions RENAME COLUMN "userId" TO user_id;
--> statement-breakpoint
ALTER TABLE "Stream" RENAME TO streams;
--> statement-breakpoint
ALTER TABLE streams RENAME COLUMN "chatId" TO chat_id;
--> statement-breakpoint
ALTER TABLE streams RENAME COLUMN "createdAt" TO created_at;
--> statement-breakpoint
ALTER TABLE "McpSettings" RENAME TO mcp_settings;
--> statement-breakpoint
ALTER TABLE mcp_settings RENAME COLUMN "updatedAt" TO updated_at;
--> statement-breakpoint
ALTER TABLE mcp_settings RENAME COLUMN "updatedBy" TO updated_by;
--> statement-breakpoint
ALTER TABLE "UploadSettings" RENAME TO upload_settings;
--> statement-breakpoint
ALTER TABLE upload_settings RENAME COLUMN "updatedAt" TO updated_at;
--> statement-breakpoint
ALTER TABLE upload_settings RENAME COLUMN "updatedBy" TO updated_by;
--> statement-breakpoint
ALTER TABLE "UploadAsset" RENAME TO upload_assets;
--> statement-breakpoint
ALTER TABLE upload_assets RENAME COLUMN "chatId" TO chat_id;
--> statement-breakpoint
ALTER TABLE upload_assets RENAME COLUMN "createdAt" TO created_at;
--> statement-breakpoint
ALTER TABLE upload_assets RENAME COLUMN "derivedBytes" TO derived_bytes;
--> statement-breakpoint
ALTER TABLE upload_assets RENAME COLUMN "ownerId" TO owner_id;
--> statement-breakpoint
ALTER TABLE "UploadAssetMessage" RENAME TO upload_asset_messages;
--> statement-breakpoint
ALTER TABLE upload_asset_messages RENAME COLUMN "assetId" TO asset_id;
--> statement-breakpoint
ALTER TABLE upload_asset_messages RENAME COLUMN "messageId" TO message_id;
--> statement-breakpoint
ALTER TABLE "ModelSettings" RENAME TO model_settings;
--> statement-breakpoint
ALTER TABLE model_settings RENAME COLUMN "updatedAt" TO updated_at;
--> statement-breakpoint
ALTER TABLE model_settings RENAME COLUMN "updatedBy" TO updated_by;
--> statement-breakpoint
ALTER TABLE users RENAME CONSTRAINT "User_pkey" TO users_pkey;
--> statement-breakpoint
ALTER TABLE chats RENAME CONSTRAINT "Chat_pkey" TO chats_pkey;
--> statement-breakpoint
ALTER TABLE chats RENAME CONSTRAINT "Chat_userId_fkey" TO chats_user_id_fkey;
--> statement-breakpoint
ALTER TABLE messages RENAME CONSTRAINT "Message_v2_pkey" TO messages_pkey;
--> statement-breakpoint
ALTER TABLE messages RENAME CONSTRAINT "Message_v2_chatId_fkey" TO messages_chat_id_fkey;
--> statement-breakpoint
ALTER TABLE votes RENAME CONSTRAINT "Vote_v2_pkey" TO votes_pkey;
--> statement-breakpoint
ALTER TABLE votes RENAME CONSTRAINT "Vote_v2_chatId_fkey" TO votes_chat_id_fkey;
--> statement-breakpoint
ALTER TABLE votes RENAME CONSTRAINT "Vote_v2_messageId_fkey" TO votes_message_id_fkey;
--> statement-breakpoint
ALTER TABLE documents RENAME CONSTRAINT "Document_pkey" TO documents_pkey;
--> statement-breakpoint
ALTER TABLE documents RENAME CONSTRAINT "Document_userId_fkey" TO documents_user_id_fkey;
--> statement-breakpoint
ALTER TABLE suggestions RENAME CONSTRAINT "Suggestion_pkey" TO suggestions_pkey;
--> statement-breakpoint
ALTER TABLE suggestions RENAME CONSTRAINT "Suggestion_userId_fkey" TO suggestions_user_id_fkey;
--> statement-breakpoint
ALTER TABLE suggestions RENAME CONSTRAINT "Suggestion_documentId_documentCreatedAt_fkey" TO suggestions_document_id_document_created_at_fkey;
--> statement-breakpoint
ALTER TABLE streams RENAME CONSTRAINT "Stream_pkey" TO streams_pkey;
--> statement-breakpoint
ALTER TABLE streams RENAME CONSTRAINT "Stream_chatId_fkey" TO streams_chat_id_fkey;
--> statement-breakpoint
ALTER TABLE mcp_settings RENAME CONSTRAINT "McpSettings_pkey" TO mcp_settings_pkey;
--> statement-breakpoint
ALTER TABLE mcp_settings RENAME CONSTRAINT "McpSettings_updatedBy_fkey" TO mcp_settings_updated_by_fkey;
--> statement-breakpoint
ALTER TABLE upload_settings RENAME CONSTRAINT "UploadSettings_pkey" TO upload_settings_pkey;
--> statement-breakpoint
ALTER TABLE upload_settings RENAME CONSTRAINT "UploadSettings_updatedBy_fkey" TO upload_settings_updated_by_fkey;
--> statement-breakpoint
-- 0002 created these CHECKs inline, so Postgres named them UploadSettings_*_check;
-- rename to the explicit names schema.ts already declares.
ALTER TABLE upload_settings RENAME CONSTRAINT "UploadSettings_id_check" TO upload_settings_singleton;
--> statement-breakpoint
ALTER TABLE upload_settings RENAME CONSTRAINT "UploadSettings_revision_check" TO upload_settings_revision;
--> statement-breakpoint
ALTER TABLE upload_assets RENAME CONSTRAINT "UploadAsset_pkey" TO upload_assets_pkey;
--> statement-breakpoint
ALTER TABLE upload_assets RENAME CONSTRAINT "UploadAsset_ownerId_fkey" TO upload_assets_owner_id_fkey;
--> statement-breakpoint
ALTER TABLE upload_assets RENAME CONSTRAINT "UploadAsset_state_check" TO upload_asset_state;
--> statement-breakpoint
ALTER TABLE upload_assets RENAME CONSTRAINT "UploadAsset_derivedBytes_check" TO upload_asset_derived;
--> statement-breakpoint
ALTER TABLE upload_asset_messages RENAME CONSTRAINT "UploadAssetMessage_pkey" TO upload_asset_messages_pkey;
--> statement-breakpoint
ALTER TABLE upload_asset_messages RENAME CONSTRAINT "UploadAssetMessage_assetId_fkey" TO upload_asset_messages_asset_id_fkey;
--> statement-breakpoint
ALTER TABLE upload_asset_messages RENAME CONSTRAINT "UploadAssetMessage_messageId_fkey" TO upload_asset_messages_message_id_fkey;
--> statement-breakpoint
ALTER TABLE model_settings RENAME CONSTRAINT "ModelSettings_pkey" TO model_settings_pkey;
--> statement-breakpoint
ALTER TABLE model_settings RENAME CONSTRAINT "ModelSettings_updatedBy_fkey" TO model_settings_updated_by_fkey;
