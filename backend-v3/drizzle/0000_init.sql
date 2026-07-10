CREATE TABLE IF NOT EXISTS "activity" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign" text NOT NULL,
	"type" text NOT NULL,
	"actor" text NOT NULL,
	"amount" numeric(78,0) NOT NULL,
	"cohort_id" integer,
	"tx_hash" text NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campaign_metadata" (
	"campaign" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"cover_url" text,
	"updated_at" timestamp with time zone NOT NULL,
	"auth_issued_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "campaigns" (
	"address" text PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"angel" text NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_block" bigint NOT NULL,
	"pool_total" numeric(78,0) NOT NULL,
	"total_shares" numeric(78,0) NOT NULL,
	"global_acc_ray" numeric(78,0) NOT NULL,
	"reward_reserves" numeric(78,0) NOT NULL,
	"current_cohort" integer NOT NULL,
	"lifetime_deposited" numeric(78,0) NOT NULL,
	"lifetime_returned" numeric(78,0) NOT NULL,
	"believers" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chain_events" (
	"chain_id" integer NOT NULL,
	"tx_hash" text NOT NULL,
	"log_index" integer NOT NULL,
	"campaign" text NOT NULL,
	"event_name" text NOT NULL,
	"block_number" bigint NOT NULL,
	"block_time" timestamp with time zone NOT NULL,
	"args" jsonb NOT NULL,
	CONSTRAINT "chain_events_chain_id_tx_hash_log_index_pk" PRIMARY KEY("chain_id","tx_hash","log_index")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cohorts" (
	"campaign" text NOT NULL,
	"cohort_id" integer NOT NULL,
	"fraction_ray" numeric(78,0) NOT NULL,
	"total_shares" numeric(78,0) NOT NULL,
	"acc_ray" numeric(78,0) NOT NULL,
	"global_acc_at_birth_ray" numeric(78,0) NOT NULL,
	"returned" numeric(78,0) NOT NULL,
	"formed_at" timestamp with time zone NOT NULL,
	"formed_block" bigint NOT NULL,
	"formed_tx" text NOT NULL,
	CONSTRAINT "cohorts_campaign_cohort_id_pk" PRIMARY KEY("campaign","cohort_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "indexer_cursor" (
	"chain_id" integer PRIMARY KEY NOT NULL,
	"last_block" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "maker_nonces" (
	"campaign" text NOT NULL,
	"maker" text NOT NULL,
	"min_valid_nonce" numeric(78,0) NOT NULL,
	CONSTRAINT "maker_nonces_campaign_maker_pk" PRIMARY KEY("campaign","maker")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "orders" (
	"campaign" text NOT NULL,
	"order_hash" text NOT NULL,
	"maker" text NOT NULL,
	"is_sell" boolean NOT NULL,
	"cohort_id" integer NOT NULL,
	"share_amount" numeric(78,0) NOT NULL,
	"usdc_amount" numeric(78,0) NOT NULL,
	"nonce" numeric(78,0) NOT NULL,
	"deadline" numeric(78,0) NOT NULL,
	"signature" text NOT NULL,
	"status" text NOT NULL,
	"filled_shares" numeric(78,0) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_campaign_order_hash_pk" PRIMARY KEY("campaign","order_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "positions" (
	"campaign" text NOT NULL,
	"account" text NOT NULL,
	"pool_balance" numeric(78,0) NOT NULL,
	"settled_up_to" integer NOT NULL,
	"accrued_reward" numeric(78,0) NOT NULL,
	CONSTRAINT "positions_campaign_account_pk" PRIMARY KEY("campaign","account")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shares" (
	"campaign" text NOT NULL,
	"cohort_id" integer NOT NULL,
	"account" text NOT NULL,
	"shares" numeric(78,0) NOT NULL,
	"reward_debt" numeric(78,0) NOT NULL,
	CONSTRAINT "shares_campaign_cohort_id_account_pk" PRIMARY KEY("campaign","cohort_id","account")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trades" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign" text NOT NULL,
	"cohort_id" integer NOT NULL,
	"order_hash" text NOT NULL,
	"maker" text NOT NULL,
	"taker" text NOT NULL,
	"shares" numeric(78,0) NOT NULL,
	"usdc" numeric(78,0) NOT NULL,
	"maker_is_seller" boolean NOT NULL,
	"tx_hash" text NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_campaign_idx" ON "activity" USING btree ("campaign","at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_actor_idx" ON "activity" USING btree ("actor","at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaigns_chain_idx" ON "campaigns" USING btree ("chain_id","created_block");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chain_events_campaign_idx" ON "chain_events" USING btree ("campaign","block_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_book_idx" ON "orders" USING btree ("campaign","cohort_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_maker_idx" ON "orders" USING btree ("campaign","maker","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "positions_account_idx" ON "positions" USING btree ("account");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shares_account_idx" ON "shares" USING btree ("campaign","account");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shares_account_global_idx" ON "shares" USING btree ("account");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trades_book_idx" ON "trades" USING btree ("campaign","cohort_id","at");