import { useState } from 'react';
import TrainingComplianceTab from '../components/TrainingComplianceTab';
import TrainingModulesTab from '../components/TrainingModulesTab';

type Tab = 'modules' | 'compliance';

const TAB_LABELS: Record<Tab, string> = {
  modules: 'Modules',
  compliance: 'Audit & Compliance',
};

export default function StaffTrainingPage() {
  const [tab, setTab] = useState<Tab>('modules');

  return (
    <div>
      <div className="page-header">
        <h1>Training Admin</h1>
      </div>
      <div className="tabs">
        {(['modules', 'compliance'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>
      {tab === 'modules' && <TrainingModulesTab />}
      {tab === 'compliance' && <TrainingComplianceTab />}
    </div>
  );
}
