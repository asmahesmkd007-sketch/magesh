import fs from "fs";
import path from "path";

const schemaPath = path.resolve("supabase/schema.sql");
const content = fs.readFileSync(schemaPath, "utf-8");
const lines = content.split("\n");

console.log(`Total lines: ${lines.length}`);

// Find safe section boundaries (lines starting with '-- SECTION' or '-- ===')
const safeBreakPoints = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (line.startsWith("-- SECTION") || line.startsWith("-- ===")) {
    safeBreakPoints.push(i);
  }
}

// Split into chunks of approx 3500-4500 lines at safe section boundaries
const chunks = [];
let currentStart = 0;
const targetChunkLines = 4000;

while (currentStart < lines.length) {
  let targetEnd = currentStart + targetChunkLines;
  if (targetEnd >= lines.length) {
    chunks.push({ start: currentStart, end: lines.length });
    break;
  }
  
  // Find closest safe break point after or near targetEnd
  let bestBreak = safeBreakPoints.find((bp) => bp >= targetEnd - 500 && bp <= targetEnd + 1000);
  if (!bestBreak) {
    // Fallback: find any line after targetEnd that is empty and follows a semicolon
    for (let j = targetEnd; j < lines.length; j++) {
      if (lines[j].trim() === "" && j > 0 && lines[j - 1].trim().endsWith(";")) {
        bestBreak = j;
        break;
      }
    }
  }
  
  const end = bestBreak ?? Math.min(targetEnd, lines.length);
  chunks.push({ start: currentStart, end });
  currentStart = end;
}

// Clean up old part files
const files = fs.readdirSync("supabase");
for (const file of files) {
  if (file.startsWith("schema_part")) {
    fs.unlinkSync(path.join("supabase", file));
  }
}

// Write new clean chunks
chunks.forEach((chunk, i) => {
  const chunkLines = lines.slice(chunk.start, chunk.end);
  const chunkContent = chunkLines.join("\n");
  const partPath = path.resolve(`supabase/schema_part${i + 1}.sql`);
  fs.writeFileSync(partPath, chunkContent, "utf-8");
  console.log(
    `Wrote ${partPath}: lines ${chunk.start + 1} to ${chunk.end} (${(chunkContent.length / 1024).toFixed(1)} KB)`
  );
});
