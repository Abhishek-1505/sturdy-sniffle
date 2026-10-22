import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  STORAGE_KEY, RECOVERY_KEY, addExpense, addGoal, closeMonth, contributeToGoal,
  currentMonth, deleteExpense, emptyState, initialState, monthSummary,
  readState, setBudgets, writeState,
} from './model';
import type { State } from './model';

const fixture = (): State => {
  const state = emptyState();
  return setBudgets(state, currentMonth(), { food: 800000 });
};
const expense = (amount = 750000) => ({ title: 'Monthly spending', categoryId: 'food', amount, date: `${currentMonth()}-01`, note: '' });

afterEach(() => vi.unstubAllGlobals());

describe('monthly spending and reward accounting', () => {
  it('moves exactly the unspent ₹500 from an ₹8,000 budget to rewards', () => {
    const state = addExpense(fixture(), expense());
    expect(monthSummary(state, currentMonth())).toMatchObject({ budget: 800000, spent: 750000, remaining: 50000, availableReward: 50000 });
    const closed = closeMonth(state, currentMonth());
    expect(closed.rewardPool).toBe(50000);
    expect(closed.rewardHistory).toHaveLength(1);
    expect(monthSummary(closed, currentMonth())).toMatchObject({ closed: true, transfer: 50000, availableReward: 0 });
    expect(closeMonth(closed, currentMonth())).toBe(closed);
    expect(closed.rewardPool).toBe(50000);
  });

  it('does not award rewards for an overspent month', () => {
    const state = addExpense(fixture(), expense(850000));
    expect(monthSummary(state, currentMonth()).remaining).toBe(-50000);
    expect(closeMonth(state, currentMonth()).rewardPool).toBe(0);
  });

  it('locks budgets and expense mutations after a month is closed', () => {
    const state = addExpense(fixture(), expense());
    const closed = closeMonth(state, currentMonth());
    expect(() => addExpense(closed, expense(100))).toThrow(/closed/);
    expect(() => deleteExpense(closed, state.expenses[0].id)).toThrow(/closed/);
    expect(() => setBudgets(closed, currentMonth(), { food: 500000 })).toThrow(/closed/);
  });

  it('rejects closing future and unconfigured historical months', () => {
    expect(() => closeMonth(fixture(), '9999-01')).toThrow(/future/);
    expect(() => closeMonth(fixture(), '2000-01')).toThrow(/budget/i);
  });

  it('validates real calendar dates and positive integer monetary values', () => {
    for (const amount of [-1, 0, 1.5, NaN, Infinity]) {
      expect(() => addExpense(fixture(), expense(amount))).toThrow();
    }
    expect(() => addExpense(fixture(), { ...expense(), date: '2026-02-30' })).toThrow(/date/);
    expect(() => setBudgets(fixture(), currentMonth(), { food: -1 })).toThrow();
    expect(() => addExpense(fixture(), { ...expense(), categoryId: 'missing' })).toThrow(/category/);
  });

  it('removes an open-month expense and restores its remaining budget', () => {
    const state = addExpense(fixture(), expense());
    const restored = deleteExpense(state, state.expenses[0].id);
    expect(monthSummary(restored, currentMonth()).remaining).toBe(800000);
  });

  it('does not retroactively add new-category budgets to saved months', () => {
    const base = fixture();
    const closed = closeMonth(addExpense(base, expense()), currentMonth());
    const appendCategory = (state: State): State => ({ ...state, categories: [...state.categories, { id: 'new-category', name: 'Books', icon: 'tag', color: '#123456', budget: 100000 }] });
    const openWithCategory = appendCategory(base);
    const closedWithCategory = appendCategory(closed);
    expect(monthSummary(openWithCategory, currentMonth()).budget).toBe(800000);
    expect(monthSummary(closedWithCategory, currentMonth())).toMatchObject({ budget: 800000, spent: 750000, transfer: 50000 });
    expect(closedWithCategory.rewardPool).toBe(50000);
    expect(monthSummary(openWithCategory, '2027-01').budget).toBe(100000);
  });

  it('keeps distinct monthly budgets and supports custom categories', () => {
    const base = fixture();
    const custom = { ...base, categories: [...base.categories, { id: 'custom', name: 'Pets', icon: 'tag', color: '#123456', budget: 0 }] };
    const state = setBudgets(custom, '2027-01', { food: 200000, custom: 30000 });
    expect(monthSummary(state, '2027-01').budget).toBe(230000);
    expect(monthSummary(state, currentMonth()).budget).toBe(800000);
  });
});

describe('separate savings and rewards goals', () => {
  it('does not spend monthly budget or rewards when contributing to savings', () => {
    const state = addGoal(fixture(), { name: 'Emergency fund', target: 1000000, emoji: '☂️', kind: 'savings' });
    const next = contributeToGoal(state, state.goals[0].id, 200000);
    expect(next.goals[0].saved).toBe(200000);
    expect(next.rewardPool).toBe(0);
    expect(monthSummary(next, currentMonth())).toEqual(monthSummary(state, currentMonth()));
  });

  it('funds rewards only from the rewards pool and does not exceed a target', () => {
    const state = addGoal({ ...fixture(), rewardPool: 50000 }, { name: 'New book', target: 30000, emoji: '📚', kind: 'reward' });
    const next = contributeToGoal(state, state.goals[0].id, 30000);
    expect(next.rewardPool).toBe(20000);
    expect(next.goals[0].saved).toBe(30000);
    expect(() => contributeToGoal(next, next.goals[0].id, 1)).toThrow(/more than/);
  });

  it('rejects goals without a positive target and contributions beyond available pool', () => {
    expect(() => addGoal(fixture(), { name: 'Book', target: -1, emoji: '📚', kind: 'reward' })).toThrow();
    const state = addGoal(fixture(), { name: 'Book', target: 30000, emoji: '📚', kind: 'reward' });
    expect(() => contributeToGoal(state, state.goals[0].id, 100)).toThrow(/not enough/);
    expect(() => contributeToGoal(state, state.goals[0].id, -1)).toThrow();
  });
});

describe('demo data and browser persistence', () => {
  it('has a usable explicitly demo starting point and an empty alternative', () => {
    const summary = monthSummary(initialState(), currentMonth());
    expect(summary).toMatchObject({ budget: 800000, spent: 563900 });
    expect(monthSummary(emptyState(), currentMonth())).toMatchObject({ budget: 0, spent: 0 });
    expect(emptyState()).toMatchObject({ expenses: [], goals: [], rewardPool: 0, rewardHistory: [] });
  });

  it('round-trips data through browser storage', () => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
    const state = addExpense(fixture(), expense());
    writeState(state);
    expect(data.has(STORAGE_KEY)).toBe(true);
    expect(readState()).toEqual(state);
  });

  it('persists every supported display currency, including GBP', () => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
    for (const currency of ['INR', 'USD', 'AED', 'EUR', 'GBP']) {
      const state = { ...fixture(), currency };
      writeState(state);
      expect(readState()).toEqual(state);
    }
  });

  it('preserves invalid stored data before replacing it with a valid state', () => {
    const damaged = '{this-used-to-be-user-data';
    const data = new Map<string, string>([[STORAGE_KEY, damaged]]);
    vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
    expect(readState().version).toBe(1);
    expect(data.get(STORAGE_KEY)).toBe(damaged);
    const state = fixture();
    writeState(state);
    expect(data.get(RECOVERY_KEY)).toBe(damaged);
    expect(readState()).toEqual(state);
    const secondDamaged = '{a-different-damaged-state';
    data.set(STORAGE_KEY, secondDamaged);
    writeState(state);
    expect(data.get(RECOVERY_KEY)).toBe(damaged);
    expect([...data.entries()].some(([key, value]) => key.startsWith(`${RECOVERY_KEY}-`) && value === secondDamaged)).toBe(true);
  });

  it('does not overwrite invalid data when a recovery backup cannot be saved', () => {
    const damaged = '{user-data-to-preserve';
    const data = new Map<string, string>([[STORAGE_KEY, damaged]]);
    vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => {
      if (key.startsWith(RECOVERY_KEY)) throw new Error('Storage full');
      data.set(key, value);
    } });
    expect(() => writeState(fixture())).toThrow(/backup could not be saved/);
    expect(data.get(STORAGE_KEY)).toBe(damaged);
  });

  it('recovers from corrupt or unavailable browser storage', () => {
    vi.stubGlobal('localStorage', { getItem: () => '{bad-json' });
    expect(readState().version).toBe(1);
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ version: 1, rewardPool: -100 }) });
    expect(readState().categories).toHaveLength(6);
    vi.stubGlobal('localStorage', undefined);
    expect(() => readState()).not.toThrow();
    expect(() => writeState(fixture())).toThrow(/storage is unavailable/);
  });
});
