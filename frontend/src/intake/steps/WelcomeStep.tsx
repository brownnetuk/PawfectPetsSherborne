import type { AnimalSummary } from '../../types';

interface Props {
  name: string;
  isLead: boolean;
  existingPets?: AnimalSummary[];
}

export default function WelcomeStep({ name, isLead, existingPets = [] }: Props) {
  return (
    <div>
      <h1>Welcome{name ? `, ${name}` : ''}</h1>
      <p className="subtitle">
        {isLead
          ? "We've pre-filled what we already have on file — please check it over and update anything that's changed."
          : 'Complete this form so we can look after your pet. Takes about 5 minutes.'}
      </p>
      {!isLead && (
        <p className="field-hint">
          We couldn't find an existing record for this link, so you're starting a fresh
          registration — just fill in your details as you go.
        </p>
      )}
      {existingPets.length > 0 && (
        <p className="field-hint">
          You have {existingPets.length} pet{existingPets.length > 1 ? 's' : ''} on file (
          {existingPets.map((p) => p.name).join(', ')}) — we'll skip past re-entering them. To add
          another pet or update one already on file, get in touch with us directly.
        </p>
      )}
    </div>
  );
}
