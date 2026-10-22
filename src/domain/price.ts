/** Formats a cent amount as a dollar label: 500 -> "$5", 750 -> "$7.50". */
export function formatPrice(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}
