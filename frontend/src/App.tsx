import AddPetFlow from './intake/AddPetFlow';
import IntakeForm from './intake/IntakeForm';

function parseUrl(): { customerId: string | null; addPet: boolean } {
  const addPetMatch = window.location.pathname.match(/^\/intake\/([a-fA-F0-9]{24})\/add-pet\/?$/);
  if (addPetMatch) return { customerId: addPetMatch[1], addPet: true };
  const match = window.location.pathname.match(/^\/intake\/([a-fA-F0-9]{24})\/?$/);
  return { customerId: match ? match[1] : null, addPet: false };
}

export default function App() {
  const { customerId, addPet } = parseUrl();

  return (
    <div className="page">
      <div className="brand-header">PawfectPets Sherborne</div>
      {addPet && customerId ? (
        <AddPetFlow customerId={customerId} />
      ) : (
        <IntakeForm customerId={customerId} />
      )}
    </div>
  );
}
