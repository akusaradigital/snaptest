#!/usr/bin/env node

/**
 * SnapTest Headless CI/CD Test Runner CLI
 * Usage: npx snaptest-runner --suite=<id> --api-key=<key> [--endpoint=<url>]
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

async function main() {
  const args = process.argv.slice(2);
  let suiteId = "";
  let apiKey = process.env.SNAPTEST_API_KEY || "";
  let endpoint = process.env.SNAPTEST_ENDPOINT || "https://snaptest.vercel.app";

  for (const arg of args) {
    if (arg.startsWith("--suite=")) suiteId = arg.split("=")[1];
    if (arg.startsWith("--api-key=")) apiKey = arg.split("=")[1];
    if (arg.startsWith("--endpoint=")) endpoint = arg.split("=")[1];
  }

  if (!suiteId || !apiKey) {
    console.error("❌ Error: --suite and --api-key (or SNAPTEST_API_KEY env) are required.");
    console.log("Usage: npx snaptest-runner --suite=<id> --api-key=<key> [--endpoint=<url>]");
    process.exit(1);
  }

  console.log(`🚀 SnapTest CLI: Fetching test suite ${suiteId}...`);

  try {
    const res = await fetch(`${endpoint.replace(/\/+$/, "")}/api/public/v1/suites/${suiteId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Failed to fetch suite (${res.status}): ${err.error || res.statusText}`);
    }

    const suite = await res.json();
    console.log(`📦 Loaded suite: "${suite.title || suite.url}" with ${suite.scripts?.length || 0} scripts.`);

    if (!suite.scripts || suite.scripts.length === 0) {
      console.log("⚠️ No scripts found in suite. Exiting.");
      process.exit(0);
    }

    // Write scripts to temporary test directory
    const tempDir = path.join(process.cwd(), ".snaptest-tmp");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const results = [];

    for (const script of suite.scripts) {
      const filename = path.basename(script.script_location || script.file_name || "test.spec.ts");
      const filePath = path.join(tempDir, filename);
      const cleanCode = (script.content || "").replace(/\\n/g, "\n").replace(/\\"/g, '"');
      fs.writeFileSync(filePath, cleanCode, "utf8");

      console.log(`▶️ Running ${filename}...`);
      const start = Date.now();
      try {
        execSync(`npx playwright test "${filePath}" --reporter=line`, { stdio: "inherit" });
        results.push({ name: filename, status: "passed", duration: Date.now() - start });
        console.log(`✅ ${filename} PASSED`);
      } catch (e) {
        results.push({ name: filename, status: "failed", duration: Date.now() - start, error: e.message });
        console.log(`❌ ${filename} FAILED`);
      }
    }

    // Report results back to SnapTest
    console.log("📤 Reporting results back to SnapTest...");
    const reportRes = await fetch(`${endpoint.replace(/\/+$/, "")}/api/public/v1/runs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        suiteId,
        browser: "playwright-headless",
        os: process.platform,
        results,
      }),
    });

    if (reportRes.ok) {
      console.log("✨ Test runs recorded successfully in SnapTest!");
    } else {
      console.warn("⚠️ Warning: Failed to record results in SnapTest.");
    }

    const failedCount = results.filter((r) => r.status === "failed").length;
    if (failedCount > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error(`💥 Execution failed: ${err.message}`);
    process.exit(1);
  }
}

main();
