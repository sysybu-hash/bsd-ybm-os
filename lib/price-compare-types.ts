export type PriceCompareRow = {
  normalizedKey: string;
  description: string;
  bestUnitPrice: number;
  bestSupplier: string | null;
  latestUnitPrice: number;
  latestSupplier: string | null;
  latestAt: string;
  cheaperAlternative: boolean;
  savingsIfBuyAtBest: number;
};
