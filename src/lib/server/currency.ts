import { pool } from '@/lib/db';

export const SUPPORTED_CURRENCIES = ['EUR', 'USD', 'TRY'] as const;
export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];

export async function getExchangeRate(from: SupportedCurrency, to: SupportedCurrency, date = new Date()) {
  if (from === to) return 1;
  const result = await pool.query(
    `SELECT rate FROM exchange_rates WHERE from_currency=$1 AND to_currency=$2 AND rate_date <= $3 ORDER BY rate_date DESC LIMIT 1`,
    [from, to, date.toISOString().slice(0, 10)]
  );
  if (result.rows[0]) return Number(result.rows[0].rate);

  const inverse = await pool.query(
    `SELECT rate FROM exchange_rates WHERE from_currency=$1 AND to_currency=$2 AND rate_date <= $3 ORDER BY rate_date DESC LIMIT 1`,
    [to, from, date.toISOString().slice(0, 10)]
  );
  if (inverse.rows[0]) return 1 / Number(inverse.rows[0].rate);
  throw new Error(`Exchange rate not found: ${from}/${to}`);
}

export async function convertAmount(amount: number, from: SupportedCurrency, to: SupportedCurrency, date = new Date()) {
  const rate = await getExchangeRate(from, to, date);
  return { amount: amount * rate, rate };
}
