interface Props {
  name: string;
  isLead: boolean;
  existingPetCount?: number;
}

export default function WelcomeStep({ name, isLead, existingPetCount = 0 }: Props) {
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
      {existingPetCount > 0 && (
        <p className="field-hint">
          You have {existingPetCount} pet{existingPetCount > 1 ? 's' : ''} on file — we'll show
          you their details to review and update, and ask afterwards if you'd like to add any
          more.
        </p>
      )}
    </div>
  );
}
