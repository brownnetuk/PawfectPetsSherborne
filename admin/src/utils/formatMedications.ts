// One line per medication, e.g. "Metacam (arthritis) -- 1ml, once daily --
// vet prescribed, we administer -- with food".
export function formatMedications(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return (value as Record<string, unknown>[])
    .filter((m) => m && m.name)
    .map((m) => {
      const parts = [
        m.illnessTreating ? `${m.name} (${m.illnessTreating})` : String(m.name),
        [m.dosage, m.frequency].filter(Boolean).join(', '),
        [m.vetPrescribed ? 'vet prescribed' : '', m.administeredByPawfectPets ? 'we administer' : '']
          .filter(Boolean)
          .join(', '),
        m.additionalInfo ? String(m.additionalInfo) : '',
      ];
      return parts.filter(Boolean).join(' -- ');
    })
    .join('\n');
}
