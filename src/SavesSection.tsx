import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowDownLeft, ArrowUpRight, CalendarDays, Check, Leaf, LockKeyhole, PiggyBank, Plus, Repeat2, Target, Wallet, X } from 'lucide-react';
import {
  currentMonth, depositSavings, getMonthlyPlan, savingsSummary, withdrawSavings,
  type Goal, type SavingsTransaction, type State,
} from './model';

type Props = {
  state: State;
  money: (amount: number) => string;
  commit: (update: (previous: State) => State, message: string) => boolean;
  onCreateGoal: () => void;
  onAllocateGoal: (goal: Goal) => void;
};

const monthLabel = (month: string) => new Date(`${month}-01T12:00:00`).toLocaleDateString('en', { month: 'short', year: 'numeric' });
const dateLabel = (date: string) => new Date(date.length === 10 ? `${date}T12:00:00` : date).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' });

function amountFromInput(value: FormDataEntryValue | null) {
  const raw = String(value ?? '').trim();
  const amount = Number(raw);
  if (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(raw) || !Number.isFinite(amount) || amount <= 0 || amount > 1e10) {
    throw new Error('Enter a positive amount with up to 2 decimal places.');
  }
  return Math.round(amount * 100);
}

function transactionTitle(transaction: SavingsTransaction) {
  if (transaction.kind === 'monthly') return `Monthly savings${transaction.month ? ` · ${monthLabel(transaction.month)}` : ''}`;
  if (transaction.kind === 'opening') return 'Opening savings balance';
  return transaction.kind === 'deposit' ? 'Added to savings' : 'Withdrawal from savings';
}

export default function SavesSection({ state, money, commit, onCreateGoal, onAllocateGoal }: Props) {
  const summary = savingsSummary(state);
  const goals = state.goals.filter(goal => goal.kind === 'savings');
  const plan = getMonthlyPlan(state, currentMonth());
  const [panel, setPanel] = useState<'deposit' | 'withdraw' | null>(null);
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const formAmountRef = useRef<HTMLInputElement>(null);
  const selectedGoal = goals.find(goal => goal.id === source);
  const maximum = panel === 'withdraw'
    ? selectedGoal?.saved ?? summary.available
    : selectedGoal ? selectedGoal.target - selectedGoal.saved : 1e12;
  const transactions = [...state.savingsTransactions].reverse().sort((a, b) => b.date.localeCompare(a.date));
  const visibleTransactions = showAll ? transactions : transactions.slice(0, 8);

  useEffect(() => {
    if (panel) {
      formAmountRef.current?.focus({ preventScroll: true });
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [panel]);

  function openPanel(type: 'deposit' | 'withdraw') {
    setError('');
    setSource(type === 'withdraw' && summary.available === 0 ? goals.find(goal => goal.saved > 0)?.id ?? '' : '');
    setPanel(type);
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    try {
      const form = new FormData(event.currentTarget);
      const amount = amountFromInput(form.get('amount'));
      const note = String(form.get('note') ?? '').trim();
      if (amount > maximum) {
        throw new Error(panel === 'withdraw'
          ? `You can withdraw up to ${money(maximum)} from ${selectedGoal ? selectedGoal.name : 'unallocated savings'}.`
          : `This goal only needs ${money(maximum)} more. You can add the rest to unallocated savings.`);
      }
      const action = panel === 'withdraw' ? withdrawSavings : depositSavings;
      if (commit(previous => action(previous, amount, note, source || undefined), panel === 'withdraw' ? 'Savings withdrawal recorded.' : 'A little more set aside. Savings added.')) {
        setPanel(null); setSource('');
      } else {
        setError('This change could not be saved. Check the notification for details and try again.');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Please check the amount and try again.');
    }
  }

  return <>
    <section className="saves-summary-grid" aria-label="Your savings balance">
      <div className="card saves-balance-card">
        <div className="stat-label">TOTAL SAVINGS <PiggyBank size={21} strokeWidth={1.6} /></div>
        <h2 className="stat-value" data-testid="savings-balance">{money(summary.balance)}</h2>
        <p>Money you’ve set aside, including your goals.</p>
      </div>
      <div className="card saves-metric-card">
        <span className="stat-label">AVAILABLE TO ALLOCATE <Wallet size={17} /></span>
        <div className="stat-value" data-testid="savings-available">{money(summary.available)}</div>
        <p>Saved, with no goal assigned yet.</p>
      </div>
      <div className="card saves-metric-card">
        <span className="stat-label">ASSIGNED TO GOALS <Target size={17} /></span>
        <div className="stat-value">{money(summary.allocated)}</div>
        <p>Part of your savings, never counted twice.</p>
      </div>
    </section>

    <div className="saves-actions">
      <div className="savings-plan-note"><Repeat2 size={19} /><div><strong>{plan ? `${money(plan.savings)} saved automatically each month` : 'Your monthly savings, on autopilot'}</strong><p>{plan ? 'Recorded once per month. Open Pocket to catch up any missed months.' : 'Set your monthly plan in Spends to start automatic savings.'}</p></div></div>
      <div className="heading-actions"><button className="button secondary" disabled={summary.balance <= 0} onClick={() => openPanel('withdraw')}><ArrowUpRight size={16} /> Withdraw</button><button className="button primary" onClick={() => openPanel('deposit')}><Plus size={16} /> Add money</button></div>
    </div>

    {panel && <section ref={panelRef} className="card savings-form-panel" aria-labelledby="savings-form-title">
      <div className="card-header"><div><h2 id="savings-form-title" className="card-title">{panel === 'deposit' ? 'Add to your savings' : 'Withdraw from your savings'}</h2><p className="card-description">{panel === 'deposit' ? 'An extra payment, a gift, or just a little more set aside.' : 'Life happens. Record money you’ve taken out of savings.'}</p></div><button className="icon-button" aria-label="Close savings form" onClick={() => { setPanel(null); setError(''); }}><X size={18} /></button></div>
      <form onSubmit={save} aria-label={panel === 'deposit' ? 'Add money to savings' : 'Withdraw money from savings'}>
        <div className="form-grid">
          <label className="field">Savings amount ({state.currency})<input ref={formAmountRef} className="input" type="number" name="amount" min="0.01" max={maximum / 100} step="0.01" placeholder="0.00" required /></label>
          <label className="field">{panel === 'deposit' ? 'Save to' : 'Withdraw from'}<select className="input" name="source" value={source} onChange={event => { setSource(event.target.value); setError(''); }}><option value="">Unallocated savings{panel === 'withdraw' ? ` · ${money(summary.available)}` : ''}</option>{goals.filter(goal => panel === 'deposit' ? goal.saved < goal.target : goal.saved > 0).map(goal => <option key={goal.id} value={goal.id}>{goal.name}{panel === 'withdraw' ? ` · ${money(goal.saved)}` : ''}</option>)}</select></label>
          <label className="field full">A little note (optional)<input className="input" name="note" maxLength={250} placeholder={panel === 'deposit' ? 'e.g. Birthday gift or freelance payment' : 'e.g. Car repair or an unexpected bill'} /></label>
        </div>
        <p className="savings-source-hint">{panel === 'withdraw' ? `${money(maximum)} available from this source. ${selectedGoal ? 'Withdrawing also reduces this goal’s progress.' : 'Your goal allocations stay untouched.'}` : selectedGoal ? `This adds new savings and assigns the amount to ${selectedGoal.name}.` : 'This adds new savings. You can allocate it to a goal whenever you’re ready.'} Your spending allowance stays the same.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions"><button type="button" className="button secondary" onClick={() => { setPanel(null); setError(''); }}>Cancel</button><button type="submit" className="button primary"><Check size={16} />{panel === 'deposit' ? 'Save deposit' : 'Record withdrawal'}</button></div>
      </form>
    </section>}

    <div className="section-title-row"><h2>Your savings goals <span className="count-badge">{goals.length}</span></h2><button className="button primary" onClick={onCreateGoal}><Plus size={16} /> New savings goal</button></div>
    <div className="page-grid">
      {goals.map(goal => {
        const percentage = Math.min(100, Math.round(goal.saved / goal.target * 100));
        const complete = goal.saved >= goal.target;
        return <article className="card goal-card" key={goal.id}><div className="goal-card-top"><span className="goal-emoji">{goal.emoji}</span><span className={`badge ${complete ? 'success' : 'purple'}`}>{complete ? 'Goal reached!' : `${percentage}% there`}</span></div><h3>{goal.name}</h3><div className="goal-card-amount">{money(goal.saved)} <span>of {money(goal.target)}</span></div><div className="progress-track" role="progressbar" aria-label={`${goal.name} progress`} aria-valuenow={percentage} aria-valuemin={0} aria-valuemax={100}><div className="progress-fill" style={{ width: `${percentage}%`, background: '#8c79d4' }} /></div><div className="goal-card-footer"><span className="muted">{complete ? 'You made it. Enjoy this moment.' : `${money(goal.target - goal.saved)} to go`}</span><button className="button secondary small" disabled={complete || summary.available <= 0} onClick={() => onAllocateGoal(goal)}><Plus size={14} /> Allocate savings</button></div></article>;
      })}
      {!goals.length && <div className="card empty-state"><span className="empty-icon"><PiggyBank /></span><h3>What are you saving for?</h3><p>Your money is already saved. A goal gives it a little direction.</p><button className="button secondary small" onClick={onCreateGoal}><Plus size={14} /> Create your first goal</button></div>}
    </div>

    <section className="card savings-ledger">
      <div className="card-header"><div><h2 className="card-title">Your savings activity</h2><p className="card-description">Monthly contributions, extra deposits, and withdrawals in one place.</p></div><CalendarDays size={19} className="muted" /></div>
      {visibleTransactions.length ? <div>{visibleTransactions.map(transaction => {
        const withdrawal = transaction.kind === 'withdrawal';
        const Icon = withdrawal ? ArrowUpRight : transaction.kind === 'monthly' ? Repeat2 : transaction.kind === 'opening' ? PiggyBank : ArrowDownLeft;
        const goal = transaction.goalId ? goals.find(item => item.id === transaction.goalId) : undefined;
        return <div key={transaction.id} className="savings-ledger-row"><span className={`savings-ledger-icon ${withdrawal ? 'debit' : 'credit'}`}><Icon size={18} /></span><div className="savings-ledger-info"><strong>{transactionTitle(transaction)}</strong><p>{dateLabel(transaction.date)}{goal ? ` · ${withdrawal ? 'From' : 'To'} ${goal.name}` : ''}{transaction.note ? ` · ${transaction.note}` : ''}</p></div><strong className={`savings-ledger-amount ${withdrawal ? 'debit' : ''}`}>{withdrawal ? '−' : '+'}{money(transaction.amount)}</strong></div>;
      })}</div> : <div className="empty-state"><span className="empty-icon"><Leaf /></span><h3>A little saved, a little more possible.</h3><p>Add money or set up monthly savings to see your progress here.</p></div>}
      {transactions.length > 8 && <div className="card-footer"><span className="muted">{transactions.length} savings entries</span><button className="text-button" onClick={() => setShowAll(previous => !previous)}>{showAll ? 'Show recent activity' : 'Show all activity'}</button></div>}
    </section>
    <div className="info-note"><LockKeyhole size={17} /><p>Savings are separate from your spending allowance and rewards. These are records of money you’ve set aside or withdrawn; Pocket doesn’t transfer money between bank accounts.</p></div>
  </>;
}
