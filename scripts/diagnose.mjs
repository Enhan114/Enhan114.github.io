/**
 * 诊断脚本 — 打开音乐网站并监控性能问题
 * 用法: node scripts/diagnose.mjs
 */
import { chromium } from 'playwright';

const URL = 'https://webmusic.cc.cd';

async function main() {
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: false,
    args: ['--no-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  const blobRequests = [];
  const allRequests = [];
  const errors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  page.on('request', (req) => {
    const url = req.url();
    allRequests.push({ url, time: Date.now() });
    if (url.startsWith('blob:')) {
      blobRequests.push({ url: url.substring(0, 80), time: Date.now() });
    }
  });

  console.log('🚀 正在打开线上页面 (webmusic.cc.cd)...');
  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    console.log('✅ DOM 加载完成');
  } catch (e) {
    console.log('⚠️  页面加载超时，继续诊断当前状态...');
  }

  // 等足够久让封面、音乐清单全部加载
  console.log('⏳ 等待 30 秒让封面和 JS 完全初始化...');
  await page.waitForTimeout(30000);

  // 重置计数器，只统计稳定后的网络请求
  blobRequests.length = 0;
  allRequests.length = 0;

  console.log('⏳ 再监控 20 秒持续的网络请求...');
  await page.waitForTimeout(20000);

  // 结果
  console.log('\n📊 ====== 诊断结果 ======');
  console.log(`\n🔴 blob: 请求数（20秒内）: ${blobRequests.length}`);
  if (blobRequests.length === 0) {
    console.log('  ✅ 没有 blob URL 泄漏');
  } else if (blobRequests.length > 40) {
    console.log(`  ❌ blob 泄漏严重！(约 ${(blobRequests.length/20).toFixed(1)}/秒)`);
  } else {
    console.log(`  ⚠️  blobs 偏多 (${blobRequests.length}个)`);
  }

  if (blobRequests.length > 0) {
    console.log('  前 5 个 blob 请求:');
    blobRequests.slice(0, 5).forEach((r, i) => console.log(`    ${i+1}. ${r.url}`));
  }

  console.log(`\n🔴 总请求数（20秒内）: ${allRequests.length}`);
  const blobOnly = allRequests.filter(r => r.url.startsWith('blob:')).length;

  console.log(`\n🔴 控制台错误: ${errors.length}`);
  errors.slice(0, 5).forEach((e, i) => console.log(`    ${i+1}. ${e}`));

  await page.screenshot({ path: 'diagnose-screenshot.png' });
  console.log('\n📸 截图: diagnose-screenshot.png');

  // 检查 canvas 数量
  const canvasCount = await page.evaluate(() => document.querySelectorAll('canvas').length);
  console.log(`\n🎨 Canvas 元素数量: ${canvasCount}`);

  console.log('\n浏览器保持打开，按 Ctrl+C 关闭');
  await page.waitForTimeout(30000);
  await browser.close();
}

main().catch((err) => {
  console.error('诊断脚本错误:', err.message);
  process.exit(1);
});
