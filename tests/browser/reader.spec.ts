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
    if(url.pathname==='/api/llm/status') return route.fulfill({json:{preferred:'mock',providers:[{id:'mock',name:'Mock',model:'local-test',configured:true}]}})
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
