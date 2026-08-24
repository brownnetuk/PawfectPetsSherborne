import { TextField } from '../fields';
import type { SecurityData } from '../../types';

interface Props {
  value: SecurityData;
  onChange: (value: SecurityData) => void;
}

export default function FurtherInfoStep({ value, onChange }: Props) {
  return (
    <div>
      <h2>Additional information</h2>
      <p className="subtitle">Anything else we should know before your pet's visit?</p>
      <TextField
        label="Any further information"
        value={value.furtherInformation ?? ''}
        onChange={(v) => onChange({ ...value, furtherInformation: v })}
        multiline
      />
    </div>
  );
}
