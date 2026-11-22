"use client";

import { useState } from "react";

import { FieldErrors } from "@/components/ui/action-form";
import { Input, Select } from "@/components/ui/field";

import { GUARDIAN_RELATIONSHIPS, GUARDIAN_OTHER_RELATIONSHIP } from "../relationships";

const OTHER_VALUE = "__other__";
const EXISTING_VALUE = "__existing__";

/**
 * Relationship picker: a preset list, with a free-text escape hatch behind
 * `سایر`. A value that is not on the list (a record created before the list
 * existed) is surfaced as an explicit "current value" option so opening the form
 * never silently rewrites it.
 */
export function GuardianRelationshipField({
  value = "",
  onValueChange,
  name = "relationshipType",
  label = "رابطه",
  required = true,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  label?: string;
  required?: boolean;
}) {
  const isPreset = GUARDIAN_RELATIONSHIPS.includes(value as typeof GUARDIAN_RELATIONSHIPS[number]) && value !== GUARDIAN_OTHER_RELATIONSHIP;
  const isOther = value === GUARDIAN_OTHER_RELATIONSHIP;
  const [preset, setPreset] = useState(isPreset ? value : isOther ? OTHER_VALUE : value ? EXISTING_VALUE : "");
  const [custom, setCustom] = useState(isPreset ? "" : isOther ? "" : value);

  // `سایر` stores the user's own wording; the label itself is only the fallback.
  const effectiveValue = preset === OTHER_VALUE || preset === EXISTING_VALUE ? custom.trim() || GUARDIAN_OTHER_RELATIONSHIP : preset;

  function updatePreset(nextPreset: string) {
    const normalizedPreset = nextPreset === GUARDIAN_OTHER_RELATIONSHIP ? OTHER_VALUE : nextPreset;
    setPreset(normalizedPreset);
    if (normalizedPreset === OTHER_VALUE || normalizedPreset === EXISTING_VALUE) onValueChange?.(custom.trim() || GUARDIAN_OTHER_RELATIONSHIP);
    else onValueChange?.(normalizedPreset);
  }

  function updateCustom(nextCustom: string) {
    setCustom(nextCustom);
    onValueChange?.(nextCustom.trim() || GUARDIAN_OTHER_RELATIONSHIP);
  }

  return (
    <div className="grid gap-2 text-sm font-bold text-primary">
      <span className="flex items-center justify-between gap-3">
        <span>{label}</span>
        <FieldErrors name={name} />
      </span>
      <Select name={`${name}Preset`} value={preset} onChange={(event) => updatePreset(event.target.value)} aria-label={label} required={required && !effectiveValue}>
        <option value="">انتخاب رابطه</option>
        {value && !isPreset && !isOther ? <option value={EXISTING_VALUE}>مقدار فعلی: {value}</option> : null}
        {GUARDIAN_RELATIONSHIPS.map((relationship) => <option key={relationship} value={relationship === GUARDIAN_OTHER_RELATIONSHIP ? OTHER_VALUE : relationship}>{relationship}</option>)}
      </Select>
      {preset === OTHER_VALUE || preset === EXISTING_VALUE ? (
        <Input name={`${name}Other`} value={custom} onChange={(event) => updateCustom(event.target.value)} placeholder="رابطه را وارد کنید" aria-label={`${label} سفارشی`} required={required} />
      ) : null}
      <input type="hidden" name={name} value={effectiveValue} />
    </div>
  );
}
