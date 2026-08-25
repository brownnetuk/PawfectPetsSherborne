import AddPetFlow from './intake/AddPetFlow';
import IntakeForm from './intake/IntakeForm';
import FormFillPage from './forms/FormFillPage';
import DocumentView from './documents/DocumentView';

function parseUrl(): {
  customerId: string | null;
  addPet: boolean;
  formSubmissionId: string | null;
  documentKind: 'invoice' | 'quote' | null;
  documentId: string | null;
} {
  const formMatch = window.location.pathname.match(/^\/forms\/([a-fA-F0-9]{24})\/?$/);
  if (formMatch) {
    return { customerId: null, addPet: false, formSubmissionId: formMatch[1], documentKind: null, documentId: null };
  }
  const invoiceMatch = window.location.pathname.match(/^\/invoices\/([a-fA-F0-9]{24})\/?$/);
  if (invoiceMatch) {
    return { customerId: null, addPet: false, formSubmissionId: null, documentKind: 'invoice', documentId: invoiceMatch[1] };
  }
  const quoteMatch = window.location.pathname.match(/^\/quotes\/([a-fA-F0-9]{24})\/?$/);
  if (quoteMatch) {
    return { customerId: null, addPet: false, formSubmissionId: null, documentKind: 'quote', documentId: quoteMatch[1] };
  }
  const addPetMatch = window.location.pathname.match(/^\/intake\/([a-fA-F0-9]{24})\/add-pet\/?$/);
  if (addPetMatch) {
    return { customerId: addPetMatch[1], addPet: true, formSubmissionId: null, documentKind: null, documentId: null };
  }
  const match = window.location.pathname.match(/^\/intake\/([a-fA-F0-9]{24})\/?$/);
  return { customerId: match ? match[1] : null, addPet: false, formSubmissionId: null, documentKind: null, documentId: null };
}

export default function App() {
  const { customerId, addPet, formSubmissionId, documentKind, documentId } = parseUrl();

  return (
    <div className="page">
      <div className="brand-header">PawfectPets Sherborne</div>
      {documentKind && documentId ? (
        <DocumentView kind={documentKind} id={documentId} />
      ) : formSubmissionId ? (
        <FormFillPage submissionId={formSubmissionId} />
      ) : addPet && customerId ? (
        <AddPetFlow customerId={customerId} />
      ) : (
        <IntakeForm customerId={customerId} />
      )}
    </div>
  );
}
