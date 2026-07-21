export function sanitizeXmlText(value) {
  let sanitized = '';
  let replacing = false;

  for (const character of String(value ?? '')) {
    const codePoint = character.codePointAt(0);
    const allowed =
      codePoint === 0x09 ||
      codePoint === 0x0a ||
      codePoint === 0x0d ||
      (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
      (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
      (codePoint >= 0x10000 && codePoint <= 0x10ffff);

    if (allowed) {
      sanitized += character;
      replacing = false;
    } else if (!replacing) {
      sanitized += ' ';
      replacing = true;
    }
  }

  return sanitized;
}

export function sanitizeStructuredStrings(value) {
  if (typeof value === 'string') return sanitizeXmlText(value);
  if (Array.isArray(value)) return value.map(sanitizeStructuredStrings);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, sanitizeStructuredStrings(child)]),
  );
}
