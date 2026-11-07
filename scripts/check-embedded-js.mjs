// 校验面板/自助页内嵌 JS 语法：从模板字符串提取 <script> 内容跑 node --check。
// 背景：模板串里的 \n 会变成真实换行，打进内嵌 JS 字符串导致语法错误（整段脚本失效），
// 外层 node --check 查不出来，必须提取内嵌脚本单独检查。
import { PANEL_HTML } from "../src/panel.js";
import { JOIN_HTML } from "../src/joinpage.js";
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

let failed = false;
for (const [name, html] of [["panel", PANEL_HTML], ["join", JOIN_HTML]]) {
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) {
    console.log(`✗ ${name}: 找不到 <script> 块`);
    failed = true;
    continue;
  }
  const js = m[1];
  const hasRawNewlineInString = /'[^'\n]*\n[^'\n]*'/.test(js.replace(/String\.fromCharCode[^)]*\)/g, "''"));
  writeFileSync(`.check-${name}.js`, js);
  try {
    execSync(`node --check .check-${name}.js`, { stdio: "pipe" });
    console.log(`✓ ${name}: 内嵌 JS 语法 OK (${js.length} chars)`);
  } catch (e) {
    console.log(`✗ ${name}: 语法错误\n${e.stderr?.toString().slice(0, 500)}`);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
