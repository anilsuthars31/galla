CREATE TABLE "business" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"city" text,
	"employee_count" integer DEFAULT 0 NOT NULL,
	"setup_complete" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "payee" (
	"id" text PRIMARY KEY NOT NULL,
	"business_id" text NOT NULL,
	"role" text NOT NULL,
	"name" text NOT NULL,
	"amount" integer,
	"day" integer,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payee_day_range" CHECK ("payee"."day" is null or ("payee"."day" between 1 and 31)),
	CONSTRAINT "payee_amount_positive" CHECK ("payee"."amount" is null or "payee"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "business" ADD CONSTRAINT "business_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payee" ADD CONSTRAINT "payee_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payee_business_idx" ON "payee" USING btree ("business_id");