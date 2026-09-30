CREATE TABLE "correction" (
	"business_id" text NOT NULL,
	"payee_key" text NOT NULL,
	"category" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "correction_business_id_payee_key_pk" PRIMARY KEY("business_id","payee_key")
);
--> statement-breakpoint
ALTER TABLE "correction" ADD CONSTRAINT "correction_business_id_business_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."business"("id") ON DELETE cascade ON UPDATE no action;