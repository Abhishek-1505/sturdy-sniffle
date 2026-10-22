import { test, expect, type Page } from '@playwright/test';

async function startFresh(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).last().click();
  await page.getByRole('button', { name: 'Clear all data', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, clear everything', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

async function setUpSalaryPlan(page: Page) {
  await page.getByRole('button', { name: 'Set up monthly plan', exact: true }).click();
  await page.getByRole('button', { name: 'Save monthly plan', exact: true }).click();
  await expect(page.locator('.balance-card .stat-value')).toHaveText('₹3,500');
}

async function addExpense(page: Page, note: string, amount: string, category = 'food') {
  await page.getByRole('button', { name: 'Add expense', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'A little note (optional)', exact: true }).fill(note);
  await dialog.getByRole('spinbutton', { name: 'Amount (INR)', exact: true }).fill(amount);
  await dialog.getByRole('combobox', { name: 'Category', exact: true }).selectOption(category);
  await dialog.getByRole('button', { name: 'Save expense', exact: true }).click();
  await expect(dialog).toHaveCount(0);
}

function followingMonth(month: string, offset: number) {
  const date = new Date(`${month}-01T12:00:00`);
  date.setMonth(date.getMonth() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

async function expectCategoryBudget(page: Page, category: string, amount: string) {
  await page.getByRole('button', { name: 'Edit budgets', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: `${category} budget`, exact: true })).toHaveValue(amount);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
}

async function createSavingsGoal(page: Page, name: string, target = '10000') {
  await page.getByRole('button', { name: 'New savings goal', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Goal name', exact: true }).fill(name);
  await dialog.getByRole('spinbutton', { name: 'Target amount (INR)', exact: true }).fill(target);
  await dialog.getByRole('button', { name: 'Create goal', exact: true }).click();
}

test('salary pays fixed costs and monthly savings once, while only total spending controls rewards', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await startFresh(page);
  await setUpSalaryPlan(page);
  await expect(page.locator('.monthly-plan-breakdown')).toContainText('₹12,500');
  await expect(page.locator('.monthly-plan-breakdown')).toContainText('₹7,000');
  await expect(page.locator('.monthly-plan-breakdown')).toContainText('₹2,000');
  await page.getByRole('tab', { name: /^Saves/ }).click();
  await expect(page.getByTestId('savings-balance')).toHaveText('₹2,000');
  await expect(page.locator('.savings-ledger-row')).toHaveCount(1);
  await page.reload();
  await page.getByRole('tab', { name: /^Saves/ }).click();
  await expect(page.getByTestId('savings-balance')).toHaveText('₹2,000');
  await expect(page.locator('.savings-ledger-row')).toHaveCount(1);

  await page.getByRole('button', { name: 'Monthly budgets', exact: true }).click();
  await page.getByRole('button', { name: 'Set monthly budgets', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Food & coffee budget', exact: true }).fill('1000');
  await page.getByRole('spinbutton', { name: 'Groceries budget', exact: true }).fill('1500');
  await page.getByRole('button', { name: 'Save budgets', exact: true }).click();
  await addExpense(page, 'Meals out', '1500');
  await addExpense(page, 'Groceries for the week', '500', 'groceries');
  await page.getByRole('tab', { name: /^Spends/ }).click();
  await expect(page.locator('.balance-card .stat-value')).toHaveText('₹1,500');
  await expect(page.locator('.stats-grid .stat-card').nth(1).locator('.badge.success')).toBeVisible();

  // Category targets are guides: increasing one cannot create more spending money.
  await page.getByRole('button', { name: 'Edit budgets', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Food & coffee budget', exact: true }).fill('8000');
  await page.getByRole('button', { name: 'Save budgets', exact: true }).click();
  await expect(page.locator('.balance-card .stat-value')).toHaveText('₹1,500');
  await expect(page.locator('.stats-grid .stat-card').nth(2).locator('.stat-value')).toHaveText('₹2,000');

  await page.getByRole('button', { name: 'Rewards', exact: true }).click();
  await page.getByRole('button', { name: 'Close month & move the rest', exact: true }).click();
  await page.getByRole('button', { name: 'Close & transfer', exact: true }).click();
  await expect(page.locator('.rewards-hero-total')).toContainText('₹1,500');
  await expect(page.getByRole('button', { name: 'Month closed', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'New reward goal', exact: true }).click();
  await page.getByRole('textbox', { name: 'Goal name', exact: true }).fill('Coffee grinder');
  await page.getByRole('spinbutton', { name: 'Target amount (INR)', exact: true }).fill('1000');
  await page.getByRole('button', { name: 'Create goal', exact: true }).click();
  await page.getByRole('button', { name: 'Allocate', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Amount to add (INR)', exact: true }).fill('300');
  await page.getByRole('button', { name: 'Allocate rewards', exact: true }).click();
  await expect(page.locator('.rewards-hero-total')).toContainText('₹1,200');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Add expense', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Rewards', exact: true }).click();
  await expect(page.locator('.history-row')).toHaveCount(1);
  await page.getByRole('tab', { name: /^Saves/ }).click();
  await expect(page.getByTestId('savings-balance')).toHaveText('₹2,000');
  await expect(page.locator('.savings-ledger-row')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('extra deposits, goal allocations, and withdrawals change savings without changing spending money', async ({ page }) => {
  await startFresh(page);
  await setUpSalaryPlan(page);
  await page.getByRole('tab', { name: /^Saves/ }).click();
  await page.getByRole('button', { name: 'Add money', exact: true }).click();
  const deposit = page.getByRole('form', { name: 'Add money to savings', exact: true });
  await deposit.getByRole('spinbutton', { name: 'Savings amount (INR)', exact: true }).fill('500');
  await deposit.getByRole('textbox', { name: 'A little note (optional)', exact: true }).fill('Birthday gift');
  await deposit.getByRole('button', { name: 'Save deposit', exact: true }).click();
  await expect(page.getByTestId('savings-balance')).toHaveText('₹2,500');
  await expect(page.locator('.savings-ledger')).toContainText('Birthday gift');

  await createSavingsGoal(page, 'Rainy day');
  const goal = page.locator('.goal-card').filter({ has: page.getByRole('heading', { name: 'Rainy day', exact: true }) });
  await goal.getByRole('button', { name: 'Allocate savings', exact: true }).click();
  await page.getByRole('dialog').getByRole('spinbutton').fill('1200');
  await page.getByRole('dialog').getByRole('button', { name: 'Allocate savings', exact: true }).click();
  await expect(goal.locator('.goal-card-amount')).toContainText('₹1,200');
  await expect(page.getByTestId('savings-balance')).toHaveText('₹2,500');
  await expect(page.getByTestId('savings-available')).toHaveText('₹1,300');

  await page.getByRole('button', { name: 'Withdraw', exact: true }).click();
  let withdrawal = page.getByRole('form', { name: 'Withdraw money from savings', exact: true });
  await withdrawal.getByRole('spinbutton', { name: 'Savings amount (INR)', exact: true }).fill('200');
  await withdrawal.getByRole('button', { name: 'Record withdrawal', exact: true }).click();
  await expect(page.getByTestId('savings-balance')).toHaveText('₹2,300');
  await expect(goal.locator('.goal-card-amount')).toContainText('₹1,200');

  await page.getByRole('button', { name: 'Withdraw', exact: true }).click();
  withdrawal = page.getByRole('form', { name: 'Withdraw money from savings', exact: true });
  await withdrawal.getByRole('combobox', { name: 'Withdraw from', exact: true }).selectOption({ label: 'Rainy day · ₹1,200' });
  await withdrawal.getByRole('spinbutton', { name: 'Savings amount (INR)', exact: true }).fill('300');
  await withdrawal.getByRole('button', { name: 'Record withdrawal', exact: true }).click();
  await expect(page.getByTestId('savings-balance')).toHaveText('₹2,000');
  await expect(page.getByTestId('savings-available')).toHaveText('₹1,100');
  await expect(goal.locator('.goal-card-amount')).toContainText('₹900');

  await page.getByRole('button', { name: 'Withdraw', exact: true }).click();
  withdrawal = page.getByRole('form', { name: 'Withdraw money from savings', exact: true });
  const amount = withdrawal.getByRole('spinbutton', { name: 'Savings amount (INR)', exact: true });
  await amount.fill('9000');
  await withdrawal.getByRole('button', { name: 'Record withdrawal', exact: true }).click();
  expect(await amount.evaluate(input => !(input as HTMLInputElement).validity.valid)).toBe(true);
  await expect(page.getByTestId('savings-balance')).toHaveText('₹2,000');
  await page.getByRole('button', { name: 'Close savings form', exact: true }).click();
  await expect(page.locator('.savings-ledger-row')).toHaveCount(4);
  await page.reload();
  await expect(page.locator('.balance-card .stat-value')).toHaveText('₹3,500');
  await page.getByRole('tab', { name: /^Saves/ }).click();
  await expect(page.getByTestId('savings-balance')).toHaveText('₹2,000');
  await expect(page.getByTestId('savings-available')).toHaveText('₹1,100');
  await expect(page.locator('.savings-ledger-row')).toHaveCount(4);
});

test('existing records migrate without losing expenses, savings goals, or rewards', async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('pocket-state-v1')) return;
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    localStorage.setItem('pocket-demo-dismissed', '1');
    localStorage.setItem('pocket-state-v1', JSON.stringify({
      version: 1, currency: 'INR',
      categories: [{ id: 'food', name: 'Food & coffee', color: '#a191ef', icon: 'coffee', budget: 100000 }, { id: 'groceries', name: 'Groceries', color: '#98b798', icon: 'basket', budget: 150000 }],
      expenses: [{ id: 'existing-expense', title: 'Existing groceries', categoryId: 'groceries', amount: 75000, date: `${month}-01`, note: 'Keep this record' }],
      goals: [{ id: 'existing-goal', name: 'Existing emergency fund', kind: 'savings', target: 1000000, saved: 250000, emoji: '☂️' }],
      months: { [month]: { budgets: { food: 100000, groceries: 150000 }, closed: false, rewardTransfer: 0 } },
      rewardPool: 12345, rewardHistory: [],
    }));
  });
  await page.goto('/');
  await expect(page.locator('.balance-card .stat-value')).toHaveText('₹1,750');
  await expect(page.locator('.stats-grid .stat-card').nth(3).locator('.stat-value')).toHaveText('₹123.45');
  await expect(page.getByRole('button', { name: 'Set up monthly plan', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Transactions', exact: true }).click();
  await expect(page.locator('.expense-table tbody')).toContainText('Existing groceries');
  await expect(page.locator('.expense-table tbody')).toContainText('Keep this record');
  await page.getByRole('button', { name: 'Edit Existing groceries', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('textbox', { name: /^What was it for/ })).toHaveCount(0);
  await page.getByRole('dialog').getByRole('spinbutton', { name: 'Amount (INR)', exact: true }).fill('800');
  await page.getByRole('dialog').getByRole('combobox', { name: 'Category', exact: true }).selectOption('food');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit Existing groceries', exact: true })).toBeVisible();
  await expect(page.locator('.expense-table tbody')).toContainText('₹800');
  await expect(page.locator('.expense-table tbody')).toContainText('Keep this record');
  await page.getByRole('tab', { name: /^Saves/ }).click();
  await expect(page.getByTestId('savings-balance')).toHaveText('₹2,500');
  await expect(page.getByTestId('savings-available')).toHaveText('₹0');
  await expect(page.getByRole('heading', { name: 'Existing emergency fund', exact: true })).toBeVisible();
  await expect(page.locator('.savings-ledger-row')).toHaveCount(1);
  await expect(page.locator('.savings-ledger')).toContainText('Opening savings balance');
  await page.reload();
  await page.getByRole('button', { name: 'Transactions', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit Existing groceries', exact: true })).toBeVisible();
  await expect(page.locator('.expense-table tbody')).toContainText('₹800');
  await page.getByRole('tab', { name: /^Saves/ }).click();
  await expect(page.getByTestId('savings-balance')).toHaveText('₹2,500');
  await expect(page.locator('.savings-ledger-row')).toHaveCount(1);
});

test('expenses can be edited, searched, exported, deleted, and categorized', async ({ page }) => {
  await startFresh(page);
  await setUpSalaryPlan(page);
  await addExpense(page, 'Bookshop purchase', '299.50');
  await page.getByRole('button', { name: 'Transactions', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search transactions', exact: true }).fill('Bookshop purchase');
  await expect(page.locator('.expense-table tbody tr')).toHaveCount(1);
  await expect(page.locator('.expense-table tbody')).toContainText('₹299.5');
  await page.getByRole('button', { name: 'Edit Food & coffee', exact: true }).click();
  await page.getByRole('dialog').getByRole('textbox', { name: 'A little note (optional)', exact: true }).fill('Learning books');
  await page.getByRole('dialog').getByRole('spinbutton', { name: 'Amount (INR)', exact: true }).fill('349.50');
  await page.getByRole('dialog').getByRole('combobox', { name: 'Category', exact: true }).selectOption('shopping');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search transactions', exact: true }).fill('Learning books');
  await expect(page.locator('.expense-table tbody tr')).toHaveCount(1);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/^pocket-expenses-\d{4}-\d{2}\.csv$/);
  await expect(page.locator('.expense-table tbody')).toContainText('₹349.5');
  await page.getByRole('button', { name: 'Delete Shopping', exact: true }).click();
  await expect(page.locator('.expense-table tbody tr')).toHaveCount(0);
  await page.getByRole('button', { name: 'Monthly budgets', exact: true }).click();
  await page.getByRole('button', { name: /Make it your own/ }).click();
  await page.getByRole('textbox', { name: 'Category name', exact: true }).fill('Books & learning');
  await page.getByRole('spinbutton', { name: 'Monthly budget (INR)', exact: true }).fill('500');
  await page.getByRole('button', { name: 'Add category', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Books & learning', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('.balance-card .stat-value')).toHaveText('₹3,500');
  await page.getByRole('button', { name: 'Monthly budgets', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Books & learning', exact: true })).toBeVisible();
});

test('expenses use category labels without a description field in add or edit', async ({ page }) => {
  await startFresh(page);
  await setUpSalaryPlan(page);
  await page.getByRole('button', { name: 'Add expense', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('textbox', { name: /^What was it for/ })).toHaveCount(0);
  await expect(dialog.locator('input[name="title"]')).toHaveCount(0);
  await expect(dialog.getByRole('combobox', { name: 'Category', exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Date', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'A little note (optional)', exact: true })).toBeVisible();
  await dialog.getByRole('spinbutton', { name: 'Amount (INR)', exact: true }).fill('40');
  await dialog.getByRole('button', { name: 'Save expense', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await addExpense(page, '', '60.25', 'groceries');

  await page.getByRole('button', { name: 'Transactions', exact: true }).click();
  await expect(page.locator('.expense-table tbody tr')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Edit Food & coffee', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit Groceries', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit Food & coffee', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: /^What was it for/ })).toHaveCount(0);
  await expect(dialog.locator('input[name="title"]')).toHaveCount(0);
  await dialog.getByRole('combobox', { name: 'Category', exact: true }).selectOption('transport');
  await dialog.getByRole('spinbutton', { name: 'Amount (INR)', exact: true }).fill('45');
  await dialog.getByRole('textbox', { name: 'A little note (optional)', exact: true }).fill('Bus home');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit Transport', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit Food & coffee', exact: true })).toHaveCount(0);
  await expect(page.locator('.expense-table tbody')).toContainText('Bus home');

  await page.reload();
  await expect(page.locator('.balance-card .stat-value')).toHaveText('₹3,394.75');
  await page.getByRole('button', { name: 'Transactions', exact: true }).click();
  await expect(page.locator('.expense-table tbody tr')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Edit Transport', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit Groceries', exact: true })).toBeVisible();
  await expect(page.locator('.expense-table tbody')).toContainText('₹60.25');
  await expect(page.locator('.expense-table tbody')).toContainText('Bus home');
});

test('recurring category budgets apply across months while specific month changes stay independent', async ({ page }) => {
  await startFresh(page);
  await setUpSalaryPlan(page);
  const current = await page.getByLabel('Selected month', { exact: true }).inputValue();
  const next = followingMonth(current, 1);
  const later = followingMonth(current, 2);
  // HTML month inputs have no consistent implicit role across browsers.
  const selectMonth = async (month: string) => page.getByLabel('Selected month', { exact: true }).fill(month);

  await page.getByRole('button', { name: 'Edit budgets', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'All months', exact: true })).toBeChecked();
  await page.getByRole('spinbutton', { name: 'Food & coffee budget', exact: true }).fill('1000');
  await page.getByRole('spinbutton', { name: 'Groceries budget', exact: true }).fill('1500');
  await page.getByRole('button', { name: 'Save budgets', exact: true }).click();

  await selectMonth(next);
  await page.getByRole('button', { name: 'Edit budgets', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Food & coffee budget', exact: true })).toHaveValue('1000');
  await expect(page.getByRole('spinbutton', { name: 'Groceries budget', exact: true })).toHaveValue('1500');
  await page.getByRole('radio', { name: 'Only this month', exact: true }).check();
  await page.getByRole('spinbutton', { name: 'Food & coffee budget', exact: true }).fill('500');
  await page.getByRole('button', { name: 'Save budgets', exact: true }).click();

  await selectMonth(later);
  await expectCategoryBudget(page, 'Food & coffee', '1000');
  await selectMonth(current);
  await page.getByRole('button', { name: 'Edit budgets', exact: true }).click();
  await page.getByRole('radio', { name: 'All months', exact: true }).check();
  await page.getByRole('spinbutton', { name: 'Food & coffee budget', exact: true }).fill('1200');
  await page.getByRole('button', { name: 'Save budgets', exact: true }).click();
  await expect(page.locator('.balance-card .stat-value')).toHaveText('₹3,500');
  await selectMonth(next);
  await expectCategoryBudget(page, 'Food & coffee', '500');
  await selectMonth(later);
  await expectCategoryBudget(page, 'Food & coffee', '1200');

  await page.reload();
  await selectMonth(next);
  await expectCategoryBudget(page, 'Food & coffee', '500');
  await selectMonth(later);
  await expectCategoryBudget(page, 'Food & coffee', '1200');
  await selectMonth(next);
  await page.getByRole('button', { name: 'Monthly budgets', exact: true }).click();
  await page.getByRole('button', { name: 'Use recurring budgets', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Use recurring budgets', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: /^Spends/ }).click();
  await expectCategoryBudget(page, 'Food & coffee', '1200');
  await selectMonth(current);
  await expect(page.locator('.balance-card .stat-value')).toHaveText('₹3,500');
  await page.getByRole('tab', { name: /^Saves/ }).click();
  await expect(page.getByTestId('savings-balance')).toHaveText('₹2,000');
  await expect(page.locator('.savings-ledger-row')).toHaveCount(1);
});

test('phone layout keeps salary, savings actions, and settings accessible', async ({ page }) => {
  await startFresh(page);
  await setUpSalaryPlan(page);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: 'Add expense', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).first().click();
  await page.getByLabel('Display currency').selectOption('GBP');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.locator('.balance-card .stat-value')).toHaveText('£3,500');
  await page.getByRole('tab', { name: /^Saves/ }).click();
  await expect(page.getByTestId('savings-balance')).toHaveText('£2,000');
  await page.getByRole('button', { name: 'Add money', exact: true }).click();
  await expect(page.getByRole('form', { name: 'Add money to savings', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('spinbutton', { name: 'Savings amount (GBP)', exact: true }).fill('50');
  await page.getByRole('button', { name: 'Save deposit', exact: true }).click();
  await expect(page.getByTestId('savings-balance')).toHaveText('£2,050');
  await page.getByRole('tab', { name: /^Spends/ }).click();
  await page.getByRole('button', { name: 'Add expense', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.balance-card .stat-value')).toHaveText('£3,500');
  await page.getByRole('tab', { name: /^Saves/ }).click();
  await expect(page.getByTestId('savings-balance')).toHaveText('£2,050');
});
