import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  STORAGE_KEY, RECOVERY_KEY, addExpense, addGoal, closeMonth, contributeToGoal,
  currentMonth, deleteExpense, emptyState, initialState, monthSummary,
  readState, setBudgets, writeState, applyDueMonths, defaultPlan, depositSavings,
  getMonthlyPlan, savingsSummary, setMonthlyPlan, withdrawSavings,
} from './model';
import type { State } from './model';

const fixture = (): State => {
  const state = emptyState();
  return setBudgets(state, currentMonth(), { food: 800000 });
};
const expense = (amount = 750000) => ({ title: 'Monthly spending', categoryId: 'food', amount, date: `${currentMonth()}-01`, note: '' });

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

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
    const state = addGoal(depositSavings(fixture(), 200000), { name: 'Emergency fund', target: 1000000, emoji: '☂️', kind: 'savings' });
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
    expect(summary).toMatchObject({ budget: 350000, spent: 239900 });
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
    expect(readState().version).toBe(2);
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
    expect(readState().version).toBe(2);
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify({ version: 1, rewardPool: -100 }) });
    expect(readState().categories).toHaveLength(6);
    vi.stubGlobal('localStorage', undefined);
    expect(() => readState()).not.toThrow();
    expect(() => writeState(fixture())).toThrow(/storage is unavailable/);
  });
});

describe('salary plans and automatic monthly savings', () => {
  const at = (date: string) => { vi.useFakeTimers(); vi.setSystemTime(new Date(`${date}T12:00:00Z`)); };

  it('sets aside fixed costs and savings before calculating the spending allowance', () => {
    const state = setMonthlyPlan(emptyState(), currentMonth(), defaultPlan());
    expect(monthSummary(state, currentMonth())).toMatchObject({ salary: 1250000, fixedCosts: 700000, savings: 200000, budget: 350000, remaining: 350000 });
    expect(savingsSummary(state)).toMatchObject({ balance: 200000, available: 200000, allocated: 0 });
    expect(state.savingsTransactions.filter(entry => entry.kind === 'monthly')).toHaveLength(1);
    expect(applyDueMonths(state)).toBe(state);
    expect(savingsSummary(setMonthlyPlan(state, currentMonth(), defaultPlan())).balance).toBe(200000);
  });

  it('treats categories as guides while judging rewards against the total allowance', () => {
    let state = setMonthlyPlan(emptyState(), currentMonth(), defaultPlan());
    state = setBudgets(state, currentMonth(), { food: 100000, groceries: 200000 });
    state = addExpense(state, { ...expense(150000), categoryId: 'food' });
    state = addExpense(state, { ...expense(100000), categoryId: 'groceries' });
    expect(monthSummary(state, currentMonth())).toMatchObject({ budget: 350000, categoryBudgetTotal: 300000, spent: 250000, remaining: 100000 });
    expect(state.months[currentMonth()].plan).toEqual(defaultPlan());
    expect(state.months[currentMonth()].savingsApplied).toBe(true);
    const closed = closeMonth(state, currentMonth());
    expect(closed.rewardPool).toBe(100000);
    expect(savingsSummary(closed).balance).toBe(200000);
  });

  it('catches up each missed month exactly once without crediting future months', () => {
    at('2026-10-22');
    const state = setMonthlyPlan(emptyState(), currentMonth(), defaultPlan());
    at('2027-01-03');
    const next = applyDueMonths(state);
    expect(savingsSummary(next).balance).toBe(800000);
    expect(next.savingsTransactions.filter(entry => entry.kind === 'monthly').map(entry => entry.month)).toEqual(['2026-10', '2026-11', '2026-12', '2027-01']);
    expect(applyDueMonths(next)).toBe(next);
    expect(applyDueMonths(next, '9999-01')).toBe(next);
    expect(getMonthlyPlan(next, '2027-01')).toEqual(defaultPlan());
  });

  it('respects a scheduled future plan without applying its amount early', () => {
    at('2026-10-22');
    const oldPlan = defaultPlan(); const newPlan = { ...oldPlan, savings: 300000 };
    const state = setMonthlyPlan(setMonthlyPlan(emptyState(), '2026-10', oldPlan), '2026-12', newPlan);
    expect(savingsSummary(state).balance).toBe(200000);
    expect(getMonthlyPlan(state, '2026-11')?.savings).toBe(200000);
    expect(getMonthlyPlan(state, '2026-12')?.savings).toBe(300000);
    at('2026-11-02');
    const november = applyDueMonths(state);
    expect(savingsSummary(november).balance).toBe(400000);
    expect(monthSummary(november, '2026-11').budget).toBe(350000);
    at('2026-12-02');
    const december = applyDueMonths(november);
    expect(savingsSummary(december).balance).toBe(700000);
    expect(monthSummary(december, '2026-12').budget).toBe(250000);
    expect(monthSummary(december, '2026-10').budget).toBe(350000);
  });

  it('keeps explicit future changes when editing an intervening plan', () => {
    at('2026-10-22');
    let state = setMonthlyPlan(emptyState(), '2026-10', defaultPlan());
    state = setMonthlyPlan(state, '2027-01', { ...defaultPlan(), savings: 400000 });
    state = setMonthlyPlan(state, '2026-12', { ...defaultPlan(), savings: 300000 });
    expect(getMonthlyPlan(state, '2026-11')?.savings).toBe(200000);
    expect(getMonthlyPlan(state, '2026-12')?.savings).toBe(300000);
    expect(getMonthlyPlan(state, '2027-01')?.savings).toBe(400000);
    at('2027-02-02');
    expect(savingsSummary(applyDueMonths(state)).balance).toBe(1500000);
  });

  it('reconciles current-month edits rather than duplicating their credit', () => {
    let state = setMonthlyPlan(emptyState(), currentMonth(), defaultPlan());
    state = setMonthlyPlan(state, currentMonth(), { ...defaultPlan(), savings: 250000 });
    expect(savingsSummary(state).balance).toBe(250000);
    expect(state.savingsTransactions.filter(entry => entry.kind === 'monthly')).toHaveLength(1);
    expect(monthSummary(state, currentMonth()).budget).toBe(300000);
    state = setMonthlyPlan(state, currentMonth(), { ...defaultPlan(), savings: 0 });
    expect(savingsSummary(state).balance).toBe(0);
    expect(state.months[currentMonth()].savingsApplied).toBe(true);
    expect(applyDueMonths(state)).toBe(state);
  });

  it('rejects impossible plans, closed/past edits, and reductions of used savings', () => {
    expect(() => setMonthlyPlan(emptyState(), currentMonth(), { ...defaultPlan(), salary: 800000 })).toThrow(/exceed/);
    expect(() => setMonthlyPlan(emptyState(), currentMonth(), { ...defaultPlan(), savings: -1 })).toThrow();
    expect(() => setMonthlyPlan(emptyState(), '2000-01', defaultPlan())).toThrow(/past/i);
    const state = setMonthlyPlan(emptyState(), currentMonth(), defaultPlan());
    const used = withdrawSavings(state, 150000);
    expect(() => setMonthlyPlan(used, currentMonth(), { ...defaultPlan(), savings: 100000 })).toThrow(/used or allocated/);
    const closed = closeMonth(state, currentMonth());
    expect(() => setMonthlyPlan(closed, currentMonth(), defaultPlan())).toThrow(/closed/);
  });

  it('starts future-only plans on their effective month', () => {
    at('2026-10-22');
    const state = setMonthlyPlan(emptyState(), '2026-12', defaultPlan());
    expect(getMonthlyPlan(state, '2026-10')).toBeNull();
    expect(savingsSummary(state).balance).toBe(0);
    at('2026-11-30'); expect(applyDueMonths(state)).toBe(state);
    at('2026-12-01'); expect(savingsSummary(applyDueMonths(state)).balance).toBe(200000);
  });
});

describe('savings account deposits, withdrawals, and allocations', () => {
  it('records windfalls and withdrawals without changing spending or rewards', () => {
    const base = setMonthlyPlan(emptyState(), currentMonth(), defaultPlan());
    const deposited = depositSavings(base, 75000, 'Birthday gift');
    const next = withdrawSavings(deposited, 25000, 'Unexpected repair');
    expect(savingsSummary(next)).toMatchObject({ balance: 250000, available: 250000, allocated: 0, deposited: 275000, withdrawn: 25000 });
    expect(monthSummary(next, currentMonth())).toEqual(monthSummary(base, currentMonth()));
    expect(next.rewardPool).toBe(base.rewardPool);
    expect(next.savingsTransactions.at(-1)).toMatchObject({ kind: 'withdrawal', amount: 25000, note: 'Unexpected repair' });
  });

  it('allocates existing savings and can withdraw money from a funded goal', () => {
    let state = addGoal(depositSavings(emptyState(), 100000), { name: 'Rainy day', target: 200000, emoji: '☂️', kind: 'savings' });
    state = contributeToGoal(state, state.goals[0].id, 80000);
    expect(savingsSummary(state)).toMatchObject({ balance: 100000, allocated: 80000, available: 20000 });
    expect(() => withdrawSavings(state, 30000)).toThrow(/unallocated/);
    state = withdrawSavings(state, 50000, 'Rainy day arrived', state.goals[0].id);
    expect(savingsSummary(state)).toMatchObject({ balance: 50000, allocated: 30000, available: 20000 });
    expect(state.goals[0].saved).toBe(30000);
    expect(() => withdrawSavings(state, 30001, '', state.goals[0].id)).toThrow(/enough saved/);
  });

  it('can deposit directly into a goal without double-counting funds', () => {
    const state = addGoal(emptyState(), { name: 'Emergency fund', target: 100000, emoji: '☂️', kind: 'savings' });
    const next = depositSavings(state, 60000, 'Windfall', state.goals[0].id);
    expect(savingsSummary(next)).toMatchObject({ balance: 60000, allocated: 60000, available: 0 });
    expect(next.goals[0].saved).toBe(60000);
    expect(() => depositSavings(next, 50000, '', next.goals[0].id)).toThrow(/more than/);
    expect(() => contributeToGoal(next, next.goals[0].id, 1)).toThrow(/unallocated/);
    expect(() => withdrawSavings(next, 1)).toThrow(/unallocated/);
  });

  it('rejects negative, fractional, missing-goal, and unavailable money', () => {
    const state = emptyState();
    for (const amount of [-1, 0, 1.5, NaN, Infinity]) {
      expect(() => depositSavings(state, amount)).toThrow();
      expect(() => withdrawSavings(state, amount)).toThrow();
    }
    expect(() => withdrawSavings(state, 1)).toThrow();
    expect(() => depositSavings(state, 1, '', 'missing')).toThrow(/valid savings goal/);
  });
});

describe('upgrade and automatic savings persistence', () => {
  const storage = (initial?: string) => {
    const data = new Map<string, string>(initial ? [[STORAGE_KEY, initial]] : []);
    vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
    return data;
  };

  it('preserves all v1 records and goal balances without imposing a salary plan', () => {
    const base = closeMonth(addExpense(fixture(), expense()), currentMonth());
    const legacy = { ...base, version: 1, goals: [{ id: 'old-goal', name: 'Existing savings', target: 500000, saved: 123456, emoji: '☂️', kind: 'savings' }] } as Record<string, unknown>;
    delete legacy.recurringPlan; delete legacy.planStartMonth; delete legacy.savingsTransactions;
    const raw = JSON.stringify(legacy); const data = storage(raw);
    const migrated = readState();
    expect(migrated.version).toBe(2);
    expect(migrated.goals).toEqual(legacy.goals);
    expect(migrated.expenses).toEqual(legacy.expenses);
    expect(migrated.months).toEqual(legacy.months);
    expect(migrated.rewardHistory).toEqual(legacy.rewardHistory);
    expect(migrated.rewardPool).toBe(50000);
    expect(migrated.recurringPlan).toBeNull();
    expect(savingsSummary(migrated)).toMatchObject({ balance: 123456, allocated: 123456, available: 0 });
    expect(data.get(`${STORAGE_KEY}-v1-backup`)).toBe(raw);
    expect(JSON.parse(data.get(STORAGE_KEY)!).version).toBe(2);
    expect(readState()).toEqual(migrated);
  });

  it('persists the first monthly credit even before the first user edit', () => {
    const data = storage();
    const first = readState();
    expect(data.has(STORAGE_KEY)).toBe(true);
    expect(readState()).toEqual(first);
    expect(first.savingsTransactions.filter(entry => entry.kind === 'monthly')).toHaveLength(1);
  });

  it('persists overdue credits so repeated reads and reloads cannot duplicate them', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-22T12:00:00Z'));
    storage(); writeState(setMonthlyPlan(emptyState(), '2026-10', defaultPlan()));
    vi.setSystemTime(new Date('2026-12-10T12:00:00Z'));
    const first = readState(); const second = readState();
    expect(first).toEqual(second);
    expect(savingsSummary(second).balance).toBe(600000);
    expect(second.savingsTransactions.filter(entry => entry.kind === 'monthly')).toHaveLength(3);
  });
});
