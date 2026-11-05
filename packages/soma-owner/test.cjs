/* Checks for soma-owner.js: the public file carries neither the secret nor the
 * device token, the right key activates, and the published check value does not.
 * Run: node packages/soma-owner/test.cjs */
const fs=require('fs'),crypto=require('crypto'),vm=require('vm');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const secret='testsecret0123456789abcdef';
/* Same substitution as build.mjs, with a throwaway secret, so dist/ is untouched. */
const src=fs.readFileSync(__dirname+'/soma-owner.template.js','utf8')
  .replace('__OWNER_CHECK__', sha(sha(secret))).replace('__VERSION__', 'test');
function run(search, store){
  const ls={...store}; const ctx={localStorage:{getItem:k=>k in ls?ls[k]:null,setItem:(k,v)=>ls[k]=String(v),removeItem:k=>delete ls[k]},
    location:{search,pathname:'/',hash:''},history:{replaceState(){}},URLSearchParams,document:{readyState:'complete',documentElement:{classList:{add(){},remove(){}}},createElement:()=>({style:{},setAttribute(){}}),head:{insertBefore(){}},getElementsByTagName:()=>[{insertBefore(){}}],body:null,querySelectorAll:()=>[]},CustomEvent:class{},unescape,encodeURIComponent};
  ctx.window=ctx; ctx.globalThis=ctx; ctx.dispatchEvent=()=>{};
  vm.createContext(ctx); vm.runInContext(src,ctx); return {owner:ctx.SomaOwner.isOwner(), ls};
}
// sha impl check via exposed? re-run internal through activation: compare lengths
let ok=true; const t=(n,c)=>{console.log((c?'PASS ':'FAIL ')+n); ok=ok&&c};
t('file has no secret', !src.includes(secret));
t('file has no device token', !src.includes(sha(secret)));
let r=run('?soma_owner_key='+secret,{}); t('right key activates', r.owner && r.ls.soma_owner===sha(secret));
t('stored token persists', run('',{soma_owner:sha(secret)}).owner);
r=run('?soma_owner_key=wrong',{}); t('wrong key ignored', !r.owner);
const check=src.match(/OWNER_CHECK   = '([0-9a-f]{64})'/)[1];
r=run('',{soma_owner:check}); t('pasting public check value does not work', !r.owner && !('soma_owner' in r.ls));
r=run('',{soma_owner:'stale'}); t('stale token removed', !r.owner && !('soma_owner' in r.ls));
// sha256 correctness on odd lengths / unicode via activation path
for (const s of ['', 'a', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'x'.repeat(200), 'héllo✓']) {
  const m=src.replace(/OWNER_CHECK   = '[0-9a-f]{64}'/, "OWNER_CHECK   = '"+sha(sha(s))+"'");
  const ctxSrc=m; const ls={}; const ctx={localStorage:{getItem:k=>k in ls?ls[k]:null,setItem:(k,v)=>ls[k]=v,removeItem:k=>delete ls[k]},location:{search:'?soma_owner_key='+encodeURIComponent(s),pathname:'/',hash:''},history:{replaceState(){}},URLSearchParams,document:{readyState:'complete',documentElement:{classList:{add(){},remove(){}}},createElement:()=>({style:{},setAttribute(){}}),head:{insertBefore(){}},getElementsByTagName:()=>[{insertBefore(){}}],body:null,querySelectorAll:()=>[]},CustomEvent:class{},unescape,encodeURIComponent,dispatchEvent(){}};
  ctx.window=ctx; vm.createContext(ctx); vm.runInContext(ctxSrc,ctx);
  t('sha256 len '+s.length, ls.soma_owner===sha(s));
}
process.exit(ok?0:1);
