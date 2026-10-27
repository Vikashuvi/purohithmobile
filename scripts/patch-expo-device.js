const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "node_modules", "expo-device", "ios", "UIDevice.swift");
if (!fs.existsSync(file)) process.exit(0);

const source = fs.readFileSync(file, "utf8");
const broken = `  var isSimulator: Bool {
    return TARGET_OS_SIMULATOR != 0
  }`;
const fixed = `  var isSimulator: Bool {
    #if targetEnvironment(simulator)
    return true
    #else
    return false
    #endif
  }`;

if (!source.includes(broken)) process.exit(0);
fs.writeFileSync(file, source.replace(broken, fixed));
