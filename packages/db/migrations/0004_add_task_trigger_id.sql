-- Link tasks to triggers for recurring/cron-spawned tasks
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "trigger_id" uuid REFERENCES "triggers"("id") ON DELETE SET NULL;
