# Pocket

A personal expense tracker with Spends and Saves: plan your salary, track everyday spending, build savings, and reward yourself with what is left over.

## Run locally

Use Node.js 22.12+ (Node 24 recommended).

```sh
npm ci
npm run dev
```

```sh
npm run build     # TypeScript check and production build
npm test          # Finance and persistence tests
npm run preview   # Serve the production build
```

## Your monthly routine

1. In **Spends**, set a monthly salary plan. The suggested plan is 12,500 salary minus 4,000 for parents, 3,000 rent, and 2,000 savings, leaving **3,500 to spend**. Salary, fixed costs, and savings are editable. Fixed costs are reserved in this plan; do not enter them again as everyday expenses.
2. Set category guides in **Monthly budgets**. Choose **All months** to repeat the amounts automatically, or **Only this month** for a month-specific exception. Later recurring-budget changes preserve custom months and closed months. **Use recurring budgets** removes an open month's exception. Existing saved monthly budgets are retained during the update. Category guides are flexible: going over the food guide is fine if the overall total is still within 3,500. Editing them does not increase a salary-based allowance.
3. Log expenses as you go. New expenses use their category name as the transaction label automatically. There is no description field; existing descriptions are preserved when editing older entries. Amount, category, and date are required. Search, edit, delete, and export monthly transactions as CSV.
4. In **Saves**, the monthly savings contribution is credited once for each due month. Add an extra deposit for a windfall, or record a withdrawal from unallocated savings or a savings goal. Withdrawals do not automatically increase the spending allowance.
5. Allocate existing savings to goals. Allocated money remains part of the same total balance; it is never counted twice. You can also deposit new money directly to a goal.
6. Once all spending is recorded, close the month in **Rewards** or **Monthly budgets**. Pocket moves `max(0, spending allowance − everyday expenses)` to the rewards pool once and locks that month's budgets and expenses. A 3,500 allowance minus 3,000 spent adds 500 to rewards; fixed costs and savings are excluded. Overspending adds zero rewards.
7. Allocate rewards toward wishlist goals. Allocations deduct from the available rewards pool, separate from savings.

The app starts with clearly labelled sample data. Choose **Settings → Clear all data** to begin with zero balances and then save your monthly plan. This is irreversible and requires a second confirmation. Display currency is configurable; changing it does not convert amounts.

## Data and scope

Data persists in this browser's local storage under `pocket-state-v1` (the key is retained for compatibility). Existing records from the original app migrate without clearing expenses, monthly budgets, rewards, or goals. Previous savings-goal balances become an opening savings balance, preserving their allocations. A salary plan is not imposed on existing records; save one explicitly to begin recurring savings.

There is no login, cloud sync, bank connection, or automatic bank transfer. Savings and reward transfers are bookkeeping entries. Clearing browser data removes local records. CSV export contains the selected month's expenses, not a full backup of savings, goals, and budgets.

Automatic savings are processed when you open Pocket, return to its tab, or keep it open across a month boundary. Due months since the plan began are caught up once; future months are not credited early. A browser-only app cannot run bank transactions while closed. Historical monthly salary plans stay fixed when future plans change. Updating the current month's savings adjusts its existing monthly credit; reductions that would invalidate allocations or make the balance negative are rejected. Amounts are stored as integer minor units.

## Browser tests

```sh
npx playwright install chromium
npm run test:e2e
```

With an existing system Chromium installation:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
```

Browser tests cover salary plans, flexible category guides, automatic savings, deposits, withdrawals, goal allocations, rewards, migration, persistence, transactions, and the mobile interface.
