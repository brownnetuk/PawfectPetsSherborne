import { SortIcon } from './icons';

// A clickable `<th>` that toggles sort on the given key and shows the shared
// up/down caret indicator (faint on inactive columns, darkened on the active
// one in whichever direction it's currently sorted).
export default function SortableTh<K extends string>({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
}: {
  label: string;
  sortKey: K;
  activeKey: K;
  dir: 'asc' | 'desc';
  onSort: (key: K) => void;
}) {
  return (
    <th onClick={() => onSort(sortKey)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
      {label}
      <SortIcon direction={activeKey === sortKey ? dir : null} />
    </th>
  );
}
