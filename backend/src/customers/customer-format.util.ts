export function formatFullName(firstName?: string, surname?: string): string | undefined {
  const combined = [firstName, surname].filter(Boolean).join(' ').trim();
  return combined || undefined;
}

export function formatAddress(parts: {
  address1?: string;
  address2?: string;
  town?: string;
  county?: string;
  postcode?: string;
}): string | undefined {
  const combined = [parts.address1, parts.address2, parts.town, parts.county, parts.postcode]
    .filter(Boolean)
    .join('\n');
  return combined || undefined;
}
