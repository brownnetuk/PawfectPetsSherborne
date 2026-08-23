import AddPetFlow from './intake/AddPetFlow';
import IntakeForm from './intake/IntakeForm';
import FormFillPage from './forms/FormFillPage';

function parseUrl(): { customerId: string | null; addPet: boolean; formSubmissionId: string | null } {
  const formMatch = window.location.pathname.match(/^\/forms\/([a-fA-F0-9]{24})\/?$/);
  if (formMatch) return { customerId: null, addPet: false, formSubmissionId: formMatch[1] };
  const addPetMatch = window.location.pathname.match(/^\/intake\/([a-fA-F0-9]{24})\/add-pet\/?$/);
  if (addPetMatch) return { customerId: addPetMatch[1], addPet: true, formSubmissionId: null };
  const match = window.location.pathname.match(/^\/intake\/([a-fA-F0-9]{24})\/?$/);
  return { customerId: match ? match[1] : null, addPet: false, formSubmissionId: null };
}

export default function App() {
  const { customerId, addPet, formSubmissionId } = parseUrl();

  return (
    <div className="page">
      <div className="brand-header">PawfectPets Sherborne</div>
      {formSubmissionId ? (
        <FormFillPage submissionId={formSubmissionId} />
      ) : addPet && customerId ? (
        <AddPetFlow customerId={customerId} />
      ) : (
        <IntakeForm customerId={customerId} />
      )}
    </div>
  );
}
