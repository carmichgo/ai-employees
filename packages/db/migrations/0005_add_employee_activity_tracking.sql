-- Track when we last sent a request to and received a response from the employee's container
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "last_request_sent_at" timestamptz;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "last_response_at" timestamptz;
