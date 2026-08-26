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
  url: "https://github.com/Irfvvv/Pablo-ASA/releases/download/v" + version + "/PabloASASetup.exe",
  sha256,
  notes: "Actualizacion automatica",
};
const json = JSON.stringify(manifest);
fs.writeFileSync(path.join(root, "dist", "update.json"), json);

const out = path.join(root, "updates-dist");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "update.json"), json);
fs.writeFileSync(
  path.join(out, "_headers"),
  ["/update.json", "  Content-Type: application/json; charset=utf-8", "  Cache-Control: no-cache", "", ""].join("\r\n")
);
fs.writeFileSync(
  path.join(out, "index.html"),
  `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Pablo ASA</title>
  <style>
    body { font-family: Segoe UI, sans-serif; background: #101218; color: #e8edf5; padding: 48px; }
    a { color: #e8a54b; }
  </style>
</head>
<body>
  <h1>Pablo ASA ${version}</h1>
  <p>La app busca <a href="/update.json">update.json</a> aquí, igual que Pablo ARK App.</p>
</body>
</html>
`
);
console.log("update.json", version, sha256);
