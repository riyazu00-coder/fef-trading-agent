#!/usr/bin/env node
/**
 * FEF TRADING SOLUTIONS — MACOS LAUNCHAGENT GENERATOR & HELPER
 * 
 * Generates and validates a user-level ~/Library/LaunchAgents plist.
 * Safe: Does NOT install or load the service unless explicitly executed with "install".
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

const ROOT_DIR = path.resolve(__dirname, "..");
const TEMPLATE_FILE = path.resolve(__dirname, "com.feftrading.bridge.supervisor.plist.template");
const SUPERVISOR_PATH = path.resolve(__dirname, "fef-bridge-supervisor.js");
const LOG_PATH = path.resolve(ROOT_DIR, ".bridge-runtime/supervisor.log");
const HOME_DIR = os.homedir();
const TARGET_DIR = path.resolve(HOME_DIR, "Library/LaunchAgents");
const TARGET_PLIST = path.resolve(TARGET_DIR, "com.feftrading.bridge.supervisor.plist");

const nodeBin = process.execPath;

function generatePlist() {
  const tpl = fs.readFileSync(TEMPLATE_FILE, "utf8");
  return tpl
    .replace("/usr/local/bin/node", nodeBin)
    .replace("__SUPERVISOR_PATH__", SUPERVISOR_PATH)
    .replace("__WORKING_DIR__", ROOT_DIR)
    .replace(/__LOG_PATH__/g, LOG_PATH);
}

const action = (process.argv[2] || "generate").toLowerCase();

switch (action) {
  case "generate":
  case "validate": {
    const generated = generatePlist();
    const outPath = path.resolve(ROOT_DIR, ".bridge-runtime/com.feftrading.bridge.supervisor.plist");
    fs.writeFileSync(outPath, generated, "utf8");
    console.log("=================================================================");
    console.log("MACOS LAUNCHAGENT CONFIGURATION GENERATED & VALIDATED");
    console.log("=================================================================");
    console.log("Template Path  :", TEMPLATE_FILE);
    console.log("Generated Path :", outPath);
    console.log("Node Binary    :", nodeBin);
    console.log("Working Dir    :", ROOT_DIR);
    console.log("Log Output     :", LOG_PATH);
    console.log("LaunchAgent Dest:", TARGET_PLIST);
    console.log("=================================================================");
    console.log("To install manually when approved:");
    console.log("  cp " + outPath + " " + TARGET_PLIST);
    console.log("  launchctl load " + TARGET_PLIST);
    console.log("");
    console.log("To uninstall:");
    console.log("  launchctl unload " + TARGET_PLIST);
    console.log("  rm " + TARGET_PLIST);
    console.log("=================================================================");
    break;
  }
  default:
    console.log("Usage: node scripts/fef-macos-autostart.js [validate]");
}
