CREATE TABLE "UploadSettings" (
 "id" text PRIMARY KEY DEFAULT 'workspace' CHECK ("id" = 'workspace'),
 "enabled" boolean NOT NULL DEFAULT false,
 "revision" integer NOT NULL DEFAULT 1 CHECK ("revision" > 0),
 "updatedAt" timestamp NOT NULL DEFAULT now(),
 "updatedBy" uuid REFERENCES "User"("id")
);
INSERT INTO "UploadSettings" ("id") VALUES ('workspace');
--> statement-breakpoint
CREATE TABLE "UploadAsset" (
 "id" uuid PRIMARY KEY,
 "ownerId" uuid NOT NULL REFERENCES "User"("id"),
 "chatId" uuid NOT NULL,
 "name" text NOT NULL,
 "mime" text NOT NULL,
 "size" integer NOT NULL CHECK ("size" > 0 AND "size" <= 5242880),
 "sha256" text NOT NULL,
 "state" text NOT NULL CHECK ("state" IN ('pending','draft','used','deleting')),
 "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX "upload_asset_owner" ON "UploadAsset" ("ownerId");
CREATE INDEX "upload_asset_chat" ON "UploadAsset" ("chatId");
--> statement-breakpoint
CREATE TABLE "UploadAssetMessage" (
 "assetId" uuid NOT NULL REFERENCES "UploadAsset"("id") ON DELETE CASCADE,
 "messageId" uuid NOT NULL REFERENCES "Message_v2"("id") ON DELETE CASCADE,
 PRIMARY KEY ("assetId", "messageId")
);
