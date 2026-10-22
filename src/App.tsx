import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowDownLeft, ArrowRight, ArrowUpRight,
  Check, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Coffee, Download,
  Gift, Heart, LayoutDashboard, Leaf, LockKeyhole, Pencil, Plus,
  Search, Settings2, ShoppingBag, ShoppingBasket, Sparkles, Tag,
  Trash2, TrendingUp, Wallet, X, Zap, Car, PiggyBank, CalendarDays, CheckCircle2,
} from 'lucide-react';
import {
  addExpense, addGoal, closeMonth, contributeToGoal, currentMonth, deleteExpense,
  emptyState, monthSummary, readState, setBudgets, writeState,
  STORAGE_KEY, type Category, type Expense, type Goal, type State,
} from './model';

type Page = 'overview' | 'transactions' | 'budgets' | 'savings' | 'rewards';
type ModalState = { type: 'expense'; expense?: Expense } | { type: 'budgets' } |
  { type: 'goal'; kind: Goal['kind'] } | { type: 'contribute'; goal: Goal } |
  { type: 'close' } | { type: 'category' } | { type: 'settings' } | { type: 'help' } | null;
const navigation: { page: Page; label: string; icon: typeof Wallet }[] = [
  { page: 'overview', label: 'Overview', icon: LayoutDashboard },
  { page: 'transactions', label: 'Transactions', icon: ArrowDownLeft },
  { page: 'budgets', label: 'Monthly budgets', icon: Wallet },
  { page: 'savings', label: 'Savings & goals', icon: PiggyBank },
  { page: 'rewards', label: 'Rewards', icon: Gift },
];
const categoryIcons: Record<string, typeof Wallet> = {
  coffee: Coffee, food: Coffee, groceries: ShoppingBasket, basket: ShoppingBasket,
  transport: Car, car: Car, shopping: ShoppingBag, bag: ShoppingBag,
  wellness: Heart, heart: Heart, subscriptions: Zap, zap: Zap, tag: Tag,
};
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const monthName = (month: string, short = false) => new Date(`${month}-01T12:00:00`).toLocaleDateString('en', { month: short ? 'short' : 'long', year: 'numeric' });
const dateName = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('en', { month: 'short', day: 'numeric' });
const percent = (value: number, total: number) => total > 0 ? Math.round(value / total * 100) : 0;
const toMinor = (value: FormDataEntryValue | null, allowZero = false) => {
  const number = Number(value);
  if (value === null || String(value).trim() === '' || !Number.isFinite(number) || number < (allowZero ? 0 : 0.01) || number > 1e10 || Math.abs(number * 100 - Math.round(number * 100)) > 0.0001) {
    throw new Error(allowZero ? 'Enter a valid amount of zero or more, with up to 2 decimal places.' : 'Enter a positive amount with up to 2 decimal places.');
  }
  return Math.round(number * 100);
};
const goalEmoji = ['🌴', '🛟', '🏡', '🎧', '✈️', '💻', '✨', '🚗'];

function CategoryIcon({ category, size = 19 }: { category?: Category; size?: number }) {
  const Icon = categoryIcons[category?.icon || 'tag'] || categoryIcons[category?.id || 'tag'] || Tag;
  return <span className="budget-icon" style={{ color: category?.color || '#7460d9', backgroundColor: `${category?.color || '#7460d9'}15` }}><Icon size={size} strokeWidth={1.8} /></span>;
}

function Progress({ value, total, color = '#8772dc' }: { value: number; total: number; color?: string }) {
  return <div className="progress-track" role="progressbar" aria-label="Progress" aria-valuenow={percent(value, total)} aria-valuemin={0} aria-valuemax={Math.max(100, percent(value, total))}><div className="progress-fill" style={{ width: `${Math.min(100, percent(value, total))}%`, background: value > total ? '#df7b72' : color }} /></div>;
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () => Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea, [tabindex="0"]') || []);
    const first = ref.current?.querySelector<HTMLElement>('input, select, textarea') || focusable()[0];
    first?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const list = focusable();
        if (event.shiftKey && document.activeElement === list[0]) { event.preventDefault(); list.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === list.at(-1)) { event.preventDefault(); list[0]?.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = priorOverflow; document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div ref={ref} className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-header"><h2 id="modal-title">{title}</h2><button className="icon-button modal-close" onClick={onClose} aria-label="Close dialog"><X size={20} /></button></div><div className="modal-body">{children}</div></div></div>;
}

function RewardIllustration() {
  return <svg className="reward-illustration" width="150" height="120" viewBox="0 0 150 120" fill="none" aria-hidden="true">
    <ellipse cx="77" cy="106" rx="48" ry="7" fill="#DDD4F1" />
    <path d="M35 54 78 44 117 58 75 70Z" fill="#CDC0F1" />
    <path d="m35 54 40 15v35L35 88Z" fill="#9C83DD" />
    <path d="m75 69 42-11v33l-42 13Z" fill="#B3A0E8" />
    <path d="m31 48 44 15 46-12-42-15Z" fill="#D8C9F7" />
    <path d="M31 48v12l44 16V63Z" fill="#A78CDF" /><path d="m75 63 46-12v12L75 76Z" fill="#BFABEF" />
    <path d="m58 41 42 16v38l-13 4V61L45 46Z" fill="#F8E9BE" />
    <path d="m89 40-43 13v12l12 4V55l44-13Z" fill="#FFF1CF" />
    <path d="M78 41C62 21 43 21 48 33c4 9 30 8 30 8ZM78 41c3-25 24-32 25-17 1 12-25 17-25 17Z" stroke="#E1B973" strokeWidth="5" strokeLinecap="round" />
    <path d="m22 29 2-5 2 5 5 2-5 2-2 5-2-5-5-2 5-2ZM122 30l2-5 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill="#B39ADE" />
    <circle cx="132" cy="73" r="3" fill="#E1B973" /><circle cx="35" cy="14" r="2" fill="#E1B973" />
  </svg>;
}

export default function App() {
  const [state, setState] = useState<State>(readState);
  const [page, setPage] = useState<Page>('overview');
  const [month, setMonth] = useState(currentMonth);
  const [modal, setModal] = useState<ModalState>(null);
  const [formError, setFormError] = useState('');
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [demo, setDemo] = useState(() => { try { return !localStorage.getItem('pocket-demo-dismissed'); } catch { return true; } });
  const [confirmClear, setConfirmClear] = useState(false);
  const money = (amount: number) => new Intl.NumberFormat('en', { style: 'currency', currency: state.currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount / 100);
  const summary = monthSummary(state, month);
  const monthlyExpenses = state.expenses.filter(e => e.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const savingsGoals = state.goals.filter(g => g.kind === 'savings');
  const rewardGoals = state.goals.filter(g => g.kind === 'reward');
  const totalSaved = savingsGoals.reduce((sum, goal) => sum + goal.saved, 0);
  const activePage = navigation.find(item => item.page === page)!;
  const closeDialog = useCallback(() => { setModal(null); setFormError(''); setConfirmClear(false); }, []);
  const categoryBudget = (category: Category) => state.months[month] ? state.months[month].budgets[category.id] ?? 0 : category.budget;
  const openModal = (next: ModalState) => { setFormError(''); setModal(next); };

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) { setState(readState()); setModal(null); setToast('Your Pocket was updated in another tab.'); }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => { if (!toast) return; const timeout = window.setTimeout(() => setToast(''), 4500); return () => clearTimeout(timeout); }, [toast]);

  function commit(update: (previous: State) => State, message: string) {
    try {
      const next = update(state);
      writeState(next);
      setState(next);
      setToast(message);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save. Please try again.';
      setFormError(message); setToast(message);
      return false;
    }
  }

  function submit(event: FormEvent<HTMLFormElement>, handler: (data: FormData) => void) {
    event.preventDefault(); setFormError('');
    try { handler(new FormData(event.currentTarget)); }
    catch (error) { setFormError(error instanceof Error ? error.message : 'Please check the details.'); }
  }

  function navigate(next: Page) { setPage(next); setSearch(''); setCategoryFilter('all'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function shiftMonth(direction: number) {
    const date = new Date(`${month}-01T12:00:00`); date.setMonth(date.getMonth() + direction);
    setMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  }

  const budgetList = <div>{state.categories.map(category => {
    const spent = summary.categorySpent[category.id] || 0;
    const budget = categoryBudget(category);
    return <div className="budget-row" key={category.id}><CategoryIcon category={category} /><div className="budget-meta"><div className="budget-line"><span>{category.name}</span><span className="budget-numbers"><strong>{money(spent)}</strong><span className="muted"> / {money(budget)}</span></span></div><Progress value={spent} total={budget} color={category.color} /></div></div>;
  })}</div>;

  const transactionRows = (expenses: Expense[], table = false) => expenses.map(expense => {
    const category = state.categories.find(c => c.id === expense.categoryId);
    if (table) return <tr key={expense.id}><td><div className="transaction-cell"><CategoryIcon category={category} /><div><div className="transaction-title">{expense.title}</div>{expense.note && <div className="transaction-subtitle">{expense.note}</div>}</div></div></td><td><span className="category-pill" style={{ color: category?.color, background: `${category?.color}12` }}>{category?.name}</span></td><td className="muted">{dateName(expense.date)}</td><td className="transaction-amount">−{money(expense.amount)}</td><td><div className="row-actions"><button className="icon-button" disabled={state.months[expense.date.slice(0, 7)]?.closed} aria-label={`Edit ${expense.title}`} onClick={() => openModal({ type: 'expense', expense })}><Pencil size={15} /></button><button className="icon-button" disabled={state.months[expense.date.slice(0, 7)]?.closed} aria-label={`Delete ${expense.title}`} onClick={() => commit(s => deleteExpense(s, expense.id), 'Expense deleted')}><Trash2 size={15} /></button></div></td></tr>;
    return <div className="transaction-row" key={expense.id}><CategoryIcon category={category} /><div className="transaction-info"><div className="transaction-title">{expense.title}</div><div className="transaction-subtitle">{category?.name}<span className="separator-dot">·</span>{dateName(expense.date)}</div></div><div className="transaction-amount">−{money(expense.amount)}</div></div>;
  });

  function GoalCard({ goal }: { goal: Goal }) {
    const complete = goal.saved >= goal.target;
    return <div className="card goal-card"><div className="goal-card-top"><span className="goal-emoji">{goal.emoji}</span><span className={`badge ${complete ? 'success' : 'purple'}`}>{complete ? 'Goal reached!' : `${percent(goal.saved, goal.target)}% there`}</span></div><h3>{goal.name}</h3><div className="goal-card-amount">{money(goal.saved)} <span>of {money(goal.target)}</span></div><Progress value={goal.saved} total={goal.target} color={goal.kind === 'reward' ? '#d9a467' : '#8c79d4'} /><div className="goal-card-footer"><span className="muted">{complete ? 'You made it. Enjoy this moment.' : `${money(goal.target - goal.saved)} to go`}</span><button className="button secondary small" disabled={complete || (goal.kind === 'reward' && state.rewardPool <= 0)} onClick={() => openModal({ type: 'contribute', goal })}><Plus size={14} />{goal.kind === 'reward' ? 'Allocate' : 'Add money'}</button></div></div>;
  }

  function SpendingChart() {
    const items = state.categories.map(c => ({ ...c, spent: summary.categorySpent[c.id] || 0 })).filter(c => c.spent > 0);
    let offset = 0;
    return <><div className="donut-container"><svg width="210" height="210" viewBox="0 0 210 210" aria-label={`Total spending ${money(summary.spent)}`} role="img"><circle cx="105" cy="105" r="78" fill="none" stroke="#f0edf5" strokeWidth="24" />{items.map(item => { const length = item.spent / summary.spent * 490.09; const start = offset; offset += length; return <circle key={item.id} cx="105" cy="105" r="78" fill="none" stroke={item.color} strokeWidth="24" strokeDasharray={`${Math.max(0, length - 4)} ${490.09 - Math.max(0, length - 4)}`} strokeDashoffset={-start} transform="rotate(-90 105 105)" />; })}<text x="105" y="99" textAnchor="middle" fill="#8d8b98" fontSize="11">TOTAL SPENT</text><text x="105" y="125" textAnchor="middle" fill="#302d40" fontSize="24" fontWeight="650">{money(summary.spent)}</text></svg></div><div className="chart-legend">{items.length ? items.map(item => <div className="legend-row" key={item.id}><span className="legend-dot" style={{ background: item.color }} /><span>{item.name}</span><strong>{percent(item.spent, summary.spent)}%</strong></div>) : <p className="muted">Your spending breakdown will appear here.</p>}</div></>;
  }

  function exportCsv() {
    const safe = (value: string) => `"${(/^[=+@\-]/.test(value) ? "'" : '') + value.replaceAll('"', '""')}"`;
    const content = [['Date', 'Description', 'Category', 'Amount', 'Currency', 'Note'], ...monthlyExpenses.map(e => [e.date, e.title, state.categories.find(c => c.id === e.categoryId)?.name || '', (e.amount / 100).toFixed(2), state.currency, e.note])].map(row => row.map(safe).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `pocket-expenses-${month}.csv`; link.click(); URL.revokeObjectURL(url); setToast('Monthly expenses exported');
  }

  const pageTitles: Record<Page, [string, string]> = {
    overview: ['A little clarity. A lot more possibility.', 'Your money, in a good place. Let’s keep it that way.'],
    transactions: ['Every little spend, accounted for.', 'The small things add up. Give them a little attention.'],
    budgets: ['Give your money a little direction.', 'Set your monthly limits and make space for what matters.'],
    savings: ['Small steps. Meaningful milestones.', 'Your savings live here, separate from your spending budget.'],
    rewards: ['Good habits deserve good things.', 'Turn what you don’t spend into something to look forward to.'],
  };

  return <div className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => navigate('overview')} aria-label="Pocket home"><span className="brand-mark"><Wallet size={23} strokeWidth={1.8} /></span>pocket<span className="brand-period">.</span></button>
      <div className="sidebar-mobile-tools"><button className="icon-button" aria-label="Settings" onClick={() => openModal({ type: 'settings' })}><Settings2 size={20} /></button><button className="icon-button" aria-label="How Pocket works" onClick={() => openModal({ type: 'help' })}><CircleHelp size={20} /></button></div>
      <div className="nav-group-label">YOUR WORKSPACE</div>
      <nav aria-label="Main navigation">{navigation.map(({ page: item, label, icon: Icon }) => <button key={item} className={`nav-item ${page === item ? 'active' : ''}`} onClick={() => navigate(item)} aria-current={page === item ? 'page' : undefined}><Icon className="nav-icon" size={20} strokeWidth={1.7} /><span>{label}</span>{item === 'rewards' && <span className="nav-sparkle" aria-hidden="true">✦</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-note"><span className="note-sparkles">✦ <span>✧</span></span><h4>A little progress,<br />every day.</h4><p>Good money habits start<br />with showing up.</p><div className="note-plant"><Leaf size={30} strokeWidth={1.3} /></div></div><button className="nav-item" onClick={() => openModal({ type: 'help' })}><CircleHelp size={19} strokeWidth={1.7} /><span>How Pocket works</span><ArrowUpRight size={15} /></button><button className="nav-item" onClick={() => openModal({ type: 'settings' })}><Settings2 size={19} strokeWidth={1.7} /><span>Settings</span></button><div className="user-profile"><div className="avatar">Y</div><div><strong>Your space</strong><span>Making good things happen</span></div><span className="online-dot" /></div></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="breadcrumb">My workspace <ChevronRight size={14} /><strong>{activePage.label}</strong></div><div className="topbar-actions"><span className="local-status"><span className="online-dot" /> Saved on this device</span><button className="icon-button" aria-label="Help and information" onClick={() => openModal({ type: 'help' })}><CircleHelp size={19} /></button><div className="avatar small-avatar">Y</div></div></header>
      <main className="content">
        <div className="page-heading"><div><div className="eyebrow"><span className="tiny-sparkle">✦</span> A LITTLE MORE INTENTIONAL</div><h1 className="page-title">{pageTitles[page][0]}</h1><p className="page-subtitle">{pageTitles[page][1]}</p></div><div className="heading-actions"><div className="month-control"><button className="icon-button" aria-label="Previous month" onClick={() => shiftMonth(-1)}><ChevronLeft size={16} /></button><label className="month-picker"><CalendarDays size={16} /><span>{monthName(month, true)}</span><input type="month" aria-label="Selected month" value={month} onChange={e => { if (/^\d{4}-\d{2}$/.test(e.target.value)) setMonth(e.target.value); }} /><ChevronDown size={13} /></label><button className="icon-button" aria-label="Next month" onClick={() => shiftMonth(1)}><ChevronRight size={16} /></button></div><button className="button primary" disabled={summary.closed} onClick={() => openModal({ type: 'expense' })}><Plus size={17} /> Add expense</button></div></div>
        {demo && <div className="demo-tag"><Sparkles size={14} /><span>You’re exploring with sample data. Make yourself at home.</span><button onClick={() => openModal({ type: 'settings' })}>Start fresh <ArrowRight size={13} /></button><button className="icon-button" aria-label="Dismiss sample data notice" onClick={() => { setDemo(false); try { localStorage.setItem('pocket-demo-dismissed', '1'); } catch { /* notice can still be dismissed */ } }}><X size={14} /></button></div>}
        {summary.closed && <div className="closed-banner"><LockKeyhole size={16} /><span>{monthName(month)} is closed. {money(summary.transfer)} was moved to your rewards pool.</span><CheckCircle2 size={16} /></div>}

        {page === 'overview' && <>
          <section className="stats-grid" aria-label="Your money at a glance">
            <div className="stat-card balance-card"><div className="stat-label">{summary.closed ? 'UNSPENT AT CLOSE' : 'LEFT TO SPEND'} <Wallet size={17} /></div><div className="stat-value">{money(summary.remaining)}</div><div className="stat-foot">{summary.closed ? 'Moved to your rewards pool' : `of your ${money(summary.budget)} monthly budget`} <ArrowUpRight size={14} /></div><div className="balance-bar"><span style={{ width: `${Math.max(0, Math.min(100, percent(summary.remaining, summary.budget)))}%` }} /></div><span className="hero-decoration" /></div>
            <div className="stat-card"><div className="stat-label">SPENT THIS MONTH <span className="stat-icon peach"><ShoppingBag size={17} /></span></div><div className="stat-value">{money(summary.spent)}</div><div className="stat-foot"><span className={`badge ${summary.spent > summary.budget ? 'warning' : 'success'}`}>{percent(summary.spent, summary.budget)}% of budget</span><span>so far, so mindful</span></div></div>
            <div className="stat-card"><div className="stat-label">TOTAL SAVINGS <span className="stat-icon mint"><PiggyBank size={18} /></span></div><div className="stat-value">{money(totalSaved)}</div><div className="stat-foot"><span className="positive-inline"><TrendingUp size={14} /> {savingsGoals.length} {savingsGoals.length === 1 ? 'goal' : 'goals'}</span><span>growing at your pace</span></div></div>
            <div className="stat-card"><div className="stat-label">REWARDS POOL <span className="stat-icon lilac"><Gift size={18} /></span></div><div className="stat-value">{money(state.rewardPool)}</div><div className="stat-foot"><span className="reward-inline">A little well earned</span><Sparkles size={14} /></div></div>
          </section>
          <div className="dashboard-grid"><div className="main-column">
            <section className="card"><div className="card-header"><div><h2 className="card-title">Your monthly budgets</h2><p className="muted card-description">A plan for the everyday, and a little breathing room.</p></div><button className="text-button" disabled={summary.closed} onClick={() => openModal({ type: 'budgets' })}><Pencil size={13} /> Edit budgets</button></div>{budgetList}<div className="card-footer"><span className="budget-footer-note"><span className="online-dot" /> {summary.remaining >= 0 ? 'You’re keeping things in balance.' : 'A little over budget. There’s always room to adjust.'}</span><button className="text-button" onClick={() => navigate('budgets')}>View details <ArrowRight size={14} /></button></div></section>
            <section className="card"><div className="card-header"><div><h2 className="card-title">Recent transactions</h2><p className="muted card-description">The little things that make up your month.</p></div><button className="text-button" onClick={() => navigate('transactions')}>View all <ArrowRight size={14} /></button></div>{monthlyExpenses.length ? <div>{transactionRows(monthlyExpenses.slice(0, 4))}</div> : <Empty icon={<ShoppingBag />} text="A fresh month, a clean slate." detail="Add your first expense to start seeing the full picture." action={<button className="button secondary small" disabled={summary.closed} onClick={() => openModal({ type: 'expense' })}><Plus size={14} /> Add an expense</button>} />}</section>
            <div className="overview-banner"><span className="banner-icon"><Leaf size={24} strokeWidth={1.4} /></span><div><strong>It’s the small habits that make the big difference.</strong><p>You don’t have to be perfect. Just a little more intentional.</p></div><span className="banner-star">✧</span></div>
          </div><div className="aside-column">
            <section className="card spending-card"><div className="card-header"><h2 className="card-title">Where it went</h2><span className="muted chart-period">{monthName(month, true)}</span></div><SpendingChart /></section>
            <section className="card reward-card"><div className="reward-card-top"><span className="badge purple"><Sparkles size={11} /> THE GOOD PART</span><Gift size={17} /></div><div className="reward-card-content"><div><h2>A little left.<br />A little treat.</h2><p>Your unspent budget becomes<br />your next little joy.</p></div><RewardIllustration /></div><div className="reward-bottom"><div><span className="reward-pool-label">YOUR REWARDS POOL</span><div className="reward-amount">{money(state.rewardPool)}</div></div><button className="reward-arrow" aria-label="Explore rewards" onClick={() => navigate('rewards')}><ArrowUpRight size={21} /></button></div></section>
            <section className="card"><div className="card-header"><h2 className="card-title">Dreams in progress</h2><button className="text-button" onClick={() => navigate('savings')} aria-label="View savings goals"><ArrowRight size={17} /></button></div>{savingsGoals.length ? savingsGoals.slice(0, 2).map(goal => <div className="goal-row" key={goal.id}><span className="goal-emoji">{goal.emoji}</span><div className="goal-info"><div className="goal-values"><strong>{goal.name}</strong><span>{percent(goal.saved, goal.target)}%</span></div><Progress value={goal.saved} total={goal.target} /><p>{money(goal.saved)} <span className="muted">of {money(goal.target)}</span></p></div></div>) : <p className="muted">Your next chapter starts with a little goal.</p>}</section>
          </div></div>
        </>}

        {page === 'transactions' && <section className="card transactions-card"><div className="card-header"><div><h2 className="card-title">Your transactions <span className="count-badge">{monthlyExpenses.length}</span></h2><p className="muted card-description">{money(summary.spent)} spent in {monthName(month)}</p></div><button className="button secondary small" onClick={exportCsv}><Download size={15} /> Export CSV</button></div><div className="toolbar"><div className="search-input"><Search size={17} /><input aria-label="Search transactions" placeholder="Search your transactions…" value={search} onChange={e => setSearch(e.target.value)} /></div><select className="filter-select" aria-label="Filter by category" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}><option value="all">All categories</option>{state.categories.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select></div><div className="table-wrap"><table className="expense-table"><thead><tr><th>TRANSACTION</th><th>CATEGORY</th><th>DATE</th><th>AMOUNT</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{transactionRows(monthlyExpenses.filter(e => (categoryFilter === 'all' || e.categoryId === categoryFilter) && `${e.title} ${e.note}`.toLowerCase().includes(search.toLowerCase())), true)}</tbody></table></div>{!monthlyExpenses.filter(e => (categoryFilter === 'all' || e.categoryId === categoryFilter) && `${e.title} ${e.note}`.toLowerCase().includes(search.toLowerCase())).length && <Empty icon={<Search />} text="Nothing here just yet." detail={search || categoryFilter !== 'all' ? 'Try a different search or category.' : 'Add an expense and we’ll take it from here.'} />}</section>}

        {page === 'budgets' && <><div className="budget-summary-strip"><div><span className="eyebrow">MONTHLY SPENDING PLAN</span><strong>{money(summary.budget)}</strong><span className="muted">Savings are separate. This is your spending allowance.</span></div><button className="button primary" disabled={summary.closed} onClick={() => openModal({ type: 'budgets' })}><Pencil size={16} /> Set monthly budgets</button></div><div className="page-grid budget-grid">{state.categories.map(category => {
          const budget = categoryBudget(category);
          const spent = summary.categorySpent[category.id] || 0;
          return <section className="card category-card" key={category.id}><div className="goal-card-top"><CategoryIcon category={category} size={22} /><span className={`badge ${spent > budget ? 'warning' : 'success'}`}>{budget === 0 ? (spent > 0 ? 'No budget set' : 'Ready to plan') : `${percent(spent, budget)}% used`}</span></div><h3>{category.name}</h3><div className="goal-card-amount">{money(spent)} <span>of {money(budget)}</span></div><Progress value={spent} total={budget} color={category.color} /><div className="category-card-bottom"><span className={budget >= spent ? 'muted' : 'over-budget'}>{money(Math.abs(budget - spent))} {budget >= spent ? 'left to spend' : 'over budget'}</span><span className="muted">{monthlyExpenses.filter(e => e.categoryId === category.id).length} transactions</span></div></section>;
        })}<button className="add-category-card" disabled={summary.closed} onClick={() => openModal({ type: 'category' })}><span><Plus size={24} /></span><strong>Make it your own</strong><span>Add a new category</span></button></div><section className="card close-month-card"><div className="close-month-info"><span className="close-icon"><Gift size={23} /></span><div><h3>{summary.closed ? 'This month is all wrapped up.' : 'A little left over? That’s your reward.'}</h3><p>{summary.closed ? `${money(summary.transfer)} was added to your rewards pool. This month’s expenses and budgets are locked.` : `Close the month to move ${money(summary.availableReward)} into your rewards pool. Your savings stay separate.`}</p></div></div><button className="button secondary" disabled={summary.closed || month > currentMonth() || !state.months[month]} onClick={() => openModal({ type: 'close' })}>{summary.closed ? <><Check size={16} /> Month closed</> : <>Close month <ArrowRight size={16} /></>}</button></section></>}

        {page === 'savings' && <><div className="savings-summary"><div className="savings-summary-text"><span className="eyebrow">A LITTLE SECURITY. A LITTLE POSSIBILITY.</span><h2>{money(totalSaved)} <span>set aside for your future.</span></h2><p>These savings are yours to protect. They’re never counted in your spending budget or rewards.</p></div><div className="savings-summary-icon"><PiggyBank size={66} strokeWidth={1.1} /><Sparkles size={23} /></div></div><div className="section-title-row"><h2>Your savings goals <span className="count-badge">{savingsGoals.length}</span></h2><button className="button primary" onClick={() => openModal({ type: 'goal', kind: 'savings' })}><Plus size={16} /> New savings goal</button></div><div className="page-grid">{savingsGoals.map(goal => <GoalCard key={goal.id} goal={goal} />)}{!savingsGoals.length && <Empty icon={<PiggyBank />} text="What are you saving for?" detail="A rainy day, a new home, a big adventure. Start with a goal." />}</div><div className="info-note"><LockKeyhole size={17} /><p>Record money you’ve already put aside. Pocket tracks your progress; it doesn’t move money between bank accounts.</p></div></>}

        {page === 'rewards' && <><div className="rewards-hero"><div><span className="eyebrow"><Sparkles size={14} /> A LITTLE WELL EARNED</span><h2>Your next little yes.</h2><p>You made room in your budget. Now make room for something you love.</p><div className="rewards-hero-total">{money(state.rewardPool)}<span>available in your rewards pool</span></div></div><RewardIllustration /></div><div className="reward-process"><div><span>01</span><div><strong>Plan your month</strong><p>Set a spending budget, aside from savings.</p></div></div><ArrowRight size={18} /><div><span>02</span><div><strong>Spend a little mindfully</strong><p>Keep track of the things you spend on.</p></div></div><ArrowRight size={18} /><div><span>03</span><div><strong>Enjoy what’s left</strong><p>Close your month. The rest is your reward.</p></div></div></div><div className="section-title-row"><h2>Your wishlist <span className="count-badge">{rewardGoals.length}</span></h2><button className="button primary" onClick={() => openModal({ type: 'goal', kind: 'reward' })}><Plus size={16} /> New reward goal</button></div><div className="page-grid">{rewardGoals.map(goal => <GoalCard key={goal.id} goal={goal} />)}{!rewardGoals.length && <Empty icon={<Gift />} text="Something to look forward to." detail="Add a little treat or a bigger dream to your wishlist." />}</div><div className="rewards-lower-grid"><section className="card"><div className="card-header"><div><h2 className="card-title">Wrap up {monthName(month, true)}</h2><p className="muted card-description">{state.months[month] ? 'A small ritual for a fresh start.' : 'Save your monthly budgets first to start this month.'}</p></div><CalendarDays size={20} className="muted" /></div><div className="close-month-preview"><div><span>Monthly budget</span><strong>{money(summary.budget)}</strong></div><div><span>Spent this month</span><strong>−{money(summary.spent)}</strong></div><div className="preview-total"><span>{summary.closed ? 'Moved to rewards' : 'Ready for your rewards'}</span><strong>{money(summary.closed ? summary.transfer : summary.availableReward)}</strong></div></div><button className="button primary full-width" disabled={summary.closed || month > currentMonth() || !state.months[month]} onClick={() => openModal({ type: 'close' })}>{summary.closed ? <><Check size={16} /> Month closed</> : <><Gift size={16} /> Close month & move the rest</>}</button></section><section className="card"><div className="card-header"><h2 className="card-title">Your good-habit history</h2><TrendingUp size={18} className="muted" /></div>{state.rewardHistory.length ? [...state.rewardHistory].reverse().map(item => <div className="history-row" key={item.id}><span className="history-icon"><Gift size={17} /></span><div><strong>{monthName(item.month)}</strong><span>Unspent budget → rewards</span></div><strong className="positive-inline">+{money(item.amount)}</strong></div>) : <Empty icon={<Leaf />} text="Your story starts here." detail="Close your first month to see your rewards grow." />}</section></div></>}

        <footer className="page-footer"><span className="footer-brand">pocket<span>·</span> a little more mindful.</span><span>Made for your everyday. <Leaf size={12} /></span></footer>
      </main>
    </div>

    {modal && <Modal title={modal.type === 'expense' ? modal.expense ? 'Edit expense' : 'A little spend to log' : modal.type === 'budgets' ? `Plan ${monthName(month)}` : modal.type === 'goal' ? modal.kind === 'reward' ? 'Something to look forward to' : 'A new little dream' : modal.type === 'contribute' ? modal.goal.kind === 'reward' ? 'Put your rewards toward it' : 'A step closer to your goal' : modal.type === 'close' ? `Wrap up ${monthName(month)}` : modal.type === 'category' ? 'Make room for a new category' : modal.type === 'settings' ? 'Your Pocket, your way' : 'A little guide to Pocket'} onClose={closeDialog}>
      {modal.type === 'expense' && <form onSubmit={event => submit(event, data => {
        const expense = { title: String(data.get('title')).trim(), amount: toMinor(data.get('amount')), categoryId: String(data.get('category')), date: String(data.get('date')), note: String(data.get('note')).trim() };
        if (!expense.title) throw new Error('Give your expense a short description.');
        if (commit(s => addExpense(modal.expense ? deleteExpense(s, modal.expense.id) : s, expense), modal.expense ? 'Expense updated. All in balance.' : 'Expense added. A little more clarity.')) closeDialog();
      })}><p className="form-intro">Coffee, groceries, a little treat. Every spend has a place.</p><label className="field">What was it for?<input className="input" name="title" placeholder="e.g. Coffee with a friend" maxLength={100} defaultValue={modal.expense?.title} required /></label><div className="form-grid"><label className="field">Amount ({state.currency})<input className="input" name="amount" type="number" step="0.01" min="0.01" max="10000000000" placeholder="0.00" defaultValue={modal.expense ? modal.expense.amount / 100 : undefined} required /></label><label className="field">Category<select className="input" name="category" defaultValue={modal.expense?.categoryId || state.categories[0]?.id} required>{state.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div><label className="field">Date<input className="input" name="date" type="date" defaultValue={modal.expense?.date || (month === currentMonth() ? today() : `${month}-01`)} required /></label><label className="field">A little note <span className="muted">(optional)</span><input className="input" name="note" maxLength={250} placeholder="Anything you’d like to remember" defaultValue={modal.expense?.note} /></label>{formError && <p className="form-error" role="alert">{formError}</p>}<div className="form-actions"><button type="button" className="button secondary" onClick={closeDialog}>Cancel</button><button type="submit" className="button primary"><Check size={16} /> {modal.expense ? 'Save changes' : 'Save expense'}</button></div></form>}
      {modal.type === 'budgets' && <form onSubmit={event => submit(event, data => { const budgets = Object.fromEntries(state.categories.map(c => [c.id, toMinor(data.get(c.id), true)])); if (commit(s => setBudgets(s, month, budgets), `Your ${monthName(month)} budgets are set`)) closeDialog(); })}><p className="form-intro">Your spending allowance, category by category. Savings stay separate.</p>{state.categories.map(category => <label className="budget-editor-row" key={category.id}><CategoryIcon category={category} /><span>{category.name}</span><span className="budget-currency">{state.currency}</span><input className="input" aria-label={`${category.name} budget`} type="number" name={category.id} min="0" step="0.01" max="10000000000" defaultValue={(categoryBudget(category)) / 100} required /></label>)}<p className="info-note compact"><Sparkles size={16} />Anything left at the end of the month can become a reward.</p>{formError && <p className="form-error" role="alert">{formError}</p>}<div className="form-actions"><button type="button" className="button secondary" onClick={closeDialog}>Cancel</button><button className="button primary" type="submit">Save budgets <Check size={16} /></button></div></form>}
      {modal.type === 'goal' && <form onSubmit={event => submit(event, data => { const name = String(data.get('name')).trim(); if (!name) throw new Error('Give your goal a name.'); if (commit(s => addGoal(s, { name, target: toMinor(data.get('target')), emoji: String(data.get('emoji')), kind: modal.kind }), 'A little dream, with a plan. Goal created.')) closeDialog(); })}><p className="form-intro">{modal.kind === 'reward' ? 'A treat, an upgrade, an adventure. What’s your next little yes?' : 'Start small. You can keep adding to it, one step at a time.'}</p><label className="field">Goal name<input className="input" name="name" maxLength={80} placeholder={modal.kind === 'reward' ? 'e.g. A new pair of headphones' : 'e.g. My rainy-day fund'} required /></label><div className="form-grid"><label className="field">Target amount ({state.currency})<input className="input" name="target" type="number" min="0.01" step="0.01" max="10000000000" placeholder="0.00" required /></label><label className="field">A little personality<select className="input emoji-select" name="emoji" defaultValue={modal.kind === 'reward' ? '🎧' : '🌴'}>{goalEmoji.map(emoji => <option key={emoji} value={emoji}>{emoji}</option>)}</select></label></div>{formError && <p className="form-error" role="alert">{formError}</p>}<div className="form-actions"><button type="button" className="button secondary" onClick={closeDialog}>Cancel</button><button className="button primary" type="submit"><Plus size={16} /> Create goal</button></div></form>}
      {modal.type === 'contribute' && <form onSubmit={event => submit(event, data => { if (commit(s => contributeToGoal(s, modal.goal.id, toMinor(data.get('amount'))), 'One step closer. Nicely done.')) closeDialog(); })}><div className="contribute-goal"><span>{modal.goal.emoji}</span><div><h3>{modal.goal.name}</h3><p className="muted">{money(modal.goal.saved)} of {money(modal.goal.target)}</p></div></div><p className="form-intro">{modal.goal.kind === 'reward' ? `${money(state.rewardPool)} is available in your rewards pool. Allocating it moves that amount from the pool to this goal.` : 'Record an amount you’ve already set aside. This won’t change your spending budget or rewards pool.'}</p><label className="field">Amount to add ({state.currency})<input className="input" name="amount" type="number" min="0.01" step="0.01" max={Math.min(modal.goal.target - modal.goal.saved, modal.goal.kind === 'reward' ? state.rewardPool : Infinity) / 100} placeholder="0.00" required /></label>{formError && <p className="form-error" role="alert">{formError}</p>}<div className="form-actions"><button type="button" className="button secondary" onClick={closeDialog}>Cancel</button><button className="button primary" type="submit"><Plus size={16} /> {modal.goal.kind === 'reward' ? 'Allocate rewards' : 'Record savings'}</button></div></form>}
      {modal.type === 'close' && <><p className="form-intro">A fresh start, with something to show for it. Here’s how your month adds up.</p><div className="close-month-preview"><div><span>Spending budget</span><strong>{money(summary.budget)}</strong></div><div><span>Total expenses</span><strong>−{money(summary.spent)}</strong></div><div className="preview-total"><span>Move to rewards pool</span><strong>{money(summary.availableReward)}</strong></div></div><div className="info-note close-warning"><LockKeyhole size={19} /><p>Closing locks this month’s expenses and budgets. Add any remaining expenses first. This transfer can only happen once. Your savings won’t change.</p></div>{month === currentMonth() && <p className="muted current-month-warning">This month is still in progress. Close it only when you’re finished recording your spending.</p>}{formError && <p className="form-error" role="alert">{formError}</p>}<div className="form-actions"><button className="button secondary" onClick={closeDialog}>Keep month open</button><button className="button primary" onClick={() => { if (commit(s => closeMonth(s, month), `${monthName(month)} closed. ${money(summary.availableReward)} moved to rewards.`)) closeDialog(); }}><Gift size={16} /> Close & transfer</button></div></>}
      {modal.type === 'category' && <form onSubmit={event => submit(event, data => { const name = String(data.get('name')).trim(); if (!name) throw new Error('Give your category a name.'); if (state.categories.some(c => c.name.toLowerCase() === name.toLowerCase())) throw new Error('You already have a category with that name.'); const budget = toMinor(data.get('budget'), true); const category = { id: crypto.randomUUID(), name, budget, color: String(data.get('color')), icon: 'tag' }; if (commit(s => { const existing = Object.fromEntries(s.categories.map(c => [c.id, s.months[month] ? s.months[month].budgets[c.id] ?? 0 : c.budget])); return setBudgets({ ...s, categories: [...s.categories, category] }, month, { ...existing, [category.id]: budget }); }, 'Your new category is ready')) closeDialog(); })}><p className="form-intro">Your life doesn’t have to fit someone else’s categories.</p><label className="field">Category name<input className="input" name="name" maxLength={40} placeholder="e.g. Books & learning" required /></label><div className="form-grid"><label className="field">Monthly budget ({state.currency})<input className="input" name="budget" type="number" step="0.01" min="0" max="10000000000" placeholder="0.00" required /></label><label className="field">Category color<select className="input" name="color"><option value="#8b78d5">Lavender</option><option value="#d69a6c">Peach</option><option value="#71a58e">Sage</option><option value="#719cc7">Sky</option><option value="#cd86a5">Rose</option></select></label></div>{formError && <p className="form-error" role="alert">{formError}</p>}<div className="form-actions"><button type="button" className="button secondary" onClick={closeDialog}>Cancel</button><button type="submit" className="button primary"><Plus size={16} /> Add category</button></div></form>}
      {modal.type === 'settings' && <><p className="form-intro">A few little things to make this space yours.</p><label className="field">Display currency<select className="input" value={state.currency} onChange={e => commit(s => ({ ...s, currency: e.target.value }), 'Display currency updated')}><option value="INR">Indian rupee (₹)</option><option value="AED">UAE dirham (AED)</option><option value="USD">US dollar ($)</option><option value="EUR">Euro (€)</option><option value="GBP">British pound (£)</option></select></label><p className="muted settings-hint">This changes the display symbol. Existing amounts aren’t converted.</p><div className="settings-storage"><LockKeyhole size={20} /><div><h3>Your data stays on this device</h3><p>Pocket saves in this browser’s local storage. There’s no bank connection or cloud sync. Export your expenses to keep a copy.</p></div></div><button className="button secondary full-width" onClick={exportCsv}><Download size={16} /> Export {monthName(month, true)} expenses</button><div className="danger-zone"><h3>Start with a clean slate</h3><p>Remove all expenses, goals, rewards, and budgets, including any sample data. This can’t be undone.</p>{confirmClear ? <div className="form-actions"><button className="button secondary" onClick={() => setConfirmClear(false)}>Keep my data</button><button className="button danger" onClick={() => { if (commit(() => ({ ...emptyState(), currency: state.currency }), 'A fresh start. Make it yours.')) { setDemo(false); localStorage.setItem('pocket-demo-dismissed', '1'); closeDialog(); } }}>Yes, clear everything</button></div> : <button className="button danger" onClick={() => setConfirmClear(true)}><Trash2 size={15} /> Clear all data</button>}</div></>}
      {modal.type === 'help' && <div className="help-content"><p className="form-intro">A little mindfulness for your money. Here’s the idea.</p><div><span className="help-step">1</span><section><h3>Give your month a plan</h3><p>Set a budget for each spending category. Keep the money you want to save outside this allowance.</p></section></div><div><span className="help-step">2</span><section><h3>Log the little things</h3><p>Add your expenses as you go. Your dashboard shows what you’ve spent and how much breathing room is left.</p></section></div><div><span className="help-step">3</span><section><h3>Save with a purpose</h3><p>Create savings goals and record what you’ve put aside. Savings never reduce your spending budget or feed your rewards.</p></section></div><div><span className="help-step">4</span><section><h3>Make the most of what’s left</h3><p>Budget {money(800000)}, spend {money(750000)}? Close the month and {money(50000)} moves to your rewards pool. Allocate it toward a treat on your wishlist. Overspending adds zero.</p></section></div><div className="info-note"><LockKeyhole size={17} /><p>Data is saved only in this browser. Pocket records your money; it doesn’t make real bank transfers.</p></div><button className="button primary full-width" onClick={closeDialog}>Let’s make good things happen <ArrowRight size={16} /></button></div>}
    </Modal>}
    {toast && <div className="toast" role="status"><span><CheckCircle2 size={18} /></span>{toast}<button className="icon-button" aria-label="Dismiss notification" onClick={() => setToast('')}><X size={15} /></button></div>}
  </div>;
}

function Empty({ icon, text, detail, action }: { icon: ReactNode; text: string; detail: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon">{icon}</span><h3>{text}</h3><p>{detail}</p>{action}</div>;
}
