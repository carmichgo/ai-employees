-- Add per-employee droplet fields (one droplet per employee)
ALTER TABLE "employees" ADD COLUMN "droplet_id" varchar(50);
ALTER TABLE "employees" ADD COLUMN "droplet_ip" varchar(45);
ALTER TABLE "employees" ADD COLUMN "droplet_region" varchar(20);
ALTER TABLE "employees" ADD COLUMN "droplet_size" varchar(50);
ALTER TABLE "employees" ADD COLUMN "droplet_status" varchar(20) DEFAULT 'none';
ALTER TABLE "employees" ADD COLUMN "interservice_secret" varchar(255);
