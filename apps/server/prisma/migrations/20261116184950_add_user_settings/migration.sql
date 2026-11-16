-- CreateTable
CREATE TABLE "user_settings" (
    "user_id" UUID NOT NULL,
    "auto_lock_minutes" INTEGER NOT NULL DEFAULT 5,
    "clipboard_clear_seconds" INTEGER NOT NULL DEFAULT 30,
    "generator_defaults" JSONB NOT NULL DEFAULT '{"length": 16, "symbols": true, "numbers": true}',
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("user_id")
);

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing user gets default settings.
INSERT INTO "user_settings" ("user_id", "updated_at")
SELECT "id", CURRENT_TIMESTAMP FROM "users";
