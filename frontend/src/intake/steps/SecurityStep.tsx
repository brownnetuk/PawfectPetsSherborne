import { TextField, ToggleField } from '../fields';
import type { SecurityData } from '../../types';

interface Props {
  value: SecurityData;
  onChange: (value: SecurityData) => void;
}

export default function SecurityStep({ value, onChange }: Props) {
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
        label="Alarm instructions"
        value={value.alarmInstructions ?? ''}
        onChange={(v) => set('alarmInstructions', v)}
        multiline
        hint="Stored encrypted — only accessible to authorised staff when needed."
      />
      <TextField
        label="Any further information"
        value={value.furtherInformation ?? ''}
        onChange={(v) => set('furtherInformation', v)}
        multiline
      />
    </div>
  );
}
