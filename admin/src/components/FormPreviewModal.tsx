import FormPreviewBody from './FormPreviewBody';
import type { FormField } from '../types';
import Modal from './Modal';

interface Props {
  name: string;
  description: string;
  fields: FormField[];
  onClose: () => void;
  /** Shows a "Send" button alongside Close -- omitted when previewing mid-edit (FormBuilder), where there's no specific recipient to send to yet. */
  onSend?: () => void;
}

export default function FormPreviewModal({ name, description, fields, onClose, onSend }: Props) {
  return (
    <Modal title="Preview" onClose={onClose} xl>
      <p className="hint">This is a preview for your own sanity-check -- nothing entered here is saved.</p>
      <FormPreviewBody name={name} description={description} fields={fields} />

      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={onClose}>
          Close
        </button>
        {onSend && (
          <button className="btn btn-primary" onClick={onSend}>
            Send
          </button>
        )}
      </div>
    </Modal>
  );
}
