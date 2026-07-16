import { expect, test } from 'playwright/test'

const quality = {suspicious:false,reviewed:false,flagged_blocks:0,reason:null}
const pages = [
  {img_width:800,img_height:1200,img_path:'one.jpg',image_url:'/api/mock/one.jpg',ocr_quality:quality,blocks:[{box:[100,100,300,500],vertical:true,font_size:30,lines_coords:[],lines:['むかしむかし'],raw_lines:['むかしむかし'],ruby:[]}]},
  {img_width:800,img_height:1200,img_path:'two.jpg',image_url:'/api/mock/two.jpg',ocr_quality:quality,blocks:[{box:[100,100,300,500],vertical:true,font_size:30,lines_coords:[],lines:['孫悟空'],raw_lines:['孫悟空'],ruby:[]}]},
]

test.beforeEach(async ({page}) => {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url()); const method=route.request().method()
    if(url.pathname==='/api/volumes') return route.fulfill({json:[{id:'v1',title:'Volume 01',series:'Dragon Ball',status:'ready',page_count:2,processed_pages:2,progress:1,cover_filename:'one.jpg',current_page:0,error:null}]})
    if(url.pathname==='/api/volumes/v1/reader') return route.fulfill({json:{title:'Dragon Ball',volume:'Volume 01',volume_id:'v1',current_page:0,pages}})
    if(url.pathname==='/api/volumes/v1/bookmarks') return route.fulfill({json:[]})
    if(url.pathname==='/api/saved-items'&&method==='GET') return route.fulfill({json:[
      {id:'word',text:'悟空',reading:'ごくう',meaning:'Goku',volume_id:'v1',page_index:1,context:null,notes:null,created_at:'2026-01-01',kind:'vocabulary'},
      {id:'sentence',text:'むかしむかし',reading:null,meaning:'Once upon a time',volume_id:'v1',page_index:0,context:null,notes:null,created_at:'2026-01-02',kind:'sentence'},
      {id:'grammar',text:'のこと',reading:null,meaning:'the matter of',volume_id:'v1',page_index:0,context:null,notes:null,created_at:'2026-01-03',kind:'grammar'}]})
    if(url.pathname==='/api/volumes/v1/pages/0/ai-history'&&method==='GET') return route.fulfill({json:[{id:'ai1',kind:'selection',question:'Explain のこと',focus:'のこと',answer:'It frames the matter.',provider:'mock',model:'local-test',created_at:'2026-01-01',details:{breakdown:[{part:'のこと',role:'nominal frame'}]}}]})
    if(url.pathname==='/api/volumes/v1/pages/0/meaning-check'&&method==='POST') return route.fulfill({json:{id:'check1',provider:'mock',model:'local-test',cached:false,created_at:'2026-01-01',check:{summary:'You understood the story opening.',evaluations:[{block_index:0,meaning_score:95,literal_score:72,verdict:'Meaning correct',literal_translation:'Long ago, long ago',natural_translation:'Once upon a time',contextual_meaning:'A conventional story opening',correct:['You captured the time frame.'],missing:['The repetition gives it a fairy-tale cadence.'],added:[],incorrect:[]}]}}})
    if(url.pathname==='/api/restore'&&method==='POST') return route.fulfill({json:{ok:true,volumes:1,recovered_jobs:0,safety_backup:'safety.db'}})
    if(url.pathname==='/api/volumes/v1/search') return route.fulfill({json:url.searchParams.get('q')==='ごくう'?[{page:1,block:0,text:'孫悟空',matched_by:'reading'}]:[]})
    if(url.pathname==='/api/llm/status') return route.fulfill({json:{preferred:'mock',providers:[{id:'mock',name:'Mock',model:'local-test',configured:true}]}})
    if(url.pathname==='/api/dictionary') return route.fulfill({json:{query:url.searchParams.get('q'),tokens:[{surface:'むかしむかし',lemma:'むかしむかし',reading:'ムカシムカシ',part_of_speech:'adverb',detail:null,inflection:null}],entries:[{id:1,writings:[],readings:['むかしむかし'],matched_by:'むかしむかし',senses:[{glosses:['once upon a time'],parts_of_speech:['adverb'],misc:[]}]}],kanji:[]}})
    if(url.pathname==='/api/grammar') return route.fulfill({json:{sentence:url.searchParams.get('sentence'),focus:url.searchParams.get('focus'),needs_context:false,matches:[]}})
    if(url.pathname.includes('/images/')||url.pathname.startsWith('/api/mock/')) return route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200"/>'})
    if(method==='PUT'||method==='POST'||method==='DELETE') return route.fulfill({json:{ok:true}})
    return route.fulfill({status:404,json:{detail:'Not mocked'}})
  })
  await page.goto('/')
  await page.locator('.volume-card__cover').click()
  await expect(page.getByAltText('Page 1')).toBeVisible()
})

test('browses and searches the volume transcript', async ({page}) => {
  await page.getByTitle('Browse pages').first().click()
  await expect(page.getByRole('heading',{name:'Pages'})).toBeVisible()
  await page.getByPlaceholder('Search Japanese transcript…').fill('悟空')
  await expect(page.getByRole('button',{name:'Open page 2'})).toBeVisible()
  await page.getByRole('button',{name:'Open page 2'}).click()
  await expect(page.getByAltText('Page 2')).toBeVisible()
})

test('finds kana readings and pins the matching bubble', async ({page}) => {
  await page.getByTitle('Browse pages').first().click()
  await page.getByPlaceholder('Search Japanese transcript…').fill('ごくう')
  await expect(page.getByText('reading match')).toBeVisible()
  await page.getByRole('button',{name:'Open page 2'}).click()
  await expect(page.locator('.bubble-overlay.is-pinned')).toContainText('孫悟空')
})

test('reader tools replace each other instead of stacking', async ({page}) => {
  await page.getByRole('button',{name:/Page Lens/}).click()
  await expect(page.getByRole('heading',{name:'Page Lens'})).toBeVisible()
  await page.getByTitle('Browse pages').first().click()
  await expect(page.getByRole('heading',{name:'Pages'})).toBeVisible()
  await expect(page.getByRole('heading',{name:'Page Lens'})).toHaveCount(0)
})

test('exposes keyboard help and shortcut navigation', async ({page}) => {
  await page.keyboard.press('?')
  await expect(page.getByRole('heading',{name:'Keyboard shortcuts'})).toBeVisible()
  await page.keyboard.press('Escape')
  await page.keyboard.press('g')
  await expect(page.getByRole('heading',{name:'Pages'})).toBeVisible()
})

async function selectFirstBubble(page:import('playwright/test').Page) {
  await page.locator('.bubble-overlay__ink').first().evaluate((ink) => {
    const range=document.createRange();range.selectNodeContents(ink);const selection=getSelection();selection?.removeAllRanges();selection?.addRange(range)
    ink.closest('.bubble-overlay')?.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,clientX:300,clientY:300}))
  })
}

test('selection lookup replaces Page Lens', async ({page}) => {
  await page.getByRole('button',{name:/Page Lens/}).click()
  await selectFirstBubble(page)
  await page.getByRole('button',{name:/Look up/}).click()
  await expect(page.getByRole('heading',{name:'むかしむかし'})).toBeVisible()
  await expect(page.getByRole('heading',{name:'Page Lens'})).toHaveCount(0)
})

test('saves the full sentence as a typed study item', async ({page}) => {
  await selectFirstBubble(page);await page.getByRole('button',{name:/Look up/}).click()
  const request=page.waitForRequest((request)=>request.url().endsWith('/api/saved-items')&&request.method()==='POST')
  await page.getByRole('button',{name:/Save the whole sentence/}).click()
  expect((await request).postDataJSON()).toMatchObject({text:'むかしむかし',kind:'sentence',volume_id:'v1',page_index:0})
  await expect(page.getByRole('button',{name:/Sentence saved/})).toBeDisabled()
})

test('unsaved transcription blocks accidental tool switches', async ({page}) => {
  await page.locator('.bubble-edit-trigger').first().evaluate((button)=>(button as HTMLButtonElement).click())
  await expect(page.getByRole('heading',{name:/Bubble 1/})).toBeVisible()
  await page.locator('.editor-line textarea').fill('changed but not saved')
  page.once('dialog',(dialog)=>dialog.dismiss())
  await page.getByRole('button',{name:/Page Lens/}).click()
  await expect(page.getByRole('heading',{name:/Bubble 1/})).toBeVisible()
  await expect(page.getByRole('heading',{name:'Page Lens'})).toHaveCount(0)
  page.once('dialog',(dialog)=>dialog.accept())
  await page.getByRole('button',{name:/Page Lens/}).click()
  await expect(page.getByRole('heading',{name:'Page Lens'})).toBeVisible()
})

test('adds and removes a page bookmark', async ({page}) => {
  const add=page.waitForRequest((request)=>request.url().endsWith('/bookmarks/0')&&request.method()==='PUT')
  await page.getByTitle('Bookmark this page').click();await add
  await expect(page.getByTitle('Remove page bookmark')).toBeVisible()
  const remove=page.waitForRequest((request)=>request.url().endsWith('/bookmarks/0')&&request.method()==='DELETE')
  await page.getByTitle('Remove page bookmark').click();await remove
})

test('applies and persists reader display settings', async ({page}) => {
  await page.getByTitle('Reader settings').click()
  const size=page.getByRole('slider').first()
  await size.fill('1.5')
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('komayomi.readerPreferences')||'{}').overlayScale)).toBe(1.5)
})

test('filters the study inbox by item type', async ({page}) => {
  await page.locator('.reader-header__left .icon-button').click()
  await page.getByRole('button',{name:/Study inbox/}).click()
  await page.locator('.inbox-kinds').getByRole('button',{name:'grammar'}).click()
  await expect(page.getByText('のこと')).toBeVisible()
  await expect(page.getByText('悟空')).toHaveCount(0)
})

test('deletes saved AI history from Page Lens', async ({page}) => {
  await page.getByRole('button',{name:/Page Lens/}).click()
  await expect(page.getByText('Explain のこと')).toBeVisible()
  page.once('dialog',(dialog)=>dialog.accept())
  const deleted=page.waitForRequest((request)=>request.url().includes('/ai-history/selection/ai1')&&request.method()==='DELETE')
  await page.getByTitle('Delete saved query').click();await deleted
  await expect(page.getByText('Explain のこと')).toHaveCount(0)
})

test('restores a database backup through the guarded library UI', async ({page}) => {
  await page.locator('.reader-header__left .icon-button').click()
  page.once('dialog',(dialog)=>dialog.accept())
  const restored=page.waitForRequest((request)=>request.url().endsWith('/api/restore')&&request.method()==='POST')
  await page.locator('.restore-button input').setInputFiles({name:'backup.db',mimeType:'application/vnd.sqlite3',buffer:Buffer.from('sqlite')})
  await restored
  await expect(page.getByRole('button',{name:/Study inbox/})).toBeVisible()
})

test('batches page comprehension answers into one Meaning Check',async({page})=>{
  await page.getByTitle('Check your understanding').click()
  await expect(page.getByRole('heading',{name:'Meaning Check'})).toBeVisible()
  await page.getByPlaceholder('What do you think this means?').first().fill('Once upon a time')
  const request=page.waitForRequest((request)=>request.url().endsWith('/meaning-check')&&request.method()==='POST')
  await page.getByRole('button',{name:/Check 1 bubble/}).click()
  expect((await request).postDataJSON()).toMatchObject({answers:[{block_index:0,interpretation:'Once upon a time'}],include_artwork:false})
  await expect(page.getByText('You understood the story opening.')).toBeVisible()
  await expect(page.getByText('Meaning captured')).toBeVisible()
  await expect(page.getByText('Once upon a time',{exact:true})).toBeVisible()
})

test('preserves Meaning Check drafts while vocabulary temporarily covers it',async({page})=>{
  await page.getByTitle('Check your understanding').click()
  const answer=page.getByPlaceholder('What do you think this means?').first()
  await answer.fill('A long time ago\nThis is my complete interpretation.')
  await expect.poll(()=>answer.evaluate((field)=>field.clientHeight>=field.scrollHeight)).toBeTruthy()
  await selectFirstBubble(page);await page.getByRole('button',{name:/Look up/}).click()
  await expect(page.getByRole('heading',{name:'むかしむかし'})).toBeVisible()
  await page.locator('.lookup-panel .icon-button').click()
  await expect(page.getByRole('heading',{name:'Meaning Check'})).toBeVisible()
  await expect(answer).toHaveValue('A long time ago\nThis is my complete interpretation.')
})

test('allows the artwork to be dragged beyond its viewport position',async({page})=>{
  const stage=page.locator('.reader-stage');const box=await stage.boundingBox();if(!box)throw new Error('Reader stage missing')
  await page.mouse.move(box.x+100,box.y+180);await page.mouse.down();await page.mouse.move(box.x+240,box.y+260,{steps:5});await page.mouse.up()
  await expect(page.locator('.page-wrap')).toHaveCSS('transform',/matrix\(1, 0, 0, 1, 140, 80\)/)
})
