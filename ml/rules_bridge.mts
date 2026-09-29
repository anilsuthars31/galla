/* Runs the app's own keyword rules (src/engine/rules.ts) for the Python scripts, so there is no second
   copy of the rules to drift. Needs Node >= 22.18 (runs .ts directly).
   stdin: JSON [[narration, "C"|"D"], ...]   stdout: JSON [category | null, ...] */
import { readFileSync } from 'node:fs';
import { ruleCategory } from '../src/engine/rules.ts';

const rows: [string, 'C' | 'D'][] = JSON.parse(readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(rows.map(([narration, dir]) => ruleCategory(narration, dir))));
