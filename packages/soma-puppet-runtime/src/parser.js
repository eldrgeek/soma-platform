/* Puppet Script v0.5 parser + validator. Deliberately no framework dependency. */
  const KINDS=new Set('navbar sidebar toolbar hero button link field card list table text label image avatar badge tabs host-panel composer toast xbox spacer region row stack play-view stage-read video-view video-read script-editor'.split(' '));
  const ROLES=new Set('@primary @secondary @danger @ghost @voice @ai @inert @required @multiline @select @toggle @text @date @top @bottom @left @right @main @center @overlay @top-right @bottom-right @modal'.split(' '));
  const ACTIONS=/^(opens (screen|dialog) "[^"]+"|closes (self|dialog "[^"]+")|back|toast "[^"]+"|starts host "[^"]+"|sets field "[^"]+" = "[^"]+"|sets status "[^"]+"|adds to stub [\w-]+ \{.*\}|adds to [\w-]+ \{.*\}|removes from [\w-]+|goto story "[^"]+"|no-op)$/;
  const STATE_WHERE=new Set('localStorage sessionStorage database memory url'.split(' '));
  /* v0.3: the host decides a row's status; new rows start pending. */
  const STATUSES=new Set(['confirmed','declined']);
  const DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const strip=s=>s.replace(/\s+(#|\/\/).*$/,'').trimEnd();
  const q=s=>{const m=s.match(/^"([^"]*)"/);return m?m[1]:null};
  const value=s=>{s=s.trim();if(/^"/.test(s))return q(s);if(/^\[/.test(s))return s.slice(1,-1).split(',').map(x=>x.trim()).filter(Boolean).map(x=>q(x)??x);return s};
  function props(s){const out={};const re=/(\b[a-z][\w-]*)\s*:\s*("[^"]*"|\[[^\]]*\]|\{[^}]*\}|[^\s]+)/gi;let m;while(m=re.exec(s))out[m[1]]=value(m[2]);return out}
  function row(s){const out={};const re=/(\b[\w-]+)\s*:\s*"([^"]*)"/g;let m;while(m=re.exec(s))out[m[1]]=m[2];return out}
  function actions(s,line,errors){return s.split(';').map(x=>x.trim()).filter(Boolean).map(x=>{if(!ACTIONS.test(x)){errors.push({line,message:`Unknown action: ${x}`});return {type:'no-op'}}const m=x.match(/^opens (screen|dialog) "([^"]+)"$/);if(m)return{type:'open',targetType:m[1],name:m[2]};if(x==='closes self')return{type:'close-self'};const c=x.match(/^closes dialog "([^"]+)"$/);if(c)return{type:'close-dialog',name:c[1]};const t=x.match(/^toast "([^"]+)"$/);if(t)return{type:'toast',message:t[1]};const h=x.match(/^starts host "([^"]+)"$/);if(h)return{type:'host',name:h[1]};const st=x.match(/^sets status "([^"]+)"$/);if(st){if(!STATUSES.has(st[1]))errors.push({line,message:`sets status takes "confirmed" or "declined", not "${st[1]}"`});return{type:'set-status',status:st[1]}}const addStub=x.match(/^adds to stub ([\w-]+) \{(.*)\}$/);if(addStub)return{type:'add-stub',target:addStub[1],row:row(addStub[2])};const add=x.match(/^adds to ([\w-]+) \{(.*)\}$/);if(add)return{type:'add',target:add[1],row:row(add[2])};const remove=x.match(/^removes from ([\w-]+)$/);if(remove)return{type:'remove',target:remove[1]};if(x==='back')return{type:'back'};return{type:'no-op'}})}
  function element(raw,line,errors){let hook=[];let [before,after]=raw.split(/\s+->\s+/,2);if(after)hook=actions(after,line,errors);const kind=(before.match(/^([\w-]+)/)||[])[1];if(!KINDS.has(kind)){errors.push({line,message:`Unknown element kind: ${kind||before}`});return null}const rest=before.slice(kind.length).trim();const label=q(rest);const roles=[...rest.replace(/"[^"]*"/g,'').matchAll(/@[\w-]+/g)].map(m=>m[0]);roles.forEach(r=>{if(!ROLES.has(r))errors.push({line,message:`Unknown role: ${r}`})});const el={kind,label,roles,props:props(rest),hook,line,end:line,children:[]};const from=rest.match(/\bfrom\s+(\w+)/);if(from)el.from=from[1];if(kind==='navbar'||kind==='sidebar'){const pos=rest.match(/\b(top|bottom|left|right)\b/);el.position=pos&&pos[1]}return el}
  /* Line spans are kept off the enumerable shape of data blocks, which callers compare whole. */
  const span=(node,line)=>Object.defineProperties(node,{line:{value:line,writable:true},end:{value:line,writable:true}});
  function parse(source){const errors=[],warnings=[],root={screens:[],dialogs:[],stubs:{},data:{},states:{},stories:[],app:null,meta:null,theme:null};const lines=source.replace(/\r/g,'').split('\n');let stack=[{indent:-1,node:root,type:'root'}],last=0;const pop=end=>{const top=stack.pop();if(top.node!==root)top.node.end=end};
    for(let i=0;i<lines.length;i++){let raw=strip(lines[i]);if(!raw.trim())continue;const indent=raw.match(/^\s*/)[0].length;if(indent%2){errors.push({line:i+1,message:'Indentation must use 2-space steps'});continue}raw=raw.trim();if(raw==='}'){if(stack.length===1)errors.push({line:i+1,message:'Unexpected }'});else pop(i+1);last=i+1;continue}while(stack.length>1&&indent<=stack.at(-1).indent)pop(last);last=i+1;const parent=stack.at(-1);let m;
      if((m=raw.match(/^puppet\s+"([^"]+)"(?:\s+version\s+"([^"]+)")?$/))){root.meta={title:m[1],version:m[2]};continue}if((m=raw.match(/^theme:\s*([\w-]+)$/))){root.theme=m[1];continue}
      if((m=raw.match(/^data\s+([\w-]+)\s*\{$/))){const name=m[1],node=span({fields:[]},i+1);root.data[name]=node;stack.push({indent,node,type:'data'});continue}
      if((m=raw.match(/^screen\s+"([^"]+)"\s+from\s+([\w-]+)\s*\{$/))){const node={type:'screen',name:m[1],from:m[2],props:{},children:[],line:i+1,end:i+1};root.screens.push(node);stack.push({indent,node,type:'screen'});continue}
      if((m=raw.match(/^(app|screen|dialog|stub|state|story)\s+(?:"([^"]+)"|([\w-]+))\s*\{$/))){const type=m[1],name=m[2]||m[3],node={type,name,props:{},children:[],line:i+1,end:i+1};if(type==='app')root.app=node;else if(type==='screen')root.screens.push(node);else if(type==='dialog')root.dialogs.push(node);else if(type==='stub')root.stubs[name]=node;else if(type==='state')root.states[name]=node;else root.stories.push(node);stack.push({indent,node,type});continue}
      if(raw.startsWith('-> ')){const previous=parent.node.children.at(-1);if(!previous){errors.push({line:i+1,message:'Hook has no preceding element'});continue}previous.hook=actions(raw.slice(3),i+1,errors);previous.end=Math.max(previous.end??0,i+1);continue}
      if(parent.type==='stub'&&/^\{.*\}$/.test(raw)){const row={};for(const pair of raw.slice(1,-1).split(',')){const pm=pair.trim().match(/^(\w+):\s*(.*)$/);if(pm)row[pm[1]]=value(pm[2])}parent.node.children.push(row);continue}
      if(parent.type==='story'){if((m=raw.match(/^entry:\s*screen\s+"([^"]+)"$/)))parent.node.entry=m[1];else if((m=raw.match(/^done:\s*"([^"]+)"$/)))parent.node.done=m[1];continue}
      if((m=raw.match(/^(region|row|stack)(?:\s+(\w+))?\s*\{$/))){const node={kind:m[1],label:m[2]||null,props:{},roles:[],hook:[],children:[],line:i+1,end:i+1};parent.node.children.push(node);stack.push({indent,node,type:'element'});continue}
      if((m=raw.match(/^on\s+(press|submit|select|close|change)\s+->\s+(.+)$/))){const target=parent.node;target.hook=actions(m[2],i+1,errors);target.event=m[1];continue}
      if(parent.type==='data'&&/^fields:/.test(raw)){parent.node.fields=value(raw.slice(raw.indexOf(':')+1));continue}
      if(parent.type==='data'&&(m=raw.match(/^read:\s*(.*)$/))){if(m[1]==='own'||m[1]==='private')parent.node.read=m[1];else errors.push({line:i+1,message:`read: takes own or private, not ${m[1]||'nothing'}`});continue}
      if(parent.type==='data'){errors.push({line:i+1,message:`A data block takes only fields: and read:, not ${raw}`});continue}
      if(/^[\w-]+:/.test(raw)){Object.assign(parent.node.props,props(raw));continue}
      const el=element(raw,i+1,errors);if(el){parent.node.children.push(el);if(raw.endsWith('{'))stack.push({indent,node:el,type:'element'})}
    }
    while(stack.length>1)pop(last);
    if(!root.meta?.version)errors.push({line:1,message:'Missing required puppet version'});for(const entry of Object.values(root.states)){if(!entry.props.where)errors.push({line:entry.line,message:`State "${entry.name}" needs where: <store>`});else if(!STATE_WHERE.has(entry.props.where))warnings.push({line:entry.line,message:`State "${entry.name}" uses custom store "${entry.props.where}"`})}for(const s of [...root.screens,...root.dialogs])for(const el of walk(s.children)){for(const a of el.hook||[]){if(a.type==='open'&&!((a.targetType==='screen'?root.screens:root.dialogs).some(x=>x.name===a.name)))errors.push({line:el.line,message:`Unknown ${a.targetType} target: ${a.name}`});if((a.type==='add'||a.type==='remove')&&!root.data[a.target])errors.push({line:el.line,message:`Unknown data: ${a.target}`});if(a.type==='add'&&root.data[a.target]){const fields=root.data[a.target].fields||[];for(const f of Object.keys(a.row||{}))if(!fields.includes(f))errors.push({line:el.line,message:`Undeclared field for ${a.target}: ${f}`})}if(a.type==='add-stub'&&!root.stubs[a.target])errors.push({line:el.line,message:`Unknown stub: ${a.target}`})}if((el.kind==='list'||el.kind==='table')&&el.from&&!root.stubs[el.from]&&!root.data[el.from])errors.push({line:el.line,message:`Unknown collection: ${el.from}`});if(el.props.bind&&!root.states[el.props.bind])errors.push({line:el.line,message:`Unknown state binding: ${el.props.bind}`});for(const token of (el.label||'').matchAll(/\{([\w-]+)\.count\}/g))if(!root.data[token[1]])errors.push({line:el.line,message:`Unknown data: ${token[1]}`})}
    for(const s of [...root.screens,...root.dialogs]){const n=walk(s.children).filter(x=>x.roles?.includes('@primary')).length;if(n>1)warnings.push({line:s.line,message:`${s.name} has ${n} primary actions`})}privacy(root,errors,warnings);return{sketch:root,errors,warnings}
  }
  function walk(items){return items.flatMap(x=>[x,...walk(x.children||[])])}
  /* v0.3 rules: host-only screens and dialogs, read: own, @date, status. Marks hostOnly on host-only
     screens and dialogs and on every element inside them, and rowOf (the data a row button acts on). */
  function mark(items,hostOnly,rowOf){for(const el of items){if(hostOnly)el.hostOnly=true;if(rowOf)el.rowOf=rowOf;mark(el.children||[],hostOnly,(el.kind==='list'||el.kind==='table')&&el.from?el.from:rowOf)}}
  /* The collections an element reads (list, table, {Name.count}); with writes, also the ones its actions change. */
  function reads(el,writes){const names=[];if((el.kind==='list'||el.kind==='table')&&el.from)names.push(el.from);for(const text of [el.label,...Object.values(el.props||{})].filter(x=>typeof x==='string'))for(const t of text.matchAll(/\{([\w-]+)\.count\}/g))names.push(t[1]);if(writes)for(const a of el.hook||[])if(a.target)names.push(a.target);return names}
  function privacy(root,errors,warnings){
    if(root.app&&root.app.props.requires==='host')errors.push({line:root.app.line,message:'requires: host goes on a screen or dialog, not on app'});
    const owners=[...root.screens,...root.dialogs],hostOwner=o=>o.props.requires==='host',seen={};
    for(const o of owners){if(hostOwner(o))o.hostOnly=true;mark(o.children,o.hostOnly,o.from||null)}
    v04(root,errors,warnings);
    for(const o of owners){const fields={};for(const el of walk(o.children))if(el.kind==='field'&&el.label!=null)(fields[el.label]??=[]).push(el);if(o.from)(seen[o.from]??=new Set()).add(o.hostOnly?'host':'everyone');
      for(const el of walk(o.children)){
        if(el.props.requires==='host')errors.push({line:el.line,message:'requires: host goes on a screen or dialog, not on an element'});
        for(const name of reads(el))(seen[name]??=new Set()).add(el.hostOnly?'host':'everyone');
        if(el.roles.includes('@date')&&el.kind!=='field')errors.push({line:el.line,message:'@date goes only on a field'});
        if(el.props.days!==undefined){if(!el.roles.includes('@date'))errors.push({line:el.line,message:'days: goes only on a @date field'});for(const d of [].concat(el.props.days))if(!DAYS.includes(d))errors.push({line:el.line,message:`days: takes Mon Tue Wed Thu Fri Sat Sun, not ${d}`})}
        for(const a of el.hook||[]){
          if(a.type==='open'){const target=(a.targetType==='screen'?root.screens:root.dialogs).find(x=>x.name===a.name);if(target?.hostOnly&&!el.hostOnly)errors.push({line:el.line,message:`Only the host sees ${a.targetType} "${a.name}"; something everyone sees may not open it`});if((a.targetType==='dialog'||target?.from)&&target&&el.hostOnly&&!target.hostOnly)errors.push({line:el.line,message:`${a.targetType==='dialog'?'Dialog':'Screen'} "${a.name}" is sent to everyone; add requires: host to it before a host-only screen opens it`})}
          const data=root.data[a.target];
          if(a.type==='add'&&data?.fields?.includes('status')&&Object.hasOwn(a.row||{},'status'))errors.push({line:el.line,message:`A new row of ${a.target} starts with status pending; adds to ${a.target} may not set status`});
          if(a.type==='add')for(const t of Object.values(a.row||{}).join(' ').matchAll(/\{form\.([^}]+)\}/g)){const same=fields[t[1]]||[];if(same.length>1&&same.some(f=>f.roles.includes('@date')))errors.push({line:el.line,message:`Several fields are labelled "${t[1]}" here and one is @date; give them different labels`})}
          if((a.type==='remove'||a.type==='set-status')&&el.rowOf&&a.target!==undefined&&a.target!==el.rowOf)errors.push({line:el.line,message:`A button inside a list of ${el.rowOf} acts on ${el.rowOf}, not ${a.target}`});
          if(a.type==='set-status'){if(el.kind!=='button')errors.push({line:el.line,message:'sets status goes on a button'});if(!el.rowOf)errors.push({line:el.line,message:'sets status goes on a button inside a list or table'});else if(!root.data[el.rowOf]?.fields?.includes('status'))errors.push({line:el.line,message:`sets status needs declared data with a status field; ${el.rowOf} has none`});if(!el.hostOnly)errors.push({line:el.line,message:'Only the host sets status; put this button on a screen with requires: host'})}
        }
      }
    }
    for(const [name,data] of Object.entries(root.data)){if(data.read==='private'&&data.fields?.includes('status'))errors.push({line:data.line,message:`Data ${name} is read: private, so the host cannot read the rows a status would decide; remove status or use read: own`});if(data.read||seen[name]?.has('everyone'))continue;if(seen[name]?.has('host'))errors.push({line:data.line,message:`Data ${name} is read only on host-only screens; add read: own or read: private so its rows reach no one else`});else warnings.push({line:data.line,message:`Nothing reads data ${name}, yet any reader can fetch its rows; add read: own or read: private to keep them private`})}
  }
  /* v0.4 rules: screens from data (row screens), stage-read and play-view, and the token check. A token
     must be one the renderer fills: {me.name}, {Name.count} of declared data, {form.Label} of a field on
     the same screen or dialog, {row.field} of a row screen's data (not in an adds to). Version 0.4 and
     later: errors; 0.2 and 0.3: warnings, so live descriptions keep working; 0.1 sketches: not checked. */
  /* v0.5 words (VideoMaker): video-view, video-read and script-editor. */
  const V05=new Set(['video-view','video-read','script-editor']);
  function v04(root,errors,warnings){
    const version=parseFloat(root.meta?.version),level=Number.isNaN(version)||version>=0.4?errors:version>=0.2?warnings:null;
    root.screens.forEach((s,index)=>{if(!s.from)return;if(!root.data[s.from])errors.push({line:s.line,message:`Screen "${s.name}" shows a row of ${s.from}, which is not declared data`});if(index===0)errors.push({line:s.line,message:`Screen "${s.name}" shows one row, so it cannot be where the app opens; put another screen first`})});
    const owners=[...root.screens,...root.dialogs],opened=new Set();
    for(const o of owners){const labels=new Set(walk(o.children).flatMap(el=>el.kind==='field'&&el.label!=null?[el.label]:el.kind==='composer'?[el.props.field??'Message']:[])),fields=o.from?root.data[o.from]?.fields||[]:null;
      const check=(text,el,where)=>{for(const t of String(text).matchAll(/\{([^}]*)\}/g)){const token=t[1],count=token.match(/^([\w-]+)\.count$/),form=token.match(/^form\.(.+)$/),rowField=token.match(/^row\.([\w-]+)$/);
        if(token==='me.name')continue;if(count&&root.data[count[1]])continue;if(form&&labels.has(form[1]))continue;
        if(rowField){if(where==='adds')errors.push({line:el.line,message:`{${token}} may not go in an adds to; only text on a row screen shows a row's fields`});else if(!fields)errors.push({line:el.line,message:`{${token}} works only on a screen from data, such as screen "Scene" from scenes`});else if(!fields.includes(rowField[1]))errors.push({line:el.line,message:`{${token}}: ${o.from} has no field ${rowField[1]}`});continue}
        if(count)continue;/* an undeclared count is already an error */
        level?.push({line:el.line,message:`{${token}} will not be filled in: this runtime fills only {me.name}, {Name.count}, {form.Label} and {row.field}`})}};
      for(const el of walk(o.children)){
        if(el.kind==='field'){if(/\{[^}]*\}/.test(el.label||''))level?.push({line:el.line,message:`A field's label is shown as written, so "${el.label}" may not hold a {token}`})}else if(el.label)check(el.label,el,'text');
        for(const [key,text] of Object.entries(el.props||{}))if(typeof text==='string'&&!['bind','field','id'].includes(key))check(text,el,'text');
        for(const a of el.hook||[]){if(a.type==='toast')check(a.message,el,'text');if(a.type==='add'||a.type==='add-stub')for(const text of Object.values(a.row||{}))check(text,el,'adds');
          if(a.type==='open'&&a.targetType==='screen'){const target=root.screens.find(x=>x.name===a.name);if(target?.from){const fromList=(el.kind==='list'||el.kind==='table')&&el.from===target.from;if(fromList||el.rowOf===target.from)opened.add(target.name);else errors.push({line:el.line,message:`Screen "${target.name}" shows one row of ${target.from}; open it from a list or table of ${target.from}, or from a button inside one`})}}}
        if(el.kind==='play-view'&&el.label==null)errors.push({line:el.line,message:'play-view needs its text in quotes, usually play-view "{row.text}"'});
        if(el.kind==='stage-read'){const m=String(el.label??'').match(/^\{row\.([\w-]+)\}$/);if(!m||!o.from)errors.push({line:el.line,message:'stage-read reads one field of a row: write stage-read "{row.text}" on a screen from your data'});else el.field=m[1]}
        if(V05.has(el.kind)){if(!(version>=0.5))errors.push({line:el.line,message:`${el.kind} is a Puppet v0.5 element; write version "0.5"`});if(el.kind==='video-view'&&el.label==null)errors.push({line:el.line,message:'video-view needs its text in quotes, usually video-view "{row.text}"'});
          if(el.kind!=='video-view'){const m=String(el.label??'').match(/^\{row\.([\w-]+)\}$/);if(!m||!o.from)errors.push({line:el.line,message:`${el.kind} works on one field of a row: write ${el.kind} "{row.text}" on a screen from your data`});else{el.field=m[1];if(el.kind==='script-editor'&&m[1]==='status')errors.push({line:el.line,message:'script-editor may not change status; only the host sets it'})}}}
      }}
    for(const s of root.screens)if(s.from&&!opened.has(s.name))errors.push({line:s.line,message:`Nothing opens screen "${s.name}"; open it from a list or table of ${s.from}`});
  }
  /* The description a reader who is not the host receives: no host-only screens or dialogs, no story that
     starts on one, no comments, and no data or stub block that nothing they receive names. Fails closed when
     the result would not parse. */
  function guestSource(source){
    const {sketch,errors}=parse(source);if(errors.length)throw new Error('The live description has parse errors');
    const drop=new Set(),cut=n=>{for(let x=n.line;x<=n.end;x++)drop.add(x)},named=new Set();
    for(const o of [...sketch.screens,...sketch.dialogs]){if(o.hostOnly){cut(o);continue}for(const el of walk(o.children))reads(el,true).forEach(n=>named.add(n))}
    for(const [name,node] of [...Object.entries(sketch.data),...Object.entries(sketch.stubs)])if(!named.has(name))cut(node);
    for(const story of sketch.stories)if(sketch.screens.find(s=>s.name===story.entry)?.hostOnly)cut(story);
    const out=source.replace(/\r/g,'').split('\n').filter((_,i)=>!drop.has(i+1)).map(strip).join('\n');
    const check=parse(out);if(check.errors.length||[...check.sketch.screens,...check.sketch.dialogs].some(o=>o.hostOnly))throw new Error('The description could not be prepared for this reader');
    return out;
  }
  /* This is a source-order projection of declared nodes and hooks, not inferred behavior. */
  function logic(sketch){
    const nodes=[...sketch.screens.map((screen,index)=>({id:`screen:${screen.name}`,name:screen.name,type:'screen',index})),...sketch.dialogs.map((dialog,index)=>({id:`dialog:${dialog.name}`,name:dialog.name,type:'dialog',index:sketch.screens.length+index}))];
    const nodeIds=new Set(nodes.map(node=>node.id)),edges=[];
    for(const owner of [...sketch.screens,...sketch.dialogs]){const from=`${owner.type}:${owner.name}`;for(const element of walk(owner.children))for(const action of element.hook||[]){const trigger=element.label||element.kind;if(action.type==='open'){const to=`${action.targetType}:${action.name}`;if(nodeIds.has(to))edges.push({from,to,label:`${trigger} · opens ${action.targetType}`})}else if(action.type==='back')edges.push({from,to:from,label:`${trigger} · back`});else if(action.type==='close-self')edges.push({from,to:from,label:`${trigger} · closes self`});else if(action.type==='close-dialog')edges.push({from,to:from,label:`${trigger} · closes dialog ${action.name}`});else if(action.type==='host')edges.push({from,to:from,label:`${trigger} · starts host ${action.name}`});else if(action.type==='toast')edges.push({from,to:from,label:`${trigger} · toast: ${action.message}`})}}
    return {nodes,edges};
  }
export {parse,walk,logic,guestSource,DAYS};
