const fs = require("fs");
const content = fs.readFileSync("src/lib/chess/puzzles.ts", "utf8");
const goals = new Set();
const themes = new Set();

const goalRegex = /"goal":\s*"(.*?)"/g;
let match;
while ((match = goalRegex.exec(content)) !== null) {
  goals.add(match[1]);
}

const themeRegex = /"theme":\s*"(.*?)"/g;
while ((match = themeRegex.exec(content)) !== null) {
  themes.add(match[1]);
}

console.log("Goals:", Array.from(goals));
console.log("Themes:", Array.from(themes));
