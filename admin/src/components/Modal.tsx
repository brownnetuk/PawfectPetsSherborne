import type { ReactNode } from 'react';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  xl?: boolean;
  headerActions?: ReactNode;
  /** Extra class(es) on the modal panel itself -- e.g. for a one-off background/theme. */
  className?: string;
}

export default function Modal({ title, onClose, children, wide, xl, headerActions, className }: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`modal${wide ? ' modal-wide' : ''}${xl ? ' modal-xl' : ''}${className ? ` ${className}` : ''}`}
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
