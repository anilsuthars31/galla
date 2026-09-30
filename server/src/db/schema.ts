/* Database schema. The four auth tables follow better-auth's expected shape (user, session, account,
   verification); Galla's own tables are added below them. Bank transactions are never stored here. */
import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import type { BusinessType, PayeeRole } from '../../../src/engine/profile';
import type { CategoryId } from '../../../src/engine/types';

const created = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updated = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: created(),
  updatedAt: updated(),
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index('session_user_idx').on(t.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index('account_user_idx').on(t.userId)],
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
);

/* ---------- Galla ---------- */

/** One business per account (a second shop would be a later feature). */
export const business = pgTable('business', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type').$type<BusinessType>().notNull(),
  city: text('city'),
  employeeCount: integer('employee_count').notNull().default(0),
  setupComplete: boolean('setup_complete').notNull().default(false),
  createdAt: created(),
  updatedAt: updated(),
});

/** A regular payee the owner told us about: who they are, and roughly how much and when. */
export const payee = pgTable(
  'payee',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    businessId: text('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    role: text('role').$type<PayeeRole>().notNull(),
    name: text('name').notNull(),
    amount: integer('amount'),
    day: integer('day'),
    aliases: text('aliases').array().notNull().default(sql`'{}'::text[]`),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    index('payee_business_idx').on(t.businessId),
    check('payee_day_range', sql`${t.day} is null or (${t.day} between 1 and 31)`),
    check('payee_amount_positive', sql`${t.amount} is null or ${t.amount} > 0`),
  ],
);

/**
 * The owner's category choice for a payee, made in the ledger or the "Who are these?" card.
 * `payeeKey` is the app's per-payee key (lower-case payee name + ":C" or ":D"), not a transaction.
 */
export const correction = pgTable(
  'correction',
  {
    businessId: text('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    payeeKey: text('payee_key').notNull(),
    category: text('category').$type<CategoryId>().notNull(),
    updatedAt: updated(),
  },
  (t) => [primaryKey({ columns: [t.businessId, t.payeeKey] })],
);

/** The owner's own monthly budget for a category, where they changed Galla's suggestion (D19). */
export const budgetLimit = pgTable(
  'budget_limit',
  {
    businessId: text('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    category: text('category').$type<CategoryId>().notNull(),
    amount: integer('amount').notNull(),
    updatedAt: updated(),
  },
  (t) => [primaryKey({ columns: [t.businessId, t.category] }), check('budget_amount_range', sql`${t.amount} >= 0`)],
);
