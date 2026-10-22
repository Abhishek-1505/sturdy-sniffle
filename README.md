# Pocket

A personal expense tracker for monthly category budgets, savings goals, and a little reward for spending mindfully.

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

1. Set category budgets in **Monthly budgets**. Your savings allowance is separate from this spending budget.
2. Add expenses as you go. Search, edit, delete, and export monthly transactions as CSV.
3. Create savings goals and record contributions you've already set aside.
4. Once all spending is recorded, close the month in **Rewards** or **Monthly budgets**. Pocket moves `max(0, total budget − total expenses)` to the rewards pool once and locks that month's budgets and expenses. For example, an 8,000 budget minus 7,500 spent adds 500 to rewards. Overspending doesn't draw down savings or create a negative reward.
5. Allocate rewards toward wishlist goals. Allocations deduct from the available pool.

The app starts with clearly labelled sample data. Choose **Settings → Clear all data** to begin with zero balances. This is irreversible and requires a second confirmation. Display currency is configurable; changing it doesn't convert amounts.

## Data and scope

Data persists in this browser's local storage under `pocket-state-v1`. There is no login, cloud sync, bank connection, or automatic bank transfer. Savings and reward transfers are bookkeeping entries. Clearing browser data removes local records. CSV export contains the selected month's expenses, not a full backup of goals and budgets.

Monthly budgets are independent. New months initially show category defaults; save a monthly budget before closing the month. Existing saved monthly budgets remain stable when you add categories later. Amounts are stored as integer minor units to avoid floating-point accounting errors.

## Browser tests

```sh
npx playwright install chromium
npm run test:e2e
```

With an existing system Chromium installation:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
```

Browser tests cover adding/editing/deleting expenses, search, CSV export, category budgets, independent savings, the 8,000 / 7,500 / 500 rollover, reward allocation, persistence, and the mobile interface.
