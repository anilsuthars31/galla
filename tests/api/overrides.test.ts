import { describe, expect, it } from 'vitest';
import { diffOverrides } from '../../src/ui/useOverrides';

describe('diffOverrides', () => {
  it('a new correction is one set', () => {
    expect(diffOverrides({}, { 'a:D': 'rent' })).toEqual({ clear: false, set: [['a:D', 'rent']], remove: [] });
  });

  it('changing one sends only that one', () => {
    expect(diffOverrides({ 'a:D': 'rent', 'b:D': 'salary' }, { 'a:D': 'rent', 'b:D': 'emi' })).toEqual({
      clear: false,
      set: [['b:D', 'emi']],
      remove: [],
    });
  });

  it('undo of a brand-new correction removes it', () => {
    expect(diffOverrides({ 'a:D': 'rent', 'b:D': 'salary' }, { 'a:D': 'rent' })).toEqual({ clear: false, set: [], remove: ['b:D'] });
  });

  it('undo of a change puts the old category back', () => {
    expect(diffOverrides({ 'a:D': 'emi' }, { 'a:D': 'rent' }).set).toEqual([['a:D', 'rent']]);
  });

  it('reset is a single clear', () => {
    expect(diffOverrides({ 'a:D': 'rent', 'b:D': 'salary' }, {})).toEqual({ clear: true, set: [], remove: [] });
  });

  it('undo of a reset sets everything again', () => {
    expect(diffOverrides({}, { 'a:D': 'rent', 'b:D': 'salary' }).set).toHaveLength(2);
  });

  it('no change, no calls', () => {
    expect(diffOverrides({ 'a:D': 'rent' }, { 'a:D': 'rent' })).toEqual({ clear: false, set: [], remove: [] });
    expect(diffOverrides({}, {})).toEqual({ clear: false, set: [], remove: [] });
  });
});
