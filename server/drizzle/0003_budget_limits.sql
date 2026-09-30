CREATE TABLE "budget_limit" (
	"business_id" text NOT NULL,
	"category" text NOT NULL,
	"amount" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_limit_business_id_category_pk" PRIMARY KEY("business_id","category"),
	CONSTRAINT "budget_amount_range" CHECK ("budget_limit"."amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "budget_limit" ADD CONSTRAINT "budget_limit_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;