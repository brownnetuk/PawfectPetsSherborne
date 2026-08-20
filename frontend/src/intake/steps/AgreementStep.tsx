import SignaturePad from '../SignaturePad';
import { TextField } from '../fields';
import type { AgreementData } from '../../types';

interface Props {
  value: AgreementData;
  onChange: (value: AgreementData) => void;
}

const TODAY = new Date().toLocaleDateString('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export default function AgreementStep({ value, onChange }: Props) {
  const set = <K extends keyof AgreementData>(key: K, v: AgreementData[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <div>
      <h2>Client agreement</h2>
      <p className="subtitle">Please read and sign to confirm you accept our terms.</p>

      <div className="terms-box">
        <ol>
          <li>
            The client confirms all information provided in this form is accurate and will
            notify PawfectPets Sherborne promptly of any changes to contact, veterinary, or pet
            health details.
          </li>
          <li>
            The client authorises PawfectPets Sherborne to make decisions regarding the animal's
            welfare in an emergency, including obtaining veterinary treatment as set out in the
            Emergency Vet section of this form.
          </li>
          <li>
            The client is responsible for ensuring vaccinations, flea, and worming treatment are
            up to date for the duration of any care provided.
          </li>
          <li>
            PawfectPets Sherborne will take all reasonable care of the animal but cannot be held
            liable for illness, injury, loss, or death outside of its direct negligence.
          </li>
          <li>
            Where off-lead exercise has been consented to, the client accepts this is undertaken
            at their own risk as described in the Off-Lead Consent section.
          </li>
          <li>
            Any keys or security information (e.g. alarm codes) provided will be stored securely
            and used solely for the purpose of delivering the agreed service.
          </li>
          <li>
            Fees are payable as agreed at time of booking. PawfectPets Sherborne reserves the
            right to decline or discontinue a booking where an animal poses a safety risk not
            disclosed in this form.
          </li>
          <li>
            This agreement remains in effect for all future bookings unless the client notifies
            PawfectPets Sherborne of a change in circumstances.
          </li>
        </ol>
      </div>

      <TextField
        label="Typed signature (full name)"
        value={value.signedName}
        onChange={(v) => set('signedName', v)}
        required
        hint="Your typed name plus today's date acts as your signature."
      />
      <div className="field">
        <label>Or sign with your mouse or finger (optional)</label>
        <SignaturePad value={value.signatureImage} onChange={(sig) => set('signatureImage', sig)} />
      </div>
      <div className="field">
        <label>Date</label>
        <input type="text" value={TODAY} disabled />
      </div>
    </div>
  );
}
