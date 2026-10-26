ALTER TABLE "UploadAsset" ADD COLUMN "extraction" json;
ALTER TABLE "UploadAsset" ADD COLUMN "derivedBytes" integer NOT NULL DEFAULT 0 CHECK ("derivedBytes" >= 0 AND "derivedBytes" <= 8388608);
--> statement-breakpoint
-- 0002's unlabelled CHECK receives this PostgreSQL-generated name on a fresh install.
ALTER TABLE "UploadAsset" DROP CONSTRAINT "UploadAsset_size_check";
ALTER TABLE "UploadAsset" ADD CONSTRAINT "upload_asset_size" CHECK ("size" > 0 AND "size" <= CASE WHEN "mime" IN ('image/png','image/jpeg') THEN 5242880 ELSE 67108864 END);
