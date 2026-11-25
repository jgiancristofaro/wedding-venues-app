/** Hands files dropped anywhere in the app to the Import page (kept in memory, not serialized). */
export interface Handoff {
  files: File[];
  venueId?: string;
}
let pending: Handoff | null = null;
export const setHandoff = (h: Handoff) => {
  pending = h;
};
export const takeHandoff = (): Handoff | null => {
  const h = pending;
  pending = null;
  return h;
};

export type FileKind = 'sheet' | 'doc' | 'unsupported';
export function classifyFile(f: File): FileKind {
  const n = f.name.toLowerCase();
  if (/\.(xlsx|xls|csv|tsv|ods)$/.test(n) || /spreadsheet|excel|csv/.test(f.type)) return 'sheet';
  if (/\.(pdf|png|jpe?g|webp|gif|heic|docx|txt)$/.test(n) || /pdf|image\/|wordprocessingml|text\/plain/.test(f.type)) return 'doc';
  return 'unsupported';
}
