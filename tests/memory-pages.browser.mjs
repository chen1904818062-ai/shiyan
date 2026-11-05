import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'playwright');
const files={'/shiyan/':'index.html','/shiyan/map.js':'map.js','/shiyan/map.css':'map.css'};
const server=createServer(async(req,res)=>{const file=files[req.url];if(!file){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await readFile('memory-site/'+file));});
await new Promise(done=>server.listen(18897,'127.0.0.1',done));let browser,passed=0;const check=s=>{passed++;console.log('PASS '+s);};
try{
 browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],outgoing=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:18897/'))outgoing.push(r.url());});
 await page.goto('http://127.0.0.1:18897/shiyan/');await page.getByRole('button',{name:'查看虚构示例'}).click();
 assert.equal(await page.locator('#map g[role=button]').count(),15);assert.match(await page.locator('#message').innerText(),/虚构/);check('Pages project subpath loads without CDN or absolute asset paths');
 await page.locator('#map g[role=button]').first().focus();await page.keyboard.press('Enter');assert.match(await page.locator('#detail').innerText(),/虚构的演示原句/);check('graph nodes support keyboard navigation and show source quotes');
 await page.getByLabel('本页显示私密及敏感记忆').check();assert.equal(await page.locator('#map g[role=button]').count(),16);await page.getByLabel('本页显示私密及敏感记忆').uncheck();assert.equal(await page.locator('#map g[role=button]').count(),15);assert.doesNotMatch(await page.locator('#detail').innerText(),/原句证据/);check('private records require opt-in and hiding them clears open details');
 await page.getByRole('button',{name:'经历时间线',exact:true}).click();assert.match(await page.locator('#timeline').innerText(),/发生时间未记录/);check('timeline keeps unknown dates separate from known event dates');
 const payload='<img src="https://example.invalid/leak" onerror="alert(1)">';
 const m={id:'malicious',kind:'event',status:'confirmed',sensitivity:'normal',statement:payload,detail:'不可信输入',topicId:'t',topicTitle:'输入测试',occurredAt:null,evidence:[{quote:payload,conversationTitle:payload,speakerRole:'user'}]};
 await page.locator('#file').setInputFiles({name:'memories.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({version:1,memories:[m]}))});
 await page.getByRole('button',{name:payload,exact:true}).click();assert.equal(await page.locator('#detail img').count(),0);assert.match(await page.locator('#detail').innerText(),/<img/);assert.deepEqual(outgoing,[]);check('malicious statements and evidence render as text, without uploads or external requests');
 assert.deepEqual(await page.evaluate(()=>({local:localStorage.length,session:sessionStorage.length})),{local:0,session:0});
 await page.reload();assert.equal(await page.locator('#map g[role=button]').count(),0);check('imported memories do not survive refresh or enter browser storage');
 await page.getByRole('button',{name:'查看虚构示例'}).click();await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await mkdir('.sites-runtime/screenshots',{recursive:true});await page.getByRole('button',{name:'关系地图',exact:true}).click();await page.screenshot({path:'.sites-runtime/screenshots/memory-atlas-mobile.png',fullPage:true});await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:'.sites-runtime/screenshots/memory-atlas-desktop.png',fullPage:true});
 await page.getByRole('button',{name:'清除本页数据'}).click();assert.equal(await page.locator('#map g[role=button]').count(),0);assert.deepEqual(errors,[]);check('mobile layout, clear control and rendering have no script errors');
 console.log(JSON.stringify({passed,outgoingRequests:outgoing.length,browserErrors:errors}));
}finally{await browser?.close();await new Promise(done=>server.close(done));}
