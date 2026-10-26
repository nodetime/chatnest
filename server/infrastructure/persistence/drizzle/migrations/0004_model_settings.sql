CREATE TABLE IF NOT EXISTS "ModelSettings" (
 "id" text PRIMARY KEY NOT NULL,
 "revision" integer NOT NULL,
 "encrypted" text NOT NULL,
 "updatedBy" uuid NOT NULL REFERENCES "User"("id"),
 "updatedAt" timestamp DEFAULT now() NOT NULL,
 CONSTRAINT "model_settings_singleton" CHECK ("id" = 'workspace'),
 CONSTRAINT "model_settings_revision" CHECK ("revision" > 0)
);
