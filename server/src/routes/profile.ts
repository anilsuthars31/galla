/* Business profile and regular payees. Every query is scoped to the caller's own business. */
import { and, asc, eq, sql } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { BUSINESS_TYPE_IDS, LIMITS, PAYEE_ROLE_IDS, type BusinessProfile, type PayeeRule } from '../../../src/engine/profile';
import type { AppVars } from '../app';
import type { Db } from '../db/client';
import { business, payee } from '../db/schema';

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
  role: z.enum(PAYEE_ROLE_IDS, { error: 'Pick who this payee is (employee, landlord, supplier, loan or utility).' }),
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

  return r;
}
