const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
const arabicDigits = "٠١٢٣٤٥٦٧٨٩";

/**
 * Converts Persian (۰-۹) and Arabic-Indic (٠-٩) numerals to ASCII digits.
 *
 * Shared by every user-supplied identifier in the product (national ID, mobile,
 * admission number) so Persian keyboard input never fails validation or
 * comparison against stored ASCII values.
 */
export function toAsciiDigits(value: string) {
  return [...value].map((character) => {
    const persianIndex = persianDigits.indexOf(character);
    if (persianIndex >= 0) return String(persianIndex);
    const arabicIndex = arabicDigits.indexOf(character);
    return arabicIndex >= 0 ? String(arabicIndex) : character;
  }).join("");
}
