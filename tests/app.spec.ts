import { test, expect } from '@playwright/test';

test('budgets, expenses, independent savings, and one-time rewards survive a reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).last().click();
  await page.getByRole('button', { name: 'Clear all data', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, clear everything', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('button', { name: 'Monthly budgets', exact: true }).click();
  await page.getByRole('button', { name: 'Set monthly budgets', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Food & coffee budget', exact: true }).fill('8000');
  await page.getByRole('button', { name: 'Save budgets', exact: true }).click();

  await page.getByRole('button', { name: 'Savings & goals', exact: true }).click();
  await page.getByRole('button', { name: 'New savings goal', exact: true }).click();
  await page.getByRole('textbox', { name: 'Goal name', exact: true }).fill('Rainy day');
  await page.getByRole('spinbutton', { name: 'Target amount (INR)', exact: true }).fill('10000');
  await page.getByRole('button', { name: 'Create goal', exact: true }).click();
  await page.getByRole('button', { name: 'Add money', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Amount to add (INR)', exact: true }).fill('2000');
  await page.getByRole('button', { name: 'Record savings', exact: true }).click();

  await page.getByRole('button', { name: 'Add expense', exact: true }).click();
  await page.getByRole('textbox', { name: 'What was it for?', exact: true }).fill('Monthly spending');
  await page.getByRole('spinbutton', { name: 'Amount (INR)', exact: true }).fill('7500');
  await page.getByRole('button', { name: 'Save expense', exact: true }).click();
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(page.locator('.balance-card .stat-value')).toHaveText('₹500');
  await expect(page.locator('.stats-grid .stat-card').nth(2).locator('.stat-value')).toHaveText('₹2,000');

  await page.getByRole('button', { name: 'Transactions', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Monthly spending', exact: true }).click();
  await page.getByRole('textbox', { name: 'What was it for?', exact: true }).fill('Everyday spending');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Everyday spending', { exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/^pocket-expenses-\d{4}-\d{2}\.csv$/);

  await page.getByRole('button', { name: 'Rewards', exact: true }).click();
  await page.getByRole('button', { name: 'Close month & move the rest', exact: true }).click();
  await page.getByRole('button', { name: 'Close & transfer', exact: true }).click();
  await expect(page.locator('.rewards-hero-total')).toContainText('₹500');
  await expect(page.getByRole('button', { name: 'Month closed', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'New reward goal', exact: true }).click();
  await page.getByRole('textbox', { name: 'Goal name', exact: true }).fill('Coffee grinder');
  await page.getByRole('spinbutton', { name: 'Target amount (INR)', exact: true }).fill('1000');
  await page.getByRole('button', { name: 'Create goal', exact: true }).click();
  await page.getByRole('button', { name: 'Allocate', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Amount to add (INR)', exact: true }).fill('300');
  await page.getByRole('button', { name: 'Allocate rewards', exact: true }).click();
  await expect(page.locator('.rewards-hero-total')).toContainText('₹200');

  await page.reload();
  await expect(page.locator('.balance-card .stat-value')).toHaveText('₹500');
  await expect(page.locator('.stats-grid .stat-card').nth(2).locator('.stat-value')).toHaveText('₹2,000');
  await expect(page.locator('.stats-grid .stat-card').nth(3).locator('.stat-value')).toHaveText('₹200');
  await expect(page.getByRole('button', { name: 'Add expense', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Rewards', exact: true }).click();
  await expect(page.locator('.history-row')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Month closed', exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('expense validation, search, delete, and custom categories', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add expense', exact: true }).click();
  await page.getByRole('textbox', { name: 'What was it for?', exact: true }).fill('Bookshop purchase');
  await page.getByRole('spinbutton', { name: 'Amount (INR)', exact: true }).fill('299.50');
  await page.getByRole('button', { name: 'Save expense', exact: true }).click();
  await page.getByRole('button', { name: 'Transactions', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search transactions', exact: true }).fill('Bookshop purchase');
  await expect(page.locator('.expense-table tbody tr')).toHaveCount(1);
  await expect(page.locator('.expense-table tbody')).toContainText('₹299.5');
  await page.getByRole('button', { name: 'Delete Bookshop purchase', exact: true }).click();
  await expect(page.locator('.expense-table tbody tr')).toHaveCount(0);
  await page.getByRole('button', { name: 'Monthly budgets', exact: true }).click();
  await page.getByRole('button', { name: /Make it your own/ }).click();
  await page.getByRole('textbox', { name: 'Category name', exact: true }).fill('Books & learning');
  await page.getByRole('spinbutton', { name: 'Monthly budget (INR)', exact: true }).fill('500');
  await page.getByRole('button', { name: 'Add category', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Books & learning', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Monthly budgets', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Books & learning', exact: true })).toBeVisible();
});

test('phone layout keeps core actions and settings accessible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Add expense', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Settings', exact: true }).first().click();
  await page.getByLabel('Display currency').selectOption('GBP');
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.locator('.balance-card .stat-value')).toContainText('£');
  await page.reload();
  await expect(page.locator('.balance-card .stat-value')).toContainText('£');
  await page.getByRole('button', { name: 'Add expense', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
