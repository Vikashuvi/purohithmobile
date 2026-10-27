const { copyFileSync, readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

copyFileSync(join(__dirname, "../public/web-notifications-sw.js"), join(__dirname, "../dist/web-notifications-sw.js"));
copyFileSync(join(__dirname, "../public/manifest.webmanifest"), join(__dirname, "../dist/manifest.webmanifest"));
const htmlPath = join(__dirname, "../dist/index.html");
const html = readFileSync(htmlPath, "utf8");
writeFileSync(htmlPath, html.replace("</head>", '<link rel="manifest" href="/manifest.webmanifest" /><meta name="apple-mobile-web-app-capable" content="yes" /><link rel="apple-touch-icon" href="/favicon.png" /></head>'));
