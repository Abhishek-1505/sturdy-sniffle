import { useEffect, useId, useState, type FormEvent } from 'react';
import { ArrowRight, Banknote, Check, LockKeyhole, Pencil, PiggyBank, Plus, Trash2, Wallet, X } from 'lucide-react';
import { currentMonth, defaultPlan, getMonthlyPlan, setMonthlyPlan, type MonthlyPlan, type State } from './model';

type Props = {
  state: State;
  month: string;
  money: (amount: number) => string;
  commit: (update: (state: State) => State, message: string) => boolean;
};
type FixedCostField = { id: string; name: string; amount: string };

function amountFromInput(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value) || !Number.isFinite(Number(value)) || Number(value) > 1e10) {
    throw new Error('Enter an amount of zero or more, with up to 2 decimal places.');
  }
  return Math.round(Number(value) * 100);
}

export default function MonthlyPlanSection({ state, month, money, commit }: Props) {
  const plan = getMonthlyPlan(state, month);
  const displayedPlan = plan ?? defaultPlan();
  const [editing, setEditing] = useState(false);
  const [salary, setSalary] = useState('');
  const [savings, setSavings] = useState('');
  const [fixedCosts, setFixedCosts] = useState<FixedCostField[]>([]);
  const [error, setError] = useState('');
  const formId = useId();
  const locked = Boolean(state.months[month]?.closed) || month < currentMonth();
  const future = month > currentMonth();
  const fixedTotal = displayedPlan.fixedCosts.reduce((total, item) => total + item.amount, 0);
  const spending = displayedPlan.salary - fixedTotal - displayedPlan.savings;
  const preview = Number(salary || '0') * 100 - Number(savings || '0') * 100 - fixedCosts.reduce((total, item) => total + Number(item.amount || '0') * 100, 0);
  const previewValid = Number.isFinite(preview) && preview >= 0;

  useEffect(() => { setEditing(false); setError(''); }, [month]);

  function beginEditing() {
    const source = plan ?? defaultPlan();
    setSalary(String(source.salary / 100));
    setSavings(String(source.savings / 100));
    setFixedCosts(source.fixedCosts.map(item => ({ ...item, amount: String(item.amount / 100) })));
    setError('');
    setEditing(true);
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      const nextPlan: MonthlyPlan = {
        salary: amountFromInput(salary),
        savings: amountFromInput(savings),
        fixedCosts: fixedCosts.map(item => {
          if (!item.name.trim()) throw new Error('Give each fixed cost a name, or remove the empty row.');
          return { id: item.id, name: item.name.trim(), amount: amountFromInput(item.amount) };
        }),
      };
      if (nextPlan.fixedCosts.reduce((total, item) => total + item.amount, 0) + nextPlan.savings > nextPlan.salary) {
        throw new Error('Your fixed costs and monthly savings cannot be more than your salary.');
      }
      if (commit(previous => setMonthlyPlan(previous, month, nextPlan), future ? 'Monthly plan scheduled. Savings begin when that month arrives.' : 'Monthly plan saved. Your spending money and savings are up to date.')) {
        setEditing(false);
      } else setError('Your plan could not be saved. Check the notification for details and try again.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Please check the amounts in your plan.');
    }
  }

  return <section className={`card monthly-plan-card ${!plan ? 'monthly-plan-suggested' : ''}`} aria-labelledby={`${formId}-title`}>
    <div className="monthly-plan-header">
      <div><span className="monthly-plan-kicker">YOUR MONTH, WITH A PLAN</span><h2 id={`${formId}-title`}>{plan ? 'Your monthly plan' : 'Give your salary a little direction'}</h2><p>{plan ? 'Fixed costs covered. Savings set aside. The rest is yours to spend.' : 'Set up your salary, fixed costs, and automatic savings to calculate your spending money.'}</p></div>
      {locked ? <span className="monthly-plan-lock"><LockKeyhole size={14} />{state.months[month]?.closed ? 'Month closed' : 'Past month'}</span> : <button type="button" className="button secondary small" onClick={() => editing ? setEditing(false) : beginEditing()} aria-expanded={editing} aria-controls={formId}>{editing ? <X size={14} /> : <Pencil size={14} />}{editing ? 'Cancel editing' : plan ? 'Edit monthly plan' : 'Set up monthly plan'}</button>}
    </div>
    {!plan && <span className="monthly-plan-preview-badge">Suggested amounts below · apply them by saving your plan</span>}
    <div className="monthly-plan-breakdown">
      <div className="monthly-plan-item"><span className="monthly-plan-item-label"><Banknote size={16} /> Monthly salary</span><strong>{money(displayedPlan.salary)}</strong><span className="monthly-plan-item-detail">Your starting point</span></div>
      <span className="monthly-plan-operation" aria-hidden="true">−</span>
      <div className="monthly-plan-item"><span className="monthly-plan-item-label"><Wallet size={16} /> Fixed costs</span><strong>{money(fixedTotal)}</strong><span className="monthly-plan-item-detail">{displayedPlan.fixedCosts.length ? displayedPlan.fixedCosts.map(item => `${item.name} ${money(item.amount)}`).join(' · ') : 'No fixed costs set'}</span></div>
      <span className="monthly-plan-operation" aria-hidden="true">−</span>
      <div className="monthly-plan-item"><span className="monthly-plan-item-label"><PiggyBank size={16} /> Monthly savings</span><strong>{money(displayedPlan.savings)}</strong><span className="monthly-plan-item-detail">{future ? 'Added when this month begins' : 'Automatically added each month'}</span></div>
      <span className="monthly-plan-operation" aria-hidden="true">=</span>
      <div className="monthly-plan-item monthly-plan-spending"><span className="monthly-plan-item-label">{plan ? 'Spending money' : 'Suggested spending money'} <ArrowRight size={16} /></span><strong>{money(spending)}</strong><span className="monthly-plan-item-detail">One flexible limit across all categories</span></div>
    </div>
    <div className="monthly-plan-footer"><span><Check size={15} />Food can go over its guide if your total spending stays within {money(spending)}.</span>{plan && <span className="monthly-plan-auto-note">Savings are recorded once per month, including any missed months when you return.</span>}</div>
    {editing && !locked && <form id={formId} className="monthly-plan-editor" onSubmit={save}>
      <div className="monthly-plan-editor-heading"><h3>{plan ? 'Make this plan work for you' : 'Set up your monthly plan'}</h3><p>Saved plans repeat for future months. You can adjust a future month whenever you need.</p></div>
      <div className="form-grid"><label className="field">Monthly salary ({state.currency})<input className="input" name="salary" aria-label={`Monthly salary (${state.currency})`} type="number" min="0" step="0.01" max="10000000000" value={salary} onChange={event => setSalary(event.target.value)} required /></label><label className="field">Automatic monthly savings ({state.currency})<input className="input" name="monthlySavings" aria-label={`Automatic monthly savings (${state.currency})`} type="number" min="0" step="0.01" max="10000000000" value={savings} onChange={event => setSavings(event.target.value)} required /></label></div>
      <div className="monthly-plan-fixed-heading"><h4>Your fixed costs</h4><button type="button" className="text-button" onClick={() => setFixedCosts(previous => [...previous, { id: crypto.randomUUID(), name: '', amount: '' }])}><Plus size={14} /> Add fixed cost</button></div>
      <div className="monthly-plan-fixed-list">{fixedCosts.map((item, index) => <div className="monthly-plan-fixed-row" key={item.id}><label className="field"><span className="sr-only">Fixed cost name {index + 1}</span><input className="input" aria-label={`Fixed cost name ${index + 1}`} placeholder="e.g. Rent" maxLength={80} value={item.name} onChange={event => setFixedCosts(previous => previous.map(cost => cost.id === item.id ? { ...cost, name: event.target.value } : cost))} required /></label><label className="field"><span className="sr-only">Amount for {item.name || `fixed cost ${index + 1}`} ({state.currency})</span><input className="input" aria-label={`Amount for ${item.name || `fixed cost ${index + 1}`} (${state.currency})`} type="number" min="0" step="0.01" max="10000000000" placeholder="0.00" value={item.amount} onChange={event => setFixedCosts(previous => previous.map(cost => cost.id === item.id ? { ...cost, amount: event.target.value } : cost))} required /></label><button type="button" className="icon-button" aria-label={`Remove ${item.name || `fixed cost ${index + 1}`}`} onClick={() => setFixedCosts(previous => previous.filter(cost => cost.id !== item.id))}><Trash2 size={17} /></button></div>)}</div>
      {!fixedCosts.length && <p className="monthly-plan-no-costs">No fixed costs yet. Add the bills or commitments you pay every month.</p>}
      <div className={`monthly-plan-live-total ${!previewValid ? 'invalid' : ''}`} aria-live="polite"><span>Your monthly spending money</span><strong>{Number.isFinite(preview) ? money(Math.round(preview)) : 'Check your amounts'}</strong></div>
      {!previewValid && <p className="monthly-plan-error" role="alert">Fixed costs and savings need to fit within your salary.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <p className="monthly-plan-editor-note">This records your monthly savings in Pocket. No money is moved between bank accounts.</p>
      <div className="form-actions"><button type="button" className="button secondary" onClick={() => { setEditing(false); setError(''); }}>Cancel</button><button type="submit" className="button primary" disabled={!previewValid}><Check size={16} /> Save monthly plan</button></div>
    </form>}
  </section>;
}
