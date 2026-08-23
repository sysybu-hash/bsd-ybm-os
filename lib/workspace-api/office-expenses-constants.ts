/**
 * Pure office-expenses constants — no Prisma, safe in client bundles.
 *
 * Split out of `./office-expenses.ts` during the Next 16 upgrade: that module
 * imports `lib/prisma.ts`, and `hooks/use-office-expenses-list.ts` only wanted
 * the page size. Webpack tree-shook the Prisma import; Turbopack does not.
 */
export const OFFICE_EXPENSES_PAGE_SIZE = 30;
export const OFFICE_EXPENSES_MAX_PAGE_SIZE = 100;
