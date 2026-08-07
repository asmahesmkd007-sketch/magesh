import fs from "fs";
import path from "path";

const schemaPath = path.resolve("supabase/schema.sql");
const originalContent = fs.readFileSync(schemaPath, "utf-8");
const originalLines = originalContent.split("\n");

let removedCount = 0;
let shortenedCount = 0;

const cleanedLines = [];
let i = 0;

while (i < originalLines.length) {
  const line = originalLines[i];
  const trimmed = line.trim();

  // 1. Remove banner decoration lines like -- ===... or -- ---... or empty comments --
  if (/^--\s*(=|-){3,}$/.test(trimmed) || /^--\s*$/.test(trimmed)) {
    removedCount++;
    i++;
    continue;
  }

  // 2. Handle Section Headers: -- SECTION 10: FOO -> -- Section 10: Foo
  const sectionMatch = trimmed.match(/^--\s*SECTION\s+(\d+[a-z]?):\s*(.*)$/i);
  if (sectionMatch) {
    const secNum = sectionMatch[1];
    const secTitle = sectionMatch[2].trim();
    cleanedLines.push(`-- Section ${secNum}: ${secTitle}`);
    shortenedCount++;
    i++;
    continue;
  }

  // 3. Handle multi-line comment blocks
  if (trimmed.startsWith("-- ")) {
    // Collect contiguous comment lines
    const commentBlock = [line];
    let j = i + 1;
    while (j < originalLines.length && originalLines[j].trim().startsWith("-- ")) {
      const nextTrimmed = originalLines[j].trim();
      // Stop if next line is a banner or section header
      if (/^--\s*(=|-){3,}$/.test(nextTrimmed) || /^--\s*SECTION/i.test(nextTrimmed)) {
        break;
      }
      commentBlock.push(originalLines[j]);
      j++;
    }

    if (commentBlock.length > 1) {
      // Analyze multi-line comment block
      const fullText = commentBlock
        .map((l) => l.trim().replace(/^--\s*/, ""))
        .join(" ");

      const lower = fullText.toLowerCase();

      // Check if comment is obvious/repetitive/junk/banner
      const isObvious =
        lower.includes("master schema") ||
        lower.includes("safe to run on a fresh") ||
        lower.includes("uses if not exists") ||
        lower.includes("stores all user") ||
        lower.includes("table stores") ||
        lower.includes("default 100") ||
        lower.includes("all writes via rpcs");

      if (isObvious) {
        removedCount += commentBlock.length;
        i = j;
        continue;
      }

      // Shorten important multi-line comment block to 1-2 concise lines
      let shortSummary = "";
      if (lower.includes("is_admin") || lower.includes("current caller an admin")) {
        shortSummary = "-- Helper: Check if current caller has admin role";
      } else if (lower.includes("demotion_grace_sp") || lower.includes("yo-yoing")) {
        shortSummary = "-- Grace SP threshold before demotion to prevent rank yo-yoing";
      } else if (lower.includes("complete_onboarding") || lower.includes("onboarding")) {
        shortSummary = "-- Onboarding setup: assign default username & country";
      } else if (lower.includes("sp_rung") || lower.includes("season points")) {
        shortSummary = "-- Compute seasonal SP rung and division";
      } else if (lower.includes("spectator") || lower.includes("delay")) {
        shortSummary = "-- Spectator RLS: apply game broadcast delay";
      } else if (lower.includes("upset") || lower.includes("higher-tier")) {
        shortSummary = "-- Upset bonus calculation for defeating higher tier opponents";
      } else if (lower.includes("fair play") || lower.includes("farming")) {
        shortSummary = "-- Anti-farming and fair play checks";
      } else {
        // Generic summarizer: take first sentence or first 80 chars
        const firstSentence = fullText.split(". ")[0].trim();
        shortSummary = `-- ${firstSentence.length > 80 ? firstSentence.slice(0, 77) + "..." : firstSentence}`;
      }

      cleanedLines.push(shortSummary);
      shortenedCount++;
      removedCount += commentBlock.length - 1;
      i = j;
      continue;
    }

    // Single line comment
    const commentText = trimmed.replace(/^--\s*/, "");
    const lower = commentText.toLowerCase();

    // Check if single-line comment is obvious/repetitive
    const isObviousSingle =
      /^(=|-){3,}$/.test(commentText) ||
      lower.startsWith("todo") ||
      lower.startsWith("fixme") ||
      lower.startsWith("debug") ||
      lower.includes("insert profile into") ||
      lower.includes("verification — both rows") ||
      lower.includes("default 100") ||
      lower.includes("all writes via rpcs");

    if (isObviousSingle) {
      removedCount++;
      i++;
      continue;
    }

    // Keep concise single line comment
    cleanedLines.push(line);
    i++;
    continue;
  }

  // Non-comment SQL code line (preserve completely)
  cleanedLines.push(line);
  i++;
}

console.log(`Comments removed: ${removedCount}`);
console.log(`Comments shortened: ${shortenedCount}`);
console.log(`Original total lines: ${originalLines.length}`);
console.log(`Cleaned total lines: ${cleanedLines.length}`);

// Write back cleaned schema
fs.writeFileSync(schemaPath, cleanedLines.join("\n"), "utf-8");
