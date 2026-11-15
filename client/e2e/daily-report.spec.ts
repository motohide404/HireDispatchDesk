import { test, expect, type Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
test.use({ timezoneId: 'UTC' });
async function connect(page: Page) {
  let workspace: any = null;
  let revision = 0;
  const records: any[] = [];
  let loseNext = false;
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', dialog=>dialog.accept());
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.pathname === '/api/workspace') {
      if (req.method() === 'PUT') { const data = req.postDataJSON(); workspace = data.value; revision++; }
      return route.fulfill({ json: { value: workspace, revision } });
    }
    if (url.pathname.endsWith('/settings')) return route.fulfill({ json: { revision: 0, profile: { officeName: '見本営業所', depotPlace: '本社車庫' } } });
    if (url.pathname === '/api/daily-reports/instructions') return route.fulfill({ json: { records: [{ id: 'inst-1', kind: 'instruction', source: { title: '空港送迎' }, values: { boardingPlace: 'ホテルA', alightingPlace: '羽田空港', boardingAt: '2030-01-01T23:40:00+09:00', alightingAt: '2030-01-02T01:00:00+09:00' } }] } });
    if (url.pathname === '/api/daily-reports') {
      if (req.method() === 'POST') {
        const row = req.postDataJSON(), original = records.at(-1);
        const validation = spawnSync('python3', ['-B','-c', "import sys,json;sys.path.insert(0,'../tests');from test_validation import app;x=json.load(sys.stdin);app.validate_daily_report(x['row'],x['workspace'],x['original'])"], { input: JSON.stringify({ row, workspace, original: original ?? null }), encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
        const existing=records.find(r=>r.id===row.id);
        if (!existing && validation.status !== 0) return route.fulfill({status:400,json:{error:validation.stderr}});
        if(!existing) records.push(row);
        if(loseNext){loseNext=false;return route.abort();}
        return route.fulfill({json:{record:existing??row}});
      }
      if(url.searchParams.has('reportId')) return route.fulfill({json:{records:[...records].reverse()}});
      return route.fulfill({json:{record:records.at(-1)??null}});
    }
    return route.fulfill({json:{records:[],events:[]}});
  });
  await page.goto('/?view=daily');
  await expect(page.getByRole('heading',{name:'乗務日報',exact:true})).toBeVisible();
  return {records,errors,get workspace(){return workspace},loseResponse(){loseNext=true}};
}
async function open(page: Page) {
  await page.getByLabel('運行日',{exact:true}).fill('2030-01-01');
  await page.getByRole('combobox',{name:'乗務員',exact:true}).selectOption({index:1});
  await page.getByRole('combobox',{name:'車両（新規作成時）',exact:true}).selectOption({index:1});
  await page.getByRole('button',{name:'日報を開く',exact:true}).click();
  await expect(page.getByRole('heading',{name:'開始時の記録'})).toBeVisible();
}
test('mobile driver records overnight trip, recovers draft, retries lost response, submits and corrects without overwriting',async({page})=>{
  await page.setViewportSize({width:375,height:812});
  const state=await connect(page);await open(page);
  await expect(page.locator('.daily-page input[type=date]')).toHaveCount(1);
  await expect(page.locator('.daily-page input[type=datetime-local]')).toHaveCount(0);
  await page.getByLabel('出庫の実時刻',{exact:true}).fill('23:30');
  await page.getByLabel('出庫メーター（積算km・最初だけ全桁）',{exact:true}).fill('12990');
  await page.getByText(/担当の運行指示書から仕事を追加/).click();
  await page.getByRole('button',{name:'この仕事を追加'}).click();
  await expect(page.getByLabel('開始の実時刻',{exact:true})).toHaveValue('');
  await page.getByLabel('開始の実時刻',{exact:true}).fill('23:40');
  await page.getByLabel('終了の実時刻',{exact:true}).fill('01:00');
  await page.getByRole('combobox',{name:'終了の実時刻の日付',exact:true}).selectOption('1');
  await page.getByLabel('終了時メーター下3桁',{exact:true}).fill('025');
  await page.getByLabel('乗車人数',{exact:true}).fill('2');
  await expect(page.getByText(/走行 35 km/)).toBeVisible();
  await page.reload();await open(page);
  await expect(page.getByLabel('終了時メーター下3桁',{exact:true})).toHaveValue('025');
  state.loseResponse();await page.getByRole('button',{name:'下書き保存',exact:true}).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button',{name:'下書き保存',exact:true}).click();
  await expect(page.getByText('下書きをサーバーに保存しました。')).toBeVisible();
  expect(state.records).toHaveLength(1);
  expect(state.records[0].startAt).toBe('2030-01-01T23:30');
  expect(state.records[0].rows[0].startAt).toBe('2030-01-01T23:40');
  expect(state.records[0].rows[0].endAt).toBe('2030-01-02T01:00');
  await page.getByRole('button',{name:'1日分を提出',exact:true}).click();
  await expect(page.getByText('日報を提出しました。')).toBeVisible();
  await page.getByLabel('事故・遅延・異常など（ある場合は概要と原因）',{exact:true}).fill('降車時刻の訂正');
  await page.getByLabel('訂正理由',{exact:true}).fill('乗務員が実時刻を確認');
  await page.getByLabel('終了の実時刻',{exact:true}).fill('01:05');
  await page.getByRole('button',{name:'訂正して提出',exact:true}).click();
  await expect(page.getByText('日報を提出しました。')).toBeVisible();
  expect(state.records).toHaveLength(3);expect(state.records[1].rows[0].endAt).toBe('2030-01-02T01:00');
  expect(state.records[2].rows[0].instructionId).toBe('inst-1');
  await page.getByRole('button',{name:'＋回送',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'開始の実時刻の日付',exact:true}).nth(1)).toHaveValue('1');
  await page.getByLabel('開始の実時刻',{exact:true}).nth(1).fill('01:10');
  await expect(page.getByRole('combobox',{name:'終了の実時刻の日付',exact:true}).nth(1)).toHaveValue('1');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  mkdirSync('../.private/daily-report-20261115',{recursive:true});
  await page.screenshot({path:'../.private/daily-time-input-20261115/mobile.png',fullPage:true});
  expect(state.errors).toEqual([]);
});
test('tablet cards add freely; printing 19 and 37 rows continues at 18; blank memo is one A4 page',async({page})=>{
  await page.setViewportSize({width:768,height:1024});const state=await connect(page);await open(page);
  for(let i=0;i<36;i++)await page.getByRole('button',{name:'＋回送',exact:true}).click();
  await expect(page.getByRole('heading',{name:'記録 36　回送',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'日報を印刷',exact:true}).click();
  await expect(page.locator('#daily-report-print .daily-paper')).toHaveCount(3);
  expect(await page.locator('#daily-report-print tbody tr').count()).toBe(54);
  await expect(page.locator('#daily-report-print tbody tr').nth(1).locator('td').nth(5)).toHaveText('');
  await page.pdf({path:'../.private/daily-report-20261115/37-rows.pdf',format:'A4',preferCSSPageSize:true,printBackground:true});
  await expect(page.locator('#daily-report-print')).toHaveCount(0);
  await page.getByRole('button',{name:'空欄メモ用紙を印刷',exact:true}).click();
  await expect(page.locator('#daily-report-print .daily-paper')).toHaveCount(1);
  await page.pdf({path:'../.private/daily-report-20261115/blank-memo.pdf',format:'A4',preferCSSPageSize:true,printBackground:true});
  expect(state.errors).toEqual([]);
});
