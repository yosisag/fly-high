// Personal settings. The home address comes from VITE_HOME in .env.local ("street|number|label"),
// which is never committed — so the public build has no home address at all.
const raw = import.meta.env.VITE_HOME || '';
const [street, number, label] = raw.split('|');
export const HOME = street && number ? { street, number, label: label || 'הבית שלי' } : null;
