import { lookupIfsc } from "../src/lib/ifsc.ts";

const knownCodes = [
  "SBIN0011937",
  "SBIN0000456",
  "HDFC0000001",
  "ICIC0000001",
  "KKBK0000261",
];

console.log("=== VERIFYING KNOWN VALID IFSC CODES ===");

for (const code of knownCodes) {
  console.log(`\n--- Testing ${code} ---`);
  const res = await lookupIfsc(code);
  console.log(`Success: ${res.success}`);
  if (res.success) {
    console.log("Bank Details:", res.details);
  } else {
    console.error("Error:", res.error);
  }
}
