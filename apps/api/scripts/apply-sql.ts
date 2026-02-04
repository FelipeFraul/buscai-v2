import path from "node:path";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);

if (!args.length) {
  console.error("Usage: pnpm db:apply-sql <file1> [file2...]");
  process.exit(1);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const drizzleDir = path.resolve(scriptDir, "..", "drizzle");

for (const relativeFile of args) {
  const filePath = path.resolve(drizzleDir, relativeFile);
  if (!filePath.startsWith(drizzleDir)) {
    console.error("Refusing to load SQL outside of drizzle directory:", relativeFile);
    process.exit(1);
  }

  try {
    const sql = readFileSync(filePath, "utf-8");
    console.log(`Applying ${relativeFile} to buscai-db...`);
    execSync("docker exec -i buscai-db psql -U buscai -d buscai -v ON_ERROR_STOP=1", {
      input: sql,
      stdio: "inherit",
    });
  } catch (error) {
    console.error("Failed to apply SQL:", relativeFile);
    throw error;
  }
}
