import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db/client';
import { user } from '../src/db/schema';

const root = mkdtempSync(join(tmpdir(), 'galla-db-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('local database folder', () => {
  it('creates missing folders, and data survives closing and reopening', async () => {
    const dir = join(root, 'nested', 'galla');
    const first = await openDatabase(dir);
    await first.db.insert(user).values({ id: 'u1', name: 'Asha', email: 'asha@example.com' });
    await first.close();

    const second = await openDatabase(dir); // migrations must be a no-op the second time
    const rows = await second.db.select().from(user);
    await second.close();
    expect(rows.map((r) => r.email)).toEqual(['asha@example.com']);
  });
});
