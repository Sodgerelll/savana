import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const A = (name) => readFileSync(join(__dirname, "assets", name)).toString("base64");

let html = readFileSync(join(__dirname, "cartoon.src.html"), "utf8");

const map = {
  __PF400__: A("pf-400.ttf"),
  __PF700__: A("pf-700.ttf"),
  __PF800__: A("pf-800.ttf"),
  __LORA400__: A("lora-400.ttf"),
  __LORA500__: A("lora-500.ttf"),
  __LORA600__: A("lora-600.ttf"),
  __LOGO_MARK__: A("logoBlack_mark.png"),
};

for (const [key, val] of Object.entries(map)) {
  html = html.split(key).join(val);
}

writeFileSync(join(__dirname, "cartoon.html"), html);
console.log("Built cartoon.html:", (html.length / 1024 / 1024).toFixed(2), "MB");
