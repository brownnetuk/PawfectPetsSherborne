import type { BankAccountType } from '../types';

const LABELS: Record<BankAccountType, string> = {
  bank: 'Bank',
  savings: 'Savings',
  pot: 'Pot',
};

export function bankAccountTypeLabel(type: BankAccountType): string {
  return LABELS[type] ?? 'Bank';
}
