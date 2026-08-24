const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.join(__dirname, "..");
const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
const setup = path.join(root, "dist", "PabloASASetup.exe");
if (!fs.existsSync(setup)) {
  throw new Error("No existe el Setup: " + setup);
}
const sha256 = crypto.createHash("sha256").update(fs.readFileSync(setup)).digest("hex");
const manifest = {
  version,
  url: "https://github.com/Irfvvv/Pablo-ASA/releases/latest/download/PabloASASetup.exe",
  sha256,
  notes: "Actualizacion automatica",
};
fs.writeFileSync(path.join(root, "dist", "update.json"), JSON.stringify(manifest));
console.log("update.json", version, sha256);
