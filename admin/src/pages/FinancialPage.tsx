import { useState } from 'react';
import * as api from '../api/client';
import NamedListCard from '../components/NamedListCard';

type Tab = 'bank' | 'payments';

export default function FinancialPage() {
  const [tab, setTab] = useState<Tab>('bank');

  return (
    <div>
      <div className="page-header">
        <h1>Financial</h1>
      </div>

      <div className="tabs">
        <button className={tab === 'bank' ? 'active' : ''} onClick={() => setTab('bank')}>
          Bank Account
        </button>
        <button className={tab === 'payments' ? 'active' : ''} onClick={() => setTab('payments')}>
          Payments
        </button>
      </div>

      {tab === 'bank' && (
        <NamedListCard
          title="Bank Accounts"
          description="Account/sort code details and reconciliation come in a later build."
          itemNoun="bank account"
          namePlaceholder="e.g. Current Account"
          list={api.listBankAccounts}
          create={api.createBankAccount}
          update={api.updateBankAccount}
          remove={api.deleteBankAccount}
        />
      )}

      {tab === 'payments' && (
        <NamedListCard
          title="Payments"
          description="Amounts, dates, payment methods, and invoice links come in a later build."
          itemNoun="payment"
          namePlaceholder="e.g. Payment from James Brown"
          list={api.listPayments}
          create={api.createPayment}
          update={api.updatePayment}
          remove={api.deletePayment}
        />
      )}
    </div>
  );
}
