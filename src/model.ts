export type Category = { id: string; name: string; color: string; icon: string; budget: number };
export type Expense = { id: string; title: string; categoryId: string; amount: number; date: string; note: string };
export type Goal = { id: string; name: string; target: number; saved: number; emoji: string; kind: 'savings' | 'reward' };
export type MonthlyPlan = { salary: number; fixedCosts: { id: string; name: string; amount: number }[]; savings: number };
export type SavingsTransaction = { id: string; kind: 'opening' | 'monthly' | 'deposit' | 'withdrawal'; amount: number; date: string; note: string; month?: string; goalId?: string };
export type BudgetScope = 'all' | 'month';
export type MonthRecord = { budgets: Record<string, number>; closed: boolean; rewardTransfer: number; closedAt?: string; plan?: MonthlyPlan; savingsApplied?: boolean; budgetOverride?: boolean };
export type State = {
  version: 2;
  currency: string;
  categories: Category[];
  expenses: Expense[];
  goals: Goal[];
  months: Record<string, MonthRecord>;
  rewardPool: number;
  rewardHistory: { id: string; month: string; amount: number; date: string }[];
  recurringPlan: MonthlyPlan | null;
  planStartMonth: string | null;
  savingsTransactions: SavingsTransaction[];
};
type LegacyState = Omit<State, 'version' | 'recurringPlan' | 'planStartMonth' | 'savingsTransactions'> & { version: 1 };

// Keep the original key so deployed users retain their existing records.
export const STORAGE_KEY = 'pocket-state-v1';
export const RECOVERY_KEY = `${STORAGE_KEY}-recovery`;
const currencies = ['INR', 'USD', 'AED', 'EUR', 'GBP'];
const money = (amount: number, allowZero = false) => {
  if (!Number.isSafeInteger(amount) || amount < (allowZero ? 0 : 1)) throw new Error(allowZero ? 'Enter a valid non-negative amount.' : 'Enter an amount greater than zero.');
};
const totalMoney = (amount: number) => {
  if (!Number.isSafeInteger(amount)) throw new Error('The total amount is too large.');
  return amount;
};
const uid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const pad = (value: number) => String(value).padStart(2, '0');
export const currentMonth = () => { const now = new Date(); return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`; };
const today = () => `${currentMonth()}-${pad(new Date().getDate())}`;
const validMonth = (month: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && +month.slice(0, 4) >= 1000;
const validateMonth = (month: string) => { if (!validMonth(month)) throw new Error('Choose a valid month.'); };
const validDate = (date: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !validMonth(date.slice(0, 7))) return false;
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
};
const editable = (state: State, month: string) => { validateMonth(month); if (state.months[month]?.closed) throw new Error('This month is closed. Its budget and expenses are locked.'); };
export function categoryBudgets(state: State, month: string): Record<string, number> {
  validateMonth(month);
  const record = state.months[month];
  // Unmarked records are existing month-specific snapshots. Closed records
  // stay frozen even if they previously followed the recurring amounts.
  const snapshot = record && (record.closed || record.budgetOverride !== false);
  return Object.fromEntries(state.categories.map(category => [category.id, snapshot ? record.budgets[category.id] ?? 0 : category.budget]));
}
const budgetsFor = categoryBudgets;
const copyPlan = (plan: MonthlyPlan): MonthlyPlan => ({ ...plan, fixedCosts: plan.fixedCosts.map(cost => ({ ...cost })) });
const validatePlan = (plan: MonthlyPlan) => {
  money(plan.salary, true); money(plan.savings, true);
  if (!Array.isArray(plan.fixedCosts)) throw new Error('Enter your fixed monthly costs.');
  const ids = new Set<string>();
  for (const cost of plan.fixedCosts) { if (!cost.id || ids.has(cost.id) || !cost.name.trim()) throw new Error('Give each fixed cost a unique name and ID.'); ids.add(cost.id); money(cost.amount, true); }
  const committed = totalMoney(plan.fixedCosts.reduce((sum, cost) => totalMoney(sum + cost.amount), plan.savings));
  if (committed > plan.salary) throw new Error('Fixed costs and savings cannot exceed your monthly salary.');
};

export function defaultPlan(): MonthlyPlan {
  return { salary: 1250000, fixedCosts: [{ id: 'parents', name: 'Parents', amount: 400000 }, { id: 'rent', name: 'Rent', amount: 300000 }], savings: 200000 };
}

export function getMonthlyPlan(state: State, month: string): MonthlyPlan | null {
  validateMonth(month);
  if (state.months[month]?.plan) return state.months[month].plan!;
  if (!state.recurringPlan || !state.planStartMonth || month < state.planStartMonth) return null;
  // Month snapshots also anchor future changes. A next-month plan cannot
  // change this month's allowance or its automatic savings contribution.
  const anchor = Object.keys(state.months).filter(key => key <= month && state.months[key].plan).sort().at(-1);
  return anchor ? state.months[anchor].plan! : state.recurringPlan;
}

export function savingsSummary(state: State) {
  let deposited = 0; let withdrawn = 0;
  for (const entry of state.savingsTransactions) {
    if (entry.kind === 'withdrawal') withdrawn = totalMoney(withdrawn + entry.amount);
    else deposited = totalMoney(deposited + entry.amount);
  }
  const balance = totalMoney(deposited - withdrawn);
  const allocated = state.goals.filter(goal => goal.kind === 'savings').reduce((sum, goal) => totalMoney(sum + goal.saved), 0);
  return { balance, allocated, available: totalMoney(balance - allocated), deposited, withdrawn };
}

function assertSavings(state: State) {
  const summary = savingsSummary(state);
  if (summary.balance < 0 || summary.available < 0) throw new Error('These savings have already been used or allocated. Reduce a goal allocation or choose a future month before reducing the monthly savings amount.');
}

function creditMonth(state: State, month: string, plan: MonthlyPlan): State {
  const record = state.months[month];
  const next: State = {
    ...state,
    months: { ...state.months, [month]: { ...(record || { budgets: budgetsFor(state, month), closed: false, rewardTransfer: 0, budgetOverride: false }), plan: copyPlan(plan), savingsApplied: true } },
    savingsTransactions: state.savingsTransactions.filter(entry => !(entry.kind === 'monthly' && entry.month === month)),
  };
  if (plan.savings > 0) next.savingsTransactions = [...next.savingsTransactions, { id: `monthly-savings-${month}`, kind: 'monthly', amount: plan.savings, date: `${month}-01`, month, note: 'Automatic monthly savings' }];
  assertSavings(next);
  return next;
}

export function applyDueMonths(state: State, throughMonth = currentMonth()): State {
  validateMonth(throughMonth);
  if (!state.recurringPlan || !state.planStartMonth) return state;
  const end = throughMonth < currentMonth() ? throughMonth : currentMonth();
  let month = state.planStartMonth; let next = state;
  while (month <= end) {
    const record = next.months[month];
    if (!record?.closed && !record?.savingsApplied) { const plan = getMonthlyPlan(next, month); if (plan) next = creditMonth(next, month, plan); }
    const year = +month.slice(0, 4); const number = +month.slice(5);
    month = number === 12 ? `${year + 1}-01` : `${year}-${pad(number + 1)}`;
  }
  return next;
}

export function setMonthlyPlan(state: State, month: string, plan: MonthlyPlan): State {
  editable(state, month); validatePlan(plan);
  if (month < currentMonth()) throw new Error('Change the salary plan for this month or a future month. Past plans stay unchanged.');
  const prepared = applyDueMonths(state); const snapshot = copyPlan(plan);
  let next: State = { ...prepared, recurringPlan: snapshot, planStartMonth: prepared.planStartMonth && prepared.planStartMonth < month ? prepared.planStartMonth : month, months: { ...prepared.months, [month]: { ...(prepared.months[month] || { budgets: budgetsFor(prepared, month), closed: false, rewardTransfer: 0, budgetOverride: false }), plan: snapshot } } };
  const lastAnchor = Object.keys(next.months).filter(key => next.months[key].plan).sort().at(-1)!;
  next.recurringPlan = copyPlan(next.months[lastAnchor].plan!);
  // Replace this month's single credit on edits. Future amounts stay scheduled.
  if (month <= currentMonth()) next = creditMonth(next, month, snapshot);
  return applyDueMonths(next);
}

export function initialState(): State {
  const month = currentMonth(); const day = new Date().getDate();
  const categories: Category[] = [
    { id: 'food', name: 'Food & coffee', color: '#a191ef', icon: 'coffee', budget: 100000 },
    { id: 'groceries', name: 'Groceries', color: '#98b798', icon: 'shopping-basket', budget: 100000 },
    { id: 'transport', name: 'Transport', color: '#e7b981', icon: 'train-front', budget: 50000 },
    { id: 'shopping', name: 'Shopping', color: '#e89baf', icon: 'shopping-bag', budget: 50000 },
    { id: 'wellness', name: 'Wellness', color: '#8abcc8', icon: 'heart', budget: 30000 },
    { id: 'subscriptions', name: 'Subscriptions', color: '#b4a99c', icon: 'repeat', budget: 20000 },
  ];
  const entries: [string, string, number, number][] = [
    ['Weekly grocery run', 'groceries', 40000, 3], ['Dinner with friends', 'food', 55000, 5],
    ['Metro card top-up', 'transport', 20000, 6], ['A little wardrobe refresh', 'shopping', 25000, 8],
    ['Lunch at The Green Table', 'food', 35000, 10], ['Sunday yoga session', 'wellness', 10000, 14],
    ['Spotify Premium', 'subscriptions', 14900, 15], ['Ride home', 'transport', 10000, 17],
    ['Coffee & a good book', 'food', 20000, 19], ['Morning coffee', 'food', 10000, 21],
  ];
  const base: State = {
    version: 2, currency: 'INR', categories,
    expenses: entries.map(([title, categoryId, amount, entryDay], index) => ({ id: `demo-expense-${index}`, title, categoryId, amount, date: `${month}-${pad(Math.min(day, entryDay))}`, note: '' })),
    goals: [
      { id: 'emergency', name: 'Emergency fund', target: 5000000, saved: 2850000, emoji: '☂️', kind: 'savings' },
      { id: 'getaway', name: 'A little getaway', target: 3000000, saved: 1200000, emoji: '🏝️', kind: 'savings' },
      { id: 'headphones', name: 'Headphones upgrade', target: 800000, saved: 350000, emoji: '🎧', kind: 'reward' },
    ],
    months: { [month]: { budgets: Object.fromEntries(categories.map(category => [category.id, category.budget])), closed: false, rewardTransfer: 0, budgetOverride: false } },
    rewardPool: 125000, rewardHistory: [], recurringPlan: null, planStartMonth: null,
    savingsTransactions: [{ id: 'demo-opening', kind: 'opening', amount: 4050000, date: `${month}-01`, note: 'Savings brought forward' }],
  };
  return setMonthlyPlan(base, month, defaultPlan());
}

export function emptyState(): State {
  const demo = initialState(); const categories = demo.categories.map(category => ({ ...category, budget: 0 }));
  return { ...demo, categories, expenses: [], goals: [], rewardPool: 0, rewardHistory: [], recurringPlan: null, planStartMonth: null, savingsTransactions: [], months: { [currentMonth()]: { budgets: Object.fromEntries(categories.map(category => [category.id, 0])), closed: false, rewardTransfer: 0, budgetOverride: false } } };
}

export function monthSummary(state: State, month: string) {
  validateMonth(month); const budgets = budgetsFor(state, month); const plan = getMonthlyPlan(state, month);
  const categorySpent: Record<string, number> = Object.fromEntries(state.categories.map(category => [category.id, 0]));
  for (const expense of state.expenses) if (expense.date.slice(0, 7) === month) categorySpent[expense.categoryId] = totalMoney((categorySpent[expense.categoryId] ?? 0) + expense.amount);
  const categoryBudgetTotal = totalMoney(Object.values(budgets).reduce((sum, amount) => sum + amount, 0));
  const fixedCosts = plan ? totalMoney(plan.fixedCosts.reduce((sum, cost) => sum + cost.amount, 0)) : 0;
  const budget = plan ? totalMoney(plan.salary - fixedCosts - plan.savings) : categoryBudgetTotal;
  const spent = totalMoney(Object.values(categorySpent).reduce((sum, amount) => sum + amount, 0));
  const remaining = budget - spent; const closed = state.months[month]?.closed ?? false;
  return { budget, spent, remaining, availableReward: closed ? 0 : Math.max(0, remaining), closed, transfer: state.months[month]?.rewardTransfer ?? 0, categorySpent, categoryBudgetTotal, salary: plan?.salary ?? 0, fixedCosts, savings: plan?.savings ?? 0 };
}

export function setBudgets(state: State, month: string, budgets: Record<string, number>, scope: BudgetScope = 'month'): State {
  editable(state, month);
  if (scope !== 'all' && scope !== 'month') throw new Error('Choose whether to apply budgets to all months or only this month.');
  const categories = new Set(state.categories.map(category => category.id));
  for (const [category, amount] of Object.entries(budgets)) { if (!categories.has(category)) throw new Error('Choose a valid budget category.'); money(amount, true); }
  const updated = { ...budgetsFor(state, month), ...budgets };
  totalMoney(Object.values(updated).reduce((sum, amount) => sum + amount, 0));
  const record = { ...(state.months[month] || { closed: false, rewardTransfer: 0 }), budgets: updated, budgetOverride: scope === 'month' };
  if (scope === 'month') return { ...state, months: { ...state.months, [month]: record } };
  const months = Object.fromEntries(Object.entries(state.months).map(([key, item]) => [key,
    !item.closed && item.budgetOverride === false ? { ...item, budgets: { ...updated } } : item,
  ]));
  return { ...state, categories: state.categories.map(category => ({ ...category, budget: updated[category.id] })), months: { ...months, [month]: record } };
}

export function useDefaultBudgets(state: State, month: string): State {
  editable(state, month);
  const budgets = Object.fromEntries(state.categories.map(category => [category.id, category.budget]));
  return { ...state, months: { ...state.months, [month]: { ...(state.months[month] || { closed: false, rewardTransfer: 0 }), budgets, budgetOverride: false } } };
}

export function addExpense(state: State, expense: Omit<Expense, 'id'>): State {
  money(expense.amount); if (!validDate(expense.date)) throw new Error('Choose a valid expense date.'); editable(state, expense.date.slice(0, 7));
  const category = state.categories.find(item => item.id === expense.categoryId);
  if (!category) throw new Error('Choose a valid category.');
  const month = expense.date.slice(0, 7);
  totalMoney(monthSummary(state, month).spent + expense.amount);
  const months = state.months[month] ? state.months : { ...state.months, [month]: { budgets: categoryBudgets(state, month), closed: false, rewardTransfer: 0, budgetOverride: false } };
  return { ...state, months, expenses: [{ ...expense, id: uid(), title: expense.title.trim() || category.name, note: expense.note.trim() }, ...state.expenses] };
}

export function deleteExpense(state: State, id: string): State {
  const expense = state.expenses.find(item => item.id === id); if (!expense) throw new Error('This expense could not be found.'); editable(state, expense.date.slice(0, 7));
  return { ...state, expenses: state.expenses.filter(item => item.id !== id) };
}

export function closeMonth(state: State, month: string): State {
  validateMonth(month); if (month > currentMonth()) throw new Error('A future month cannot be closed.'); if (state.months[month]?.closed) return state;
  if (!state.months[month]) throw new Error('Save a budget for this month before closing it.');
  const prepared = applyDueMonths(state); const summary = monthSummary(prepared, month); const amount = summary.availableReward; const date = new Date().toISOString();
  return { ...prepared, months: { ...prepared.months, [month]: { ...prepared.months[month], budgets: budgetsFor(prepared, month), closed: true, rewardTransfer: amount, closedAt: date } }, rewardPool: totalMoney(prepared.rewardPool + amount), rewardHistory: [...prepared.rewardHistory, { id: uid(), month, amount, date }] };
}

export function addGoal(state: State, goal: Omit<Goal, 'id' | 'saved'>): State {
  money(goal.target); if (!goal.name.trim()) throw new Error('Give your goal a name.'); if (goal.kind !== 'savings' && goal.kind !== 'reward') throw new Error('Choose a valid goal type.');
  return { ...state, goals: [...state.goals, { ...goal, name: goal.name.trim(), emoji: goal.emoji.trim() || '✨', id: uid(), saved: 0 }] };
}

const savingsGoal = (state: State, id: string) => {
  const goal = state.goals.find(item => item.id === id && item.kind === 'savings'); if (!goal) throw new Error('Choose a valid savings goal.'); return goal;
};

export function depositSavings(state: State, amount: number, note = '', goalId?: string): State {
  money(amount); totalMoney(savingsSummary(state).balance + amount);
  if (goalId) { const goal = savingsGoal(state, goalId); if (amount > goal.target - goal.saved) throw new Error('This amount is more than your goal needs. Deposit into unallocated savings instead.'); }
  return { ...state, goals: state.goals.map(goal => goal.id === goalId ? { ...goal, saved: totalMoney(goal.saved + amount) } : goal), savingsTransactions: [...state.savingsTransactions, { id: uid(), kind: 'deposit', amount, date: today(), note: note.trim() || 'Extra savings deposit', ...(goalId ? { goalId } : {}) }] };
}

export function withdrawSavings(state: State, amount: number, note = '', goalId?: string): State {
  money(amount);
  if (goalId) { const goal = savingsGoal(state, goalId); if (amount > goal.saved) throw new Error('This goal does not have enough saved to withdraw that amount.'); }
  else if (amount > savingsSummary(state).available) throw new Error('There is not enough unallocated savings. Choose a savings goal to withdraw from instead.');
  if (amount > savingsSummary(state).balance) throw new Error('There is not enough in your savings balance.');
  return { ...state, goals: state.goals.map(goal => goal.id === goalId ? { ...goal, saved: goal.saved - amount } : goal), savingsTransactions: [...state.savingsTransactions, { id: uid(), kind: 'withdrawal', amount, date: today(), note: note.trim() || 'Savings withdrawal', ...(goalId ? { goalId } : {}) }] };
}

export function contributeToGoal(state: State, id: string, amount: number): State {
  money(amount); const goal = state.goals.find(item => item.id === id); if (!goal) throw new Error('This goal could not be found.');
  if (amount > goal.target - goal.saved) throw new Error('This amount is more than your goal needs.');
  if (goal.kind === 'reward' && amount > state.rewardPool) throw new Error('There is not enough in your rewards pool. Close a month to add your unspent budget.');
  if (goal.kind === 'savings' && amount > savingsSummary(state).available) throw new Error('There is not enough unallocated savings. Add money to savings first.');
  return { ...state, goals: state.goals.map(item => item.id === id ? { ...item, saved: totalMoney(item.saved + amount) } : item), rewardPool: goal.kind === 'reward' ? state.rewardPool - amount : state.rewardPool };
}

function validCommon(value: unknown): value is State | LegacyState {
  if (!value || typeof value !== 'object') return false; const s = value as State | LegacyState;
  const text = (v: unknown): v is string => typeof v === 'string'; const cash = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
  if (![1, 2].includes(s.version) || !currencies.includes(s.currency) || !cash(s.rewardPool) || !Array.isArray(s.categories) || !s.categories.length || !Array.isArray(s.expenses) || !Array.isArray(s.goals) || !Array.isArray(s.rewardHistory) || !s.months || typeof s.months !== 'object' || Array.isArray(s.months)) return false;
  if (!s.categories.every(c => c && text(c.id) && text(c.name) && text(c.color) && text(c.icon) && cash(c.budget))) return false;
  const categoryIds = new Set(s.categories.map(c => c.id));
  if (categoryIds.size !== s.categories.length || !s.expenses.every(e => e && text(e.id) && text(e.title) && text(e.note) && categoryIds.has(e.categoryId) && cash(e.amount) && e.amount > 0 && text(e.date) && validDate(e.date))) return false;
  if (!s.goals.every(g => g && text(g.id) && text(g.name) && text(g.emoji) && cash(g.target) && g.target > 0 && cash(g.saved) && g.saved <= g.target && (g.kind === 'savings' || g.kind === 'reward'))) return false;
  if (!Object.entries(s.months).every(([month, record]) => validMonth(month) && record && typeof record.closed === 'boolean' && cash(record.rewardTransfer) && record.budgets && typeof record.budgets === 'object' && !Array.isArray(record.budgets) && Object.entries(record.budgets).every(([id, amount]) => categoryIds.has(id) && cash(amount)) && (record.closedAt === undefined || text(record.closedAt)) && (record.budgetOverride === undefined || typeof record.budgetOverride === 'boolean'))) return false;
  return s.rewardHistory.every(h => h && text(h.id) && validMonth(h.month) && cash(h.amount) && text(h.date));
}

function isState(value: unknown): value is State {
  if (!validCommon(value) || value.version !== 2) return false; const s = value;
  try {
    if (s.recurringPlan !== null) validatePlan(s.recurringPlan);
    if ((s.recurringPlan === null) !== (s.planStartMonth === null) || (s.planStartMonth !== null && !validMonth(s.planStartMonth))) return false;
    for (const record of Object.values(s.months)) { if (record.plan !== undefined) validatePlan(record.plan); if (record.savingsApplied !== undefined && typeof record.savingsApplied !== 'boolean') return false; }
    if (!Array.isArray(s.savingsTransactions)) return false;
    const ids = new Set<string>(); const monthly = new Set<string>();
    for (const entry of s.savingsTransactions) {
      if (!entry || typeof entry.id !== 'string' || ids.has(entry.id) || !['opening', 'monthly', 'deposit', 'withdrawal'].includes(entry.kind) || !Number.isSafeInteger(entry.amount) || entry.amount <= 0 || typeof entry.note !== 'string' || !validDate(entry.date)) return false;
      ids.add(entry.id);
      if (entry.goalId !== undefined && !s.goals.some(goal => goal.id === entry.goalId && goal.kind === 'savings')) return false;
      if (entry.kind === 'monthly') { if (!entry.month || !validMonth(entry.month) || monthly.has(entry.month) || entry.date.slice(0, 7) !== entry.month) return false; monthly.add(entry.month); }
    }
    assertSavings(s); return true;
  } catch { return false; }
}

function migrate(state: LegacyState): State {
  const opening = state.goals.filter(goal => goal.kind === 'savings').reduce((sum, goal) => totalMoney(sum + goal.saved), 0);
  return { ...state, version: 2, recurringPlan: null, planStartMonth: null, savingsTransactions: opening > 0 ? [{ id: 'legacy-opening', kind: 'opening', amount: opening, date: today(), note: 'Savings brought forward from your existing goals' }] : [] };
}

export function readState(): State {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (isState(parsed)) { const due = applyDueMonths(parsed); if (due !== parsed) { try { writeState(due); } catch { return parsed; } } return due; }
      if (validCommon(parsed) && parsed.version === 1) {
        const migrated = migrate(parsed);
        try { const backupKey = `${STORAGE_KEY}-v1-backup`; if (!globalThis.localStorage.getItem(backupKey)) globalThis.localStorage.setItem(backupKey, stored); writeState(migrated); }
        catch { /* Keep existing records available in memory when storage is full. */ }
        return migrated;
      }
    } else {
      const fresh = initialState();
      try { writeState(fresh); } catch { /* The app can still open when browser storage is unavailable. */ }
      return fresh;
    }
  } catch { /* Unavailable storage or invalid data must not prevent the app opening. */ }
  return initialState();
}

export function writeState(state: State): void {
  if (!isState(state)) throw new Error('Your changes could not be saved because the data is invalid.');
  if (!globalThis.localStorage) throw new Error('Browser storage is unavailable. Your changes cannot be saved on this device.');
  const storage = globalThis.localStorage; const previous = storage.getItem(STORAGE_KEY);
  if (previous !== null) {
    let valid = false;
    try { const parsed: unknown = JSON.parse(previous); valid = isState(parsed) || (validCommon(parsed) && parsed.version === 1); } catch { /* Preserve malformed data before replacing it. */ }
    if (!valid) {
      const recovery = storage.getItem(RECOVERY_KEY);
      if (recovery !== previous) { const key = recovery === null ? RECOVERY_KEY : `${RECOVERY_KEY}-${uid()}`; try { storage.setItem(key, previous); } catch { throw new Error('Your existing data needs recovery, but a backup could not be saved. Export or free browser storage before making changes.'); } }
    }
  }
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}
