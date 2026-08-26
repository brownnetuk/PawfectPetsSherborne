import { TextField, ToggleField } from '../fields';
import type { SecurityData } from '../../types';

interface Props {
  value: SecurityData;
  onChange: (value: SecurityData) => void;
  resuming?: boolean;
}

export default function SecurityStep({ value, onChange, resuming }: Props) {
  const set = <K extends keyof SecurityData>(key: K, v: SecurityData[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <div>
      <h2>Security arrangements</h2>
      <p className="subtitle">
        So we can get in and out safely if we're visiting your property.
      </p>
      <ToggleField
        label="Keys provided"
        value={value.keysProvided}
        onChange={(v) => set('keysProvided', v)}
      />
      <TextField
        label="Alarm/KeySafe Code"
        value={value.alarmInstructions ?? ''}
        onChange={(v) => set('alarmInstructions', v)}
        multiline
        hint={
          resuming
            ? 'Stored encrypted — only accessible to authorised staff when needed. Leave blank to keep what you already gave us unchanged.'
            : 'Stored encrypted — only accessible to authorised staff when needed.'
        }
      />
    </div>
  );
}
