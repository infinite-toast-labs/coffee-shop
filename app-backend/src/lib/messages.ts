export const normalizeMessage = (value: string) =>
  value.trim().replace(/\s+/g, " ");

export const validateMessage = (value: string) => {
  const normalized = normalizeMessage(value);
  if (!normalized) {
    return { ok: false, error: "Message is required." } as const;
  }
  if (normalized.length > 200) {
    return { ok: false, error: "Message must be 200 characters or less." } as const;
  }
  return { ok: true, value: normalized } as const;
};
