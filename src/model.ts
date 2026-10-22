export type Category = {
  id: string;
  name: string;
  color: string;
  icon: string;
  budget: number;
};
export type Expense = {
  id: string;
  title: string;
  categoryId: string;
  amount: number;
  date: string;
  note: string;
};
export type Goal = {
  id: string;
  name: string;
  target: number;
  saved: number;
  emoji: string;
  kind: 'savings' | 'reward';
};
export type MonthRecord = {
  budgets: Record<string, number>;
  closed: boolean;
  rewardTransfer: number;
  closedAt?: string;
};
export type State = {
  version: 1;
  currency: string;
  categories: Category[];
  expenses: Expense[];
  goals: Goal[];
  months: Record<string, MonthRecord>;
  rewardPool: number;
  rewardHistory: { id: string; month: string; amount: number; date: string }[];
};

export const STORAGE_KEY = 'pocket-state-v1';
export const RECOVERY_KEY = `${STORAGE_KEY}-recovery`;
const currencies = ['INR', 'USD', 'AED', 'EUR', 'GBP'];
const money = (amount: number, allowZero = false) => {
  if (!Number.isSafeInteger(amount) || amount < (allowZero ? 0 : 1)) {
    throw new Error(allowZero ? 'Enter a valid non-negative amount.' : 'Enter an amount greater than zero.');
  }
};
const totalMoney = (amount: number) => {
  if (!Number.isSafeInteger(amount)) throw new Error('The total amount is too large.');
  return amount;
};
const uid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const pad = (value: number) => String(value).padStart(2, '0');
export const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
};
const validMonth = (month: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && +month.slice(0, 4) >= 1000;
const validateMonth = (month: string) => {
  if (!validMonth(month)) throw new Error('Choose a valid month.');
};
const validDate = (date: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !validMonth(date.slice(0, 7))) return false;
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
};
const editable = (state: State, month: string) => {
  validateMonth(month);
  if (state.months[month]?.closed) throw new Error('This month is closed. Its budget and expenses are locked.');
};
const budgetsFor = (state: State, month: string) => Object.fromEntries(
  state.categories.map(category => [category.id, state.months[month] ? state.months[month].budgets[category.id] ?? 0 : category.budget]),
);

export function initialState(): State {
  const month = currentMonth();
  const day = new Date().getDate();
  const categories: Category[] = [
    { id: 'food', name: 'Food & coffee', color: '#a191ef', icon: 'coffee', budget: 200000 },
    { id: 'groceries', name: 'Groceries', color: '#98b798', icon: 'shopping-basket', budget: 220000 },
    { id: 'transport', name: 'Transport', color: '#e7b981', icon: 'train-front', budget: 100000 },
    { id: 'shopping', name: 'Shopping', color: '#e89baf', icon: 'shopping-bag', budget: 150000 },
    { id: 'wellness', name: 'Wellness', color: '#8abcc8', icon: 'heart', budget: 80000 },
    { id: 'subscriptions', name: 'Subscriptions', color: '#b4a99c', icon: 'repeat', budget: 50000 },
  ];
  const entries: [string, string, number, number][] = [
    ['Weekly grocery run', 'groceries', 120000, 3],
    ['Dinner with friends', 'food', 70000, 5],
    ['Metro card top-up', 'transport', 35000, 6],
    ['A little wardrobe refresh', 'shopping', 92000, 8],
    ['Lunch at The Green Table', 'food', 35000, 10],
    ['Fresh market finds', 'groceries', 65000, 12],
    ['Sunday yoga session', 'wellness', 42000, 14],
    ['Spotify Premium', 'subscriptions', 34900, 15],
    ['Ride home', 'transport', 30000, 17],
    ['Coffee & a good book', 'food', 22000, 19],
    ['Morning coffee', 'food', 18000, 21],
  ];
  return {
    version: 1,
    currency: 'INR',
    categories,
    expenses: entries.map(([title, categoryId, amount, entryDay], index) => ({
      id: `demo-expense-${index}`, title, categoryId, amount,
      date: `${month}-${pad(Math.min(day, entryDay))}`, note: '',
    })),
    goals: [
      { id: 'emergency', name: 'Emergency fund', target: 5000000, saved: 2850000, emoji: '☂️', kind: 'savings' },
      { id: 'getaway', name: 'A little getaway', target: 3000000, saved: 1200000, emoji: '🏝️', kind: 'savings' },
      { id: 'headphones', name: 'Headphones upgrade', target: 800000, saved: 350000, emoji: '🎧', kind: 'reward' },
    ],
    months: { [month]: { budgets: Object.fromEntries(categories.map(category => [category.id, category.budget])), closed: false, rewardTransfer: 0 } },
    rewardPool: 125000,
    rewardHistory: [],
  };
}

export function emptyState(): State {
  const demo = initialState();
  const categories = demo.categories.map(category => ({ ...category, budget: 0 }));
  return {
    ...demo, categories, expenses: [], goals: [], rewardPool: 0, rewardHistory: [],
    months: { [currentMonth()]: { budgets: Object.fromEntries(categories.map(category => [category.id, 0])), closed: false, rewardTransfer: 0 } },
  };
}

export function monthSummary(state: State, month: string) {
  validateMonth(month);
  const budgets = budgetsFor(state, month);
  const categorySpent: Record<string, number> = Object.fromEntries(state.categories.map(category => [category.id, 0]));
  for (const expense of state.expenses) {
    if (expense.date.slice(0, 7) === month) categorySpent[expense.categoryId] = totalMoney((categorySpent[expense.categoryId] ?? 0) + expense.amount);
  }
  const budget = totalMoney(Object.values(budgets).reduce((sum, amount) => sum + amount, 0));
  const spent = totalMoney(Object.values(categorySpent).reduce((sum, amount) => sum + amount, 0));
  const remaining = budget - spent;
  const closed = state.months[month]?.closed ?? false;
  return { budget, spent, remaining, availableReward: closed ? 0 : Math.max(0, remaining), closed, transfer: state.months[month]?.rewardTransfer ?? 0, categorySpent };
}

export function setBudgets(state: State, month: string, budgets: Record<string, number>): State {
  editable(state, month);
  const categories = new Set(state.categories.map(category => category.id));
  for (const [category, amount] of Object.entries(budgets)) {
    if (!categories.has(category)) throw new Error('Choose a valid budget category.');
    money(amount, true);
  }
  const updated = { ...budgetsFor(state, month), ...budgets };
  totalMoney(Object.values(updated).reduce((sum, amount) => sum + amount, 0));
  return { ...state, months: { ...state.months, [month]: { budgets: updated, closed: false, rewardTransfer: 0 } } };
}

export function addExpense(state: State, expense: Omit<Expense, 'id'>): State {
  money(expense.amount);
  if (!validDate(expense.date)) throw new Error('Choose a valid expense date.');
  editable(state, expense.date.slice(0, 7));
  if (!expense.title.trim()) throw new Error('Give your expense a name.');
  if (!state.categories.some(category => category.id === expense.categoryId)) throw new Error('Choose a valid category.');
  const monthSpent = monthSummary(state, expense.date.slice(0, 7)).spent;
  totalMoney(monthSpent + expense.amount);
  return { ...state, expenses: [{ ...expense, id: uid(), title: expense.title.trim(), note: expense.note.trim() }, ...state.expenses] };
}

export function deleteExpense(state: State, id: string): State {
  const expense = state.expenses.find(item => item.id === id);
  if (!expense) throw new Error('This expense could not be found.');
  editable(state, expense.date.slice(0, 7));
  return { ...state, expenses: state.expenses.filter(item => item.id !== id) };
}

export function closeMonth(state: State, month: string): State {
  validateMonth(month);
  if (month > currentMonth()) throw new Error('A future month cannot be closed.');
  if (state.months[month]?.closed) return state;
  if (!state.months[month]) throw new Error('Save a budget for this month before closing it.');
  const summary = monthSummary(state, month);
  const amount = summary.availableReward;
  const date = new Date().toISOString();
  return {
    ...state,
    months: { ...state.months, [month]: { budgets: budgetsFor(state, month), closed: true, rewardTransfer: amount, closedAt: date } },
    rewardPool: totalMoney(state.rewardPool + amount),
    rewardHistory: [...state.rewardHistory, { id: uid(), month, amount, date }],
  };
}

export function addGoal(state: State, goal: Omit<Goal, 'id' | 'saved'>): State {
  money(goal.target);
  if (!goal.name.trim()) throw new Error('Give your goal a name.');
  if (goal.kind !== 'savings' && goal.kind !== 'reward') throw new Error('Choose a valid goal type.');
  return { ...state, goals: [...state.goals, { ...goal, name: goal.name.trim(), emoji: goal.emoji.trim() || '✨', id: uid(), saved: 0 }] };
}

export function contributeToGoal(state: State, id: string, amount: number): State {
  money(amount);
  const goal = state.goals.find(item => item.id === id);
  if (!goal) throw new Error('This goal could not be found.');
  if (amount > goal.target - goal.saved) throw new Error('This amount is more than your goal needs.');
  if (goal.kind === 'reward' && amount > state.rewardPool) throw new Error('There is not enough in your rewards pool. Close a month to add your unspent budget.');
  return {
    ...state,
    goals: state.goals.map(item => item.id === id ? { ...item, saved: totalMoney(item.saved + amount) } : item),
    rewardPool: goal.kind === 'reward' ? state.rewardPool - amount : state.rewardPool,
  };
}

function isState(value: unknown): value is State {
  if (!value || typeof value !== 'object') return false;
  const s = value as State;
  const text = (v: unknown): v is string => typeof v === 'string';
  const cash = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
  if (s.version !== 1 || !currencies.includes(s.currency) || !cash(s.rewardPool) || !Array.isArray(s.categories) || !s.categories.length || !Array.isArray(s.expenses) || !Array.isArray(s.goals) || !Array.isArray(s.rewardHistory) || !s.months || typeof s.months !== 'object' || Array.isArray(s.months)) return false;
  if (!s.categories.every(c => c && text(c.id) && text(c.name) && text(c.color) && text(c.icon) && cash(c.budget))) return false;
  const categoryIds = new Set(s.categories.map(c => c.id));
  if (categoryIds.size !== s.categories.length || !s.expenses.every(e => e && text(e.id) && text(e.title) && text(e.note) && categoryIds.has(e.categoryId) && cash(e.amount) && e.amount > 0 && text(e.date) && validDate(e.date))) return false;
  if (!s.goals.every(g => g && text(g.id) && text(g.name) && text(g.emoji) && cash(g.target) && g.target > 0 && cash(g.saved) && g.saved <= g.target && (g.kind === 'savings' || g.kind === 'reward'))) return false;
  if (!Object.entries(s.months).every(([month, record]) => validMonth(month) && record && typeof record.closed === 'boolean' && cash(record.rewardTransfer) && record.budgets && typeof record.budgets === 'object' && !Array.isArray(record.budgets) && Object.entries(record.budgets).every(([id, amount]) => categoryIds.has(id) && cash(amount)) && (record.closedAt === undefined || text(record.closedAt)))) return false;
  return s.rewardHistory.every(h => h && text(h.id) && text(h.month) && validMonth(h.month) && cash(h.amount) && text(h.date));
}

export function readState(): State {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (isState(parsed)) return parsed;
    }
  } catch { /* Unavailable storage or invalid data must not prevent the app opening. */ }
  return initialState();
}

export function writeState(state: State): void {
  if (!isState(state)) throw new Error('Your changes could not be saved because the data is invalid.');
  if (!globalThis.localStorage) throw new Error('Browser storage is unavailable. Your changes cannot be saved on this device.');
  const storage = globalThis.localStorage;
  const previous = storage.getItem(STORAGE_KEY);
  if (previous !== null) {
    let valid = false;
    try { valid = isState(JSON.parse(previous)); } catch { /* Preserve malformed data before replacing it. */ }
    if (!valid) {
      const recovery = storage.getItem(RECOVERY_KEY);
      if (recovery !== previous) {
        const key = recovery === null ? RECOVERY_KEY : `${RECOVERY_KEY}-${uid()}`;
        try { storage.setItem(key, previous); }
        catch { throw new Error('Your existing data needs recovery, but a backup could not be saved. Export or free browser storage before making changes.'); }
      }
    }
  }
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}
