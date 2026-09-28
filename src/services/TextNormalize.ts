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
    (s || '')
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, '')
        .trim();
