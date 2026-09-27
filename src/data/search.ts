export function matchesSearch(query: string, fields: string[]): boolean {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  const text = normalize(fields.join(' '));
  return terms.every(term => text.includes(term));
}
