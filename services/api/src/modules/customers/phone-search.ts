/**
 * The part of a phone number that is the same however it was typed or stored: "0300 1234567", "+92 300 1234567",
 * "923001234567" and "0092-300-1234567" all give "3001234567". Searching for this part finds the number in any of
 * those formats. Returns "" when there is too little to search by (fewer than 3 digits after the country code).
 */
export function phoneSearchCore(input: string): string {
  let digits = input.replace(/\D/g, "");
  // A "+" or "00" in front means the country code was typed on purpose, even if the rest is not finished yet.
  const international = input.trim().startsWith("+") || digits.startsWith("00");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("92") && (international || digits.length >= 11)) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = digits.slice(1);
  // Too short to be useful: "0300" (core "300") is the least we search on.
  const typed = input.replace(/\D/g, "");
  if (typed.length < 4 && !international) return "";
  return digits.length >= 3 ? digits : "";
}
