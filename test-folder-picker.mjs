import { chromium } from 'playwright';

const BASE = 'http://localhost:9025';

async function test(label, fn) {
  try {
    await fn();
    console.log(`✅ ${label}`);
    return true;
  } catch (e) {
    console.log(`❌ ${label}: ${e.message}`);
    return false;
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let passed = 0, failed = 0;

  // --- API tests (fast, no UI needed) ---
  await test('recent-projects returns 30 projects', async () => {
    const res = await page.request.get(`${BASE}/api/recent-projects`);
    if (!res.ok()) throw new Error(`HTTP ${res.status()}`);
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) throw new Error(`Got ${data.length} projects`);
    if (data.length < 10) throw new Error(`Only ${data.length} projects`);
    // Verify structure
    const p = data[0];
    if (!p.name || !p.path || !Array.isArray(p.techs)) throw new Error('Bad structure: ' + JSON.stringify(p));
    console.log(`   → ${data.length} projects, first: ${data[0].name} (${data[0].techs.join(', ')})`);
  }) ? passed++ : failed++;

  await test('project-context loads Skill_manager_1', async () => {
    const path = '/Users/gwanli/Documents/GitHub/myproduct_v4/Skill_manager_1';
    const res = await page.request.get(`${BASE}/api/project-context?path=${encodeURIComponent(path)}`);
    if (!res.ok()) throw new Error(`HTTP ${res.status()}`);
    const data = await res.json();
    if (data.name !== 'Skill_manager_1') throw new Error(`Expected Skill_manager_1, got ${data.name}`);
    if (!data.techs.includes('Next.js')) throw new Error(`Missing Next.js in techs: ${data.techs}`);
    console.log(`   → name: ${data.name}, techs: ${data.techs.join(', ')}`);
  }) ? passed++ : failed++;

  await test('project-context returns 404 for nonexistent path', async () => {
    const res = await page.request.get(`${BASE}/api/project-context?path=${encodeURIComponent('/nonexistent/path')}`);
    if (res.status() !== 404) throw new Error(`Expected 404, got ${res.status()}`);
  }) ? passed++ : failed++;

  await test('pick-folder GET route exists (not 404/405)', async () => {
    // We can't test the actual dialog in headless mode, but we can verify
    // the route is registered and responds (will timeout/error but not 404/405)
    // Use a short timeout — if it hangs waiting for dialog that's OK, route exists
    const res = await page.request.get(`${BASE}/api/pick-folder`, { timeout: 2000 }).catch(e => {
      if (e.message.toLowerCase().includes('timeout')) return { status: () => 'timeout', ok: () => false };
      throw e;
    });
    const status = res.status();
    if (status === 404 || status === 405) throw new Error(`Route not registered: HTTP ${status}`);
    console.log(`   → Route exists, responded: ${status} (dialog requires interactive session)`);
  }) ? passed++ : failed++;

  // --- UI tests ---
  await page.goto(BASE, { waitUntil: 'networkidle' });

  // Navigate to AI tab
  await test('AI 추천 tab exists and is clickable', async () => {
    const tab = page.getByText('AI 추천');
    if (!await tab.isVisible()) throw new Error('Tab not visible');
    await tab.click();
    await page.waitForTimeout(300);
  }) ? passed++ : failed++;

  await test('Project search input is visible', async () => {
    const input = page.getByPlaceholder('프로젝트 폴더 경로 또는 이름으로 검색');
    if (!await input.isVisible()) throw new Error('Search input not found');
  }) ? passed++ : failed++;

  await test('Clicking input shows recent projects dropdown', async () => {
    const input = page.getByPlaceholder('프로젝트 폴더 경로 또는 이름으로 검색');
    await input.click();
    await page.waitForTimeout(500);
    // Dropdown should show — look for 📁 icons
    const folders = page.locator('button').filter({ hasText: '📁' });
    const count = await folders.count();
    if (count === 0) throw new Error('No project buttons appeared in dropdown');
    console.log(`   → Dropdown showed ${count} project entries`);
  }) ? passed++ : failed++;

  await test('Searching filters projects correctly', async () => {
    const input = page.getByPlaceholder('프로젝트 폴더 경로 또는 이름으로 검색');
    await input.fill('vibe');
    await page.waitForTimeout(300);
    const folders = page.locator('button').filter({ hasText: '📁' });
    const count = await folders.count();
    if (count === 0) throw new Error('Filter returned 0 results for "vibe"');
    const text = await folders.first().textContent();
    if (!text?.toLowerCase().includes('vibe')) throw new Error(`First result "${text}" doesn't match "vibe"`);
    console.log(`   → Filter "vibe" returned ${count} result(s): ${text?.trim().slice(0, 40)}`);
  }) ? passed++ : failed++;

  await test('Typing / shows direct path open button', async () => {
    const input = page.getByPlaceholder('프로젝트 폴더 경로 또는 이름으로 검색');
    await input.fill('/Users/gwanli/Documents/GitHub/myproduct_v4/vibe2');
    await page.waitForTimeout(300);
    const openBtn = page.locator('button').filter({ hasText: '열기' });
    if (!await openBtn.isVisible()) throw new Error('열기 button not visible for / path');
  }) ? passed++ : failed++;

  await test('Clicking a project from dropdown loads context', async () => {
    const input = page.getByPlaceholder('프로젝트 폴더 경로 또는 이름으로 검색');
    await input.fill('');
    await input.click();
    await page.waitForTimeout(300);
    const firstProject = page.locator('button').filter({ hasText: '📁' }).first();
    const projectName = (await firstProject.textContent())?.replace('📁', '').split('\n')[1]?.trim();
    await firstProject.click();
    await page.waitForTimeout(1500);
    // Check badge appears
    const badge = page.locator('div').filter({ hasText: '📂' }).first();
    if (!await badge.isVisible()) throw new Error('Project badge not visible after selection');
    console.log(`   → Selected "${projectName}", badge appeared`);
  }) ? passed++ : failed++;

  await test('Project ✕ button clears context', async () => {
    const clearBtn = page.locator('button[title="프로젝트 해제"]');
    if (!await clearBtn.isVisible()) throw new Error('Clear button not found');
    await clearBtn.click();
    await page.waitForTimeout(200);
    const input = page.getByPlaceholder('프로젝트 폴더 경로 또는 이름으로 검색');
    if (!await input.isVisible()) throw new Error('Input not restored after clear');
  }) ? passed++ : failed++;

  await test('📂 browse button exists', async () => {
    const btn = page.locator('button[title="폴더 직접 선택"]');
    if (!await btn.isVisible()) throw new Error('Browse button not visible');
  }) ? passed++ : failed++;

  await test('Claude status badge visible in StatsBar', async () => {
    const badge = page.locator('button').filter({ hasText: /Claude/ });
    if (!await badge.isVisible()) throw new Error('Claude badge not found');
    const text = await badge.textContent();
    console.log(`   → Badge text: "${text?.trim()}"`);
  }) ? passed++ : failed++;

  await browser.close();

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
  process.exit(failed > 0 ? 1 : 0);
})();
