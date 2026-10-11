// A pasted Zillow link -> street address, read from the URL text only (no request to Zillow, no scraping).
// Anything that is not a Zillow home link is returned unchanged.
export function addressFromInput(input) {
  const s = String(input ?? "").trim();
  const m = s.match(/zillow\.com\/homedetails\/([^/?#]+)/i);
  if (!m) return s;
  const parts = decodeURIComponent(m[1]).split("-").filter(Boolean);
  // ...-Austin-TX-78702 -> "<street> Austin, TX 78702"
  if (parts.length >= 3 && /^\d{5}$/.test(parts.at(-1)) && /^[A-Za-z]{2}$/.test(parts.at(-2))) {
    const zip = parts.pop(), state = parts.pop();
    return `${parts.join(" ")}, ${state.toUpperCase()} ${zip}`;
  }
  return parts.join(" ");
}
