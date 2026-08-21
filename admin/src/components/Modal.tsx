import type { ReactNode } from 'react';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  xl?: boolean;
  headerActions?: ReactNode;
}

export default function Modal({ title, onClose, children, wide, xl, headerActions }: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`modal${wide ? ' modal-wide' : ''}${xl ? ' modal-xl' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {headerActions ? (
          <div className="modal-header-row">
            <h2>{title}</h2>
            {headerActions}
          </div>
        ) : (
          <h2>{title}</h2>
        )}
        {children}
      </div>
    </div>
  );
}
