/* Business profile, regular payees and category corrections. Every query is scoped to the caller's own business. */
import { and, asc, eq, sql } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { BUSINESS_TYPE_IDS, LIMITS, PAYEE_ROLE_IDS, type BusinessProfile, type PayeeRule } from '../../../src/engine/profile';
import { ALL_CATEGORIES, EXPENSE_CATEGORIES, isIncomeCategory, type CategoryId, type ExpenseCategory } from '../../../src/engine/types';
import type { AppVars } from '../app';
import type { Db } from '../db/client';
import { budgetLimit, business, correction, payee } from '../db/schema';

const text = (max: number, what: string) =>
  z
    .string({ error: `${what} is missing.` })
    .trim()
    .min(1, `${what} can't be empty.`)
    .max(max, `${what} is too long (at most ${max} characters).`);

const businessBody = z.object({
  name: text(LIMITS.nameMax, 'Business name'),
  type: z.enum(BUSINESS_TYPE_IDS, { error: 'Pick a business type from the list.' }),
  city: z
    .string()
    .trim()
    .max(LIMITS.cityMax, `City is too long (at most ${LIMITS.cityMax} characters).`)
    .nullish()
    .transform((c) => c || null),
  employeeCount: z
    .number({ error: 'Number of employees must be a number.' })
    .int('Number of employees must be a whole number.')
    .min(0, "Number of employees can't be negative.")
    .max(LIMITS.employeesMax, `Number of employees can be at most ${LIMITS.employeesMax}.`),
  setupComplete: z.boolean().default(false),
});

const payeeBody = z.object({
  role: z.enum(PAYEE_ROLE_IDS, { error: 'Pick who this payee is (employee, landlord, supplier, loan or bill).' }),
  name: text(LIMITS.nameMax, 'Name'),
  amount: z
    .number({ error: 'Amount must be a number.' })
    .int('Amount must be in whole rupees.')
    .positive('Amount must be more than ₹0.')
    .max(LIMITS.amountMax, 'That amount looks too large.')
    .nullish()
    .transform((a) => a ?? null),
  day: z
    .number({ error: 'Day must be a number.' })
    .int('Day must be a whole number.')
    .min(1, 'Day of the month must be between 1 and 31.')
    .max(31, 'Day of the month must be between 1 and 31.')
    .nullish()
    .transform((d) => d ?? null),
  aliases: z
    .array(text(LIMITS.nameMax, 'Other name'))
    .max(LIMITS.aliasesMax, `At most ${LIMITS.aliasesMax} other names per payee.`)
    .default([]),
});

/* Corrections: the web app's payee key (lower-case letters and digits of the payee name, then :C for
   money in or :D for money out) mapped to a category. Money in may only get an income category. */
const CORRECTIONS_MAX = 2000;
const KEY = /^[a-z0-9]{1,120}:[CD]$/;
const categoryId = z.enum(ALL_CATEGORIES as [CategoryId, ...CategoryId[]], { error: 'That is not one of Galla’s categories.' });
const correctionBody = z.object({ category: categoryId });
const importBody = z.object({
  corrections: z.record(z.string(), categoryId).refine((o) => Object.keys(o).length <= 500, 'Import at most 500 changes at a time.'),
});

function checkKey(key: string): string {
  if (!KEY.test(key)) throw new HTTPException(400, { message: 'That payee could not be recognised.' });
  return key;
}

function checkDirection(key: string, category: CategoryId) {
  const moneyIn = key.endsWith(':C');
  if (moneyIn !== isIncomeCategory(category)) {
    throw new HTTPException(400, {
      message: moneyIn ? 'Money coming in can only be sales or other income.' : 'Money going out can’t be sales or other income.',
    });
  }
}

/* Budget: the owner's own monthly amount per spending category (D19). */
const budgetBody = z.object({
  amount: z
    .number({ error: 'Budget must be a number.' })
    .int('Budget must be in whole rupees.')
    .min(0, "Budget can't be negative.")
    .max(LIMITS.amountMax, 'That budget looks too large.'),
});

function checkExpenseCategory(c: string): ExpenseCategory {
  if (!(EXPENSE_CATEGORIES as readonly string[]).includes(c)) {
    throw new HTTPException(400, { message: 'A budget can only be set for a spending category.' });
  }
  return c as ExpenseCategory;
}

/** Parses a JSON body; any problem becomes a 400 with the first message a person can act on. */
async function body<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: 'The request was not valid JSON.' });
  }
  const r = schema.safeParse(raw);
  if (!r.success) throw new HTTPException(400, { message: r.error.issues[0]?.message ?? 'Some details are not valid.' });
  return r.data;
}

function requireUser(c: Context<AppVars>) {
  const user = c.get('user');
  if (!user) throw new HTTPException(401, { message: 'Please log in again.' });
  return user;
}

const toProfile = (b: typeof business.$inferSelect): BusinessProfile => ({
  name: b.name,
  type: b.type,
  city: b.city,
  employeeCount: b.employeeCount,
  setupComplete: b.setupComplete,
});

const toPayee = (p: typeof payee.$inferSelect): PayeeRule => ({
  id: p.id,
  role: p.role,
  name: p.name,
  amount: p.amount,
  day: p.day,
  aliases: p.aliases,
});

export function profileRoutes(db: Db) {
  const r = new Hono<AppVars>();

  const findBusiness = async (userId: string) => (await db.select().from(business).where(eq(business.userId, userId)).limit(1))[0];

  const requireBusiness = async (userId: string) => {
    const b = await findBusiness(userId);
    if (!b) throw new HTTPException(409, { message: 'Set up your business first.' });
    return b;
  };

  r.get('/business', async (c) => {
    const b = await findBusiness(requireUser(c).id);
    return c.json({ business: b ? toProfile(b) : null });
  });

  r.put('/business', async (c) => {
    const user = requireUser(c);
    const v = await body(c, businessBody);
    const [row] = await db
      .insert(business)
      .values({ userId: user.id, ...v })
      .onConflictDoUpdate({ target: business.userId, set: { ...v, updatedAt: new Date() } })
      .returning();
    return c.json({ business: toProfile(row!) });
  });

  r.get('/payees', async (c) => {
    const b = await findBusiness(requireUser(c).id);
    if (!b) return c.json({ payees: [] });
    const rows = await db.select().from(payee).where(eq(payee.businessId, b.id)).orderBy(asc(payee.createdAt), asc(payee.id));
    return c.json({ payees: rows.map(toPayee) });
  });

  r.post('/payees', async (c) => {
    const b = await requireBusiness(requireUser(c).id);
    const v = await body(c, payeeBody);
    const [{ n } = { n: 0 }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(payee)
      .where(eq(payee.businessId, b.id));
    if (n >= LIMITS.payeesMax) throw new HTTPException(400, { message: `You can save at most ${LIMITS.payeesMax} payees.` });
    const [row] = await db
      .insert(payee)
      .values({ businessId: b.id, ...v })
      .returning();
    return c.json({ payee: toPayee(row!) }, 201);
  });

  r.patch('/payees/:id', async (c) => {
    const b = await requireBusiness(requireUser(c).id);
    const v = await body(c, payeeBody.partial());
    const [row] = await db
      .update(payee)
      .set({ ...v, updatedAt: new Date() })
      .where(and(eq(payee.id, c.req.param('id')), eq(payee.businessId, b.id)))
      .returning();
    if (!row) throw new HTTPException(404, { message: 'That payee was not found. It may have been deleted.' });
    return c.json({ payee: toPayee(row) });
  });

  r.delete('/payees/:id', async (c) => {
    const b = await requireBusiness(requireUser(c).id);
    const [row] = await db
      .delete(payee)
      .where(and(eq(payee.id, c.req.param('id')), eq(payee.businessId, b.id)))
      .returning({ id: payee.id });
    if (!row) throw new HTTPException(404, { message: 'That payee was not found. It may have been deleted.' });
    return c.body(null, 204);
  });

  /* ---------- category corrections (payee key -> category) ---------- */

  const listCorrections = async (businessId: string) => {
    const rows = await db.select().from(correction).where(eq(correction.businessId, businessId));
    return Object.fromEntries(rows.map((x) => [x.payeeKey, x.category]));
  };

  const upsertCorrections = async (businessId: string, entries: [string, CategoryId][]) => {
    if (!entries.length) return;
    const [{ n } = { n: 0 }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(correction)
      .where(eq(correction.businessId, businessId));
    if (n + entries.length > CORRECTIONS_MAX) {
      throw new HTTPException(400, { message: `You can save at most ${CORRECTIONS_MAX.toLocaleString('en-IN')} category changes.` });
    }
    await db
      .insert(correction)
      .values(entries.map(([payeeKey, category]) => ({ businessId, payeeKey, category })))
      .onConflictDoUpdate({ target: [correction.businessId, correction.payeeKey], set: { category: sql`excluded.category`, updatedAt: new Date() } });
  };

  r.get('/corrections', async (c) => {
    const b = await findBusiness(requireUser(c).id);
    return c.json({ corrections: b ? await listCorrections(b.id) : {} });
  });

  r.put('/corrections/:key', async (c) => {
    const b = await requireBusiness(requireUser(c).id);
    const key = checkKey(c.req.param('key'));
    const { category } = await body(c, correctionBody);
    checkDirection(key, category);
    await upsertCorrections(b.id, [[key, category]]);
    return c.json({ key, category });
  });

  /** Uploads corrections made on this device before accounts kept them (one-time move). */
  r.post('/corrections/import', async (c) => {
    const b = await requireBusiness(requireUser(c).id);
    const { corrections } = await body(c, importBody);
    const entries = Object.entries(corrections).map(([k, cat]) => {
      const key = checkKey(k);
      checkDirection(key, cat);
      return [key, cat] as [string, CategoryId];
    });
    await upsertCorrections(b.id, entries);
    return c.json({ corrections: await listCorrections(b.id) });
  });

  r.delete('/corrections/:key', async (c) => {
    const b = await requireBusiness(requireUser(c).id);
    await db.delete(correction).where(and(eq(correction.businessId, b.id), eq(correction.payeeKey, checkKey(c.req.param('key')))));
    return c.body(null, 204);
  });

  r.delete('/corrections', async (c) => {
    const b = await requireBusiness(requireUser(c).id);
    await db.delete(correction).where(eq(correction.businessId, b.id));
    return c.body(null, 204);
  });

  /* ---------- budget (the owner's own amounts; suggestions come from the statement) ---------- */

  r.get('/budget', async (c) => {
    const b = await findBusiness(requireUser(c).id);
    if (!b) return c.json({ limits: {} });
    const rows = await db.select().from(budgetLimit).where(eq(budgetLimit.businessId, b.id));
    return c.json({ limits: Object.fromEntries(rows.map((x) => [x.category, x.amount])) });
  });

  r.put('/budget/:category', async (c) => {
    const b = await requireBusiness(requireUser(c).id);
    const category = checkExpenseCategory(c.req.param('category'));
    const { amount } = await body(c, budgetBody);
    await db
      .insert(budgetLimit)
      .values({ businessId: b.id, category, amount })
      .onConflictDoUpdate({ target: [budgetLimit.businessId, budgetLimit.category], set: { amount, updatedAt: new Date() } });
    return c.json({ category, amount });
  });

  /** Back to Galla's suggestion for this category. */
  r.delete('/budget/:category', async (c) => {
    const b = await requireBusiness(requireUser(c).id);
    const category = checkExpenseCategory(c.req.param('category'));
    await db.delete(budgetLimit).where(and(eq(budgetLimit.businessId, b.id), eq(budgetLimit.category, category)));
    return c.body(null, 204);
  });

  return r;
}
