import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FilterIcon, SortIcon } from './icons';

// SortableTh plus a funnel button that opens a small filter popover under the
// header. The popover's contents are whatever controls the page passes as
// children; `active` just darkens the funnel so a filtered column is obvious
// even with the popover closed.
export default function FilterableTh<K extends string>({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  active,
  align = 'left',
  children,
}: {
  label: string;
  sortKey: K;
  activeKey: K;
  dir: 'asc' | 'desc';
  onSort: (key: K) => void;
  active: boolean;
  align?: 'left' | 'right';
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLTableCellElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <th ref={ref} style={{ position: 'relative', userSelect: 'none' }}>
      {/* Label is allowed to wrap (as the plain headers do) while the sort
          caret and funnel stay together beside it. */}
      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
        <span onClick={() => onSort(sortKey)} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
          {label}
          <span style={{ display: 'inline-flex', flexShrink: 0 }}>
            <SortIcon direction={activeKey === sortKey ? dir : null} />
          </span>
        </span>
        <button
          type="button"
          className={`th-filter-btn${active ? ' active' : ''}`}
          onClick={() => setOpen((o) => !o)}
          aria-label={`Filter by ${label}`}
          title={`Filter by ${label}`}
        >
          <FilterIcon />
        </button>
      </span>
      {open && <div className={`th-filter-popover th-filter-popover-${align}`}>{children}</div>}
    </th>
  );
}
