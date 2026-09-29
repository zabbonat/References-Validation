/**
 * Accents that PDF text extraction separates from their letters. LaTeX sets
 * an accent over a letter, and the text layer of many PDFs records the two as
 * separate characters, so that "Röst" is extracted as "R¨ost" and "Nešić" as
 * "Neˇsi´c". Compatibility decomposition turns most of these spacing forms
 * into a space followed by a combining mark, which would split the word in
 * two; the caron and the circumflex are modifier letters and would stay in the
 * word as letters. They are removed before any other normalization, and the
 * letter then compares equal to the accented letter of the record.
 */
export const dropSpacingAccents = (s: string): string =>
    (s || '').replace(/[\u00a8\u00af\u00b4\u00b8\u02c6-\u02dd]/g, '');

/**
 * Canonical folding for comparing titles and names across sources.
 *
 * Compatibility decomposition (NFKD) resolves typographic ligatures such as
 * U+FB01 into their constituent letters, and full-width or superscript forms
 * into plain ones. Combining marks are then dropped, so accented letters
 * compare equal to their base letters. Finally every character that is not a
 * letter or a digit, in any script, is removed.
 *
 * The previous normalization used canonical decomposition (NFD) and the
 * ASCII-only \w class, which deleted ligature glyphs instead of resolving them
 * and deleted every letter outside the Latin alphabet, so that a title in
 * Greek, Cyrillic or Chinese compared as an empty string.
 */
export const foldText = (s: string): string =>
    dropSpacingAccents(s)
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
