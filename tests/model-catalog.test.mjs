import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseModelCatalog, discoverModels } from '../lib/model-catalog.ts';
import { modelIdentity, modelIdentityText } from '../lib/model-response.ts';
import { resolveModelConfig, buildModelRequest } from '../lib/model-config.ts';

test('catalog comes from API data and preserves arbitrary future model IDs', () => {
  assert.deepEqual(parseModelCatalog({data:[{id:'glm-5.3-flash',name:'GLM 5.3 Flash'},{id:'new-model-2099'},{id:'glm-5.3-flash'},{id:'image-only',output_modalities:['image']}]}).map(m=>m.id),['glm-5.3-flash','new-model-2099']);
  assert.deepEqual(parseModelCatalog({output:{models:[{model:'some-workspace-model',name:'空间模型'}]}}),[{id:'some-workspace-model',name:'空间模型'}]);
  assert.throws(()=>parseModelCatalog({data:[]}));
  assert.throws(()=>parseModelCatalog({data:'not a list'}));
});
test('catalog keys go only to fixed provider endpoints and never enter errors', async () => {
  let seen;
  const result=await discoverModels('glm','test-key',async(url,options)=>{seen={url,options};return Response.json({data:[{id:'glm-5.3-flash'}]});});
  assert.equal(result[0].id,'glm-5.3-flash');
  assert.equal(seen.url,'https://open.bigmodel.cn/api/paas/v4/models');
  assert.equal(seen.options.headers.Authorization,'Bearer test-key'); assert.equal(seen.options.redirect,'error');
  await assert.rejects(()=>discoverModels('glm','secret-never-echo',async()=>new Response('secret-never-echo',{status:401})),error=>!error.message.includes('secret-never-echo')&&error.status===401);
  await assert.rejects(()=>discoverModels('glm','test',async()=>new Response('',{status:404})),/不支持读取/);
});
test('chosen model is sent verbatim and GLM 5.3 thinking is not disabled',()=>{
  assert.throws(()=>resolveModelConfig({provider:'glm',apiKey:'test'},{}),/选择型号/);
  const selected=resolveModelConfig({provider:'glm',apiKey:'test',model:'glm-5.3-flash'},{});
  const payload=JSON.parse(buildModelRequest(selected,'JSON','input').init.body);
  assert.equal(payload.model,'glm-5.3-flash');assert.equal(payload.thinking.type,'enabled');assert.equal(payload.reasoning_effort,'low');assert.ok(payload.max_tokens>=12000);
});
test('model identity distinguishes returned aliases, absent metadata and legacy records',()=>{
  assert.equal(modelIdentity('glm-5.3-flash','glm-5.3-flash').status,'matched');
  const changed=modelIdentity('glm-5.3-flash','glm-4.7');assert.equal(changed.status,'different');assert.match(modelIdentityText(changed,'glm-4.7'),/不同/);
  assert.deepEqual(modelIdentity('glm-5.3-flash',undefined),{requestedModel:'glm-5.3-flash',returnedModel:null,status:'unreported'});
  assert.match(modelIdentityText(undefined,'glm-4.7'),/历史记录未核验/);
});
