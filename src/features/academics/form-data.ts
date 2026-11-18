export function formDataToObject(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

export function nullableString(value: FormDataEntryValue | null | undefined) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}

export function optionalNumber(value: FormDataEntryValue | null | undefined) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? Number(text) : undefined;
}
