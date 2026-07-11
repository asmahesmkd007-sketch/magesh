export function generateUsername(fullName: string): string {
  const cleanName = fullName.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const base = cleanName.length > 0 ? cleanName : "user";
  const prefix = base.substring(0, 5);
  const randomChars = Math.random().toString(36).substring(2, 7);
  return `${prefix}_${randomChars}`;
}
