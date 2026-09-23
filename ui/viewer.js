import { mergeAssets } from './asset_updates.mjs';
import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { TransformControls } from './vendor/TransformControls.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { GLTFExporter } from './vendor/GLTFExporter.js';
const $=id=>document.getElementById(id), clone=x=>JSON.parse(JSON.stringify(x));
const prefix=location.pathname.split('/worldviewer/')[0];
const apiPath=path=>`${prefix}/worldviewer/${path}`;
const scene=new THREE.Scene();scene.background=new THREE.Color('#26343c');
const camera=new THREE.PerspectiveCamera(45,1,.01,100000);camera.up.set(0,0,1);camera.position.set(6,-8,5);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(640,480,false);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
$('viewport').appendChild(renderer.domElement);
const orbit=new OrbitControls(camera,renderer.domElement);orbit.target.set(0,0,1);orbit.enableDamping=true;orbit.dampingFactor=.12;orbit.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.PAN,RIGHT:THREE.MOUSE.PAN};
const gizmo=new TransformControls(camera,renderer.domElement);gizmo.setSize(.8);const helper=gizmo.getHelper();scene.add(helper);
const assetsRoot=new THREE.Group();scene.add(assetsRoot);
const grid=new THREE.GridHelper(100,100,0x749086,0x3d5059);grid.rotation.x=Math.PI/2;scene.add(grid);
const axes=new THREE.AxesHelper(1.5);scene.add(axes);
const ambient=new THREE.HemisphereLight(0xe4f0ff,0x444d40,2);ambient.position.set(0,0,10);scene.add(ambient);
const sun=new THREE.DirectionalLight(0xffeddb,3);sun.position.set(3,-4,8);scene.add(sun);
const fill=new THREE.DirectionalLight(0xa8c9ee,1.5);fill.position.set(-4,5,3);scene.add(fill);
let selectionBox=null,selected=null,edit=false,dirty=false,revision='',saved=null,incoming=[],namespace='default',ready=false,busy=false;
let state={version:1,objects:[],camera:{position:[6,-8,5],target:[0,0,1]}};
let undo=[],redo=[],loadEpoch=0,dragBefore=null,noticeKind='',pendingPayload=null;
const objects=new Map(),cache=new Map(),keys=new Set();let flying=false,lastFrame=performance.now();
const loader=new GLTFLoader();
function notify(type,data={}){parent.postMessage({channel:'world-viewer',type,...data},location.origin);}
function status(text,error=false){$('status').textContent=text;$('status').style.color=error?'#ffb5a4':'';if(error)notify('error',{message:text});}
function cameraState(){return {position:camera.position.toArray(),target:orbit.target.toArray()};}
function snapshot(){const s=clone(state);s.camera=cameraState();s.viewport={grid:grid.visible,axes:axes.visible,lighting:Number($('light').value)};return s;}
function applyCamera(c){camera.position.fromArray(c.position);orbit.target.fromArray(c.target);camera.lookAt(orbit.target);orbit.update();}
function markDirty(){dirty=true;$('dirtyBadge').textContent='Unsaved changes';$('sceneStatus').textContent=`${state.objects.length} assets · draft`;try{localStorage.setItem('wv-draft-'+namespace,JSON.stringify({base:revision,state:snapshot()}));}catch{}notify('dirty',{dirty:true});}
function pushHistory(before){undo.push(before);if(undo.length>60)undo.shift();redo=[];markDirty();buttons();}
function buttons(){for(const id of ['duplicate','delete','ground','reset'])$(id).disabled=!selected||busy;$('undo').disabled=!undo.length||busy;$('redo').disabled=!redo.length||busy;$('save').disabled=!ready||busy;$('export').disabled=!ready||busy;}
function currentObject(){return state.objects.find(o=>o.id===selected);}
function select(id){selected=objects.has(id)?id:null;gizmo.detach();if(selectionBox){scene.remove(selectionBox);selectionBox.geometry.dispose();selectionBox.material.dispose();selectionBox=null;}
 if(selected){const obj=objects.get(selected);if(edit&&obj.visible)gizmo.attach(obj);selectionBox=new THREE.BoxHelper(obj,0xa5e4c2);scene.add(selectionBox);selectionBox.visible=edit&&obj.visible;}renderList();inspector();buttons();}
function renderList(){$('objectList').replaceChildren();$('objectCount').textContent=`${state.objects.length} objects`;
 for(const o of state.objects){const row=document.createElement('div');row.className='objectRow'+(o.id===selected?' selected':'');const name=document.createElement('button');name.className='name';name.textContent=o.name;name.title=o.source;name.onclick=()=>select(o.id);const eye=document.createElement('button');eye.className='eye';eye.textContent=o.visible?'◉':'○';eye.title=o.visible?'Hide':'Show';eye.onclick=()=>{const before=snapshot();o.visible=!o.visible;objects.get(o.id).visible=o.visible;pushHistory(before);select(selected);};row.append(name,eye);$('objectList').append(row);}}
function inspector(){$('properties').hidden=!selected;$('nothing').hidden=!!selected;const o=currentObject();if(!o)return;$('objectName').value=o.name;for(const kind of ['position','rotation','scale']){const fields=$(kind).querySelectorAll('input');o[kind].forEach((v,i)=>fields[i].value=Number((kind==='position'?v*100:kind==='rotation'?THREE.MathUtils.radToDeg(v):v).toFixed(3)));}}
for(const kind of ['position','rotation','scale'])for(let i=0;i<3;i++){const label=document.createElement('label');label.textContent='XYZ'[i];const input=document.createElement('input');input.type='number';input.step=kind==='scale'?.1:1;input.setAttribute('aria-label',`${kind} ${'XYZ'[i]}`);if(kind==='scale')input.min=.001;input.onchange=()=>{const o=currentObject(),n=Number(input.value);if(!o||!Number.isFinite(n)||(kind==='scale'&&n<=0)){inspector();return;}const before=snapshot();o[kind][i]=kind==='position'?n/100:kind==='rotation'?THREE.MathUtils.degToRad(n):n;syncTransform(o);pushHistory(before);inspector();};label.append(input);$(kind).append(label);}
function syncTransform(o){const g=objects.get(o.id);g.position.fromArray(o.position);g.rotation.set(...o.rotation);g.scale.fromArray(o.scale);g.visible=o.visible;g.updateMatrixWorld(true);selectionBox?.update();}
async function asset(id){if(!cache.has(id))cache.set(id,loader.loadAsync(apiPath('asset/'+id)).then(g=>{g.scene.traverse(o=>{if(o.isLight||o.isCamera)o.visible=false;});return g.scene;}).catch(e=>{cache.delete(id);throw e;}));return cache.get(id);}
async function rebuild(next,{cameraReset=false}={}){const epoch=++loadEpoch;ready=false;busy=true;buttons();$('loading').hidden=false;
 try{const roots=await Promise.all(next.objects.map(o=>asset(o.asset)));if(epoch!==loadEpoch)return;
 gizmo.detach();for(const g of objects.values())assetsRoot.remove(g);objects.clear();state=clone(next);
 state.objects.forEach((o,i)=>{const wrapper=new THREE.Group();wrapper.name=o.name;wrapper.userData.worldId=o.id;const correction=new THREE.Group();correction.rotation.x=Math.PI/2;correction.add(roots[i].clone(true));wrapper.add(correction);assetsRoot.add(wrapper);objects.set(o.id,wrapper);syncTransform(o);});
 if(cameraReset)applyCamera(state.camera);if(state.viewport){grid.visible=state.viewport.grid;axes.visible=state.viewport.axes;$('grid').checked=grid.visible;$('axes').checked=axes.visible;$('light').value=state.viewport.lighting;$('light').oninput();}ready=true;$('empty').hidden=!!state.objects.length;select(selected);$('sceneStatus').textContent=`${state.objects.length} assets · ${revision?'saved scene':'ready to arrange'}`;status('Ready');
 }catch(e){status('Could not load asset: '+e.message,true);$('empty').hidden=false;$('empty').querySelector('b').textContent='An asset could not be loaded.';$('empty').querySelector('span').textContent='Check that the asset is a supported static GLB.';}
 finally{if(epoch===loadEpoch){busy=false;$('loading').hidden=true;buttons();}}
}
function showNotice(kind,text){noticeKind=kind;$('notice').hidden=false;$('noticeText').textContent=text;$('acceptUpdates').hidden=kind!=='updates';$('restoreDraft').hidden=kind!=='draft';}
function checkUpdates(){const changed=incoming.some(a=>!state.objects.some(o=>o.source===a.source&&o.asset===a.asset));if(changed)showNotice('updates','Updated input assets are available. Apply them when you are ready.');else if(noticeKind==='updates'&&!pendingPayload)$('notice').hidden=true;}
async function init(payload){
 const keepDraft=edit&&dirty;
 const before=keepDraft?snapshot():clone(payload.state);
 const previousSources=keepDraft?incoming.map(a=>a.source):[];
 incoming=payload.incoming||[];
 const merged=mergeAssets(before,incoming,()=>crypto.randomUUID(),previousSources);
 if(!keepDraft){revision=payload.revision||'';saved=clone(payload.state);dirty=false;undo=[];redo=[];}
 pendingPayload=null;$('notice').hidden=true;
 await rebuild(merged.state,{cameraReset:!keepDraft});
 if(merged.changed){if(keepDraft)pushHistory(before);else markDirty();status('Input assets updated automatically. Save Work to commit this scene.');}
 else if(keepDraft)markDirty();
 else $('dirtyBadge').textContent=revision?'Saved':'Not saved yet';
 notify('initialized');if(edit)setEdit(true);
}
function setEdit(value){edit=value;document.body.classList.toggle('preview',!value);gizmo.enabled=value;helper.visible=value;orbit.mouseButtons.RIGHT=value?null:THREE.MOUSE.PAN;if(value){if(selected)select(selected);checkUpdates();try{const d=JSON.parse(localStorage.getItem('wv-draft-'+namespace));if(d&&d.base===revision&&JSON.stringify(d.state)!==JSON.stringify(saved))showNotice('draft','A recoverable draft is available on this browser.');}catch{}}else{gizmo.detach();if(selectionBox)selectionBox.visible=false;}resize();}
async function exportBytes(){if(!ready)throw Error('Wait for assets to finish loading.');const exportScene=new THREE.Scene();const conversion=new THREE.Group();conversion.rotation.x=-Math.PI/2;conversion.add(assetsRoot.clone(true));exportScene.add(conversion);return new GLTFExporter().parseAsync(exportScene,{binary:true,onlyVisible:true});}
async function saveWork(closeAfter=false){if(busy)return;busy=true;buttons();status('Saving scene and GLB…');const savingTimer=setTimeout(()=>{$('saving').hidden=false;},1000);try{const s=snapshot();const glb=await exportBytes();const form=new FormData();form.append('scene',new Blob([JSON.stringify(s)],{type:'application/json'}),'scene.json');form.append('glb',new Blob([glb],{type:'model/gltf-binary'}),'scene.glb');const res=await fetch(apiPath('commit'),{method:'POST',body:form});const reply=await res.json();if(!res.ok)throw Error(reply.error||res.statusText);revision=reply.revision;state=s;saved=clone(s);dirty=false;undo=[];redo=[];try{localStorage.removeItem('wv-draft-'+namespace);}catch{}$('dirtyBadge').textContent='Saved';$('sceneStatus').textContent=`${state.objects.length} assets · saved scene`;notify('saved',{revision,state:saved});status('Saved. Run the workflow to refresh downstream outputs.');if(closeAfter)closeEditor();}catch(e){status('Save failed: '+e.message,true);}finally{clearTimeout(savingTimer);$('saving').hidden=true;busy=false;buttons();}}
function closeEditor(){$('dialog').hidden=true;setEdit(false);notify('close');}
function requestClose(){if(busy)return;if(dirty)$('dialog').hidden=false;else closeEditor();}
function frameSelection(){const target=selected?objects.get(selected):assetsRoot;const box=new THREE.Box3().setFromObject(target);if(box.isEmpty())return;const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()).length();const dir=camera.position.clone().sub(orbit.target).normalize();orbit.target.copy(center);camera.position.copy(center).addScaledVector(dir,Math.max(size*1.5,.3));camera.near=Math.max(size/10000,.001);camera.far=Math.max(size*1000,10000);camera.updateProjectionMatrix();orbit.update();if(edit)markDirty();}
$('objectName').onchange=()=>{const o=currentObject();if(!o)return;const before=snapshot();o.name=$('objectName').value||'Untitled';objects.get(o.id).name=o.name;pushHistory(before);renderList();};
$('duplicate').onclick=async()=>{const o=currentObject();if(!o)return;const before=snapshot(),copy=clone(o);copy.id=crypto.randomUUID();copy.name+=' copy';copy.position[0]+=.5;state.objects.push(copy);pushHistory(before);await rebuild(state);select(copy.id);};
$('delete').onclick=async()=>{if(!selected)return;const before=snapshot();state.objects=state.objects.filter(o=>o.id!==selected);selected=null;pushHistory(before);await rebuild(state);};
$('ground').onclick=()=>{const o=currentObject();if(!o)return;const before=snapshot(),box=new THREE.Box3().setFromObject(objects.get(o.id));o.position[2]-=box.min.z;syncTransform(o);pushHistory(before);inspector();};
$('reset').onclick=()=>{const o=currentObject();if(!o)return;const before=snapshot();Object.assign(o,{position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]});syncTransform(o);pushHistory(before);inspector();};
$('undo').onclick=async()=>{if(!undo.length||busy)return;redo.push(snapshot());const next=undo.pop();await rebuild(next,{cameraReset:true});markDirty();buttons();};
$('redo').onclick=async()=>{if(!redo.length||busy)return;undo.push(snapshot());const next=redo.pop();await rebuild(next,{cameraReset:true});markDirty();buttons();};
for(const b of document.querySelectorAll('[data-mode]'))b.onclick=()=>{gizmo.setMode(b.dataset.mode);document.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('active',x===b));};
$('space').onclick=()=>{const next=gizmo.space==='world'?'local':'world';gizmo.setSpace(next);$('space').textContent=next==='world'?'World':'Local';};
let snap=false;$('snap').onclick=()=>{snap=!snap;gizmo.setTranslationSnap(snap?.1:null);gizmo.setRotationSnap(snap?Math.PI/12:null);gizmo.setScaleSnap(snap?.1:null);$('snap').textContent=snap?'Snap 10cm / 15°':'Snap off';};
$('frame').onclick=frameSelection;$('grid').onchange=()=>{grid.visible=$('grid').checked;markDirty();};$('axes').onchange=()=>{axes.visible=$('axes').checked;markDirty();};$('light').oninput=()=>{const n=Number($('light').value);ambient.intensity=2*n;sun.intensity=3*n;fill.intensity=1.5*n;};
$('light').onchange=()=>markDirty();
$('save').onclick=()=>saveWork();$('close').onclick=requestClose;$('cancelClose').onclick=()=>{$('dialog').hidden=true;};$('discardClose').onclick=async()=>{dirty=false;undo=[];redo=[];await rebuild(saved,{cameraReset:true});try{localStorage.removeItem('wv-draft-'+namespace);}catch{}$('dirtyBadge').textContent=revision?'Saved':'Not saved yet';closeEditor();};$('saveClose').onclick=()=>saveWork(true);
$('export').onclick=async()=>{if(busy)return;busy=true;buttons();try{const data=await exportBytes();const url=URL.createObjectURL(new Blob([data],{type:'model/gltf-binary'}));const a=document.createElement('a');a.href=url;a.download='world-scene.glb';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);status('Exported current scene. Save Work commits it to the workflow.');}catch(e){status(e.message,true);}finally{busy=false;buttons();}};
$('dismissNotice').onclick=()=>{$('notice').hidden=true;};$('restoreDraft').onclick=async()=>{try{const d=JSON.parse(localStorage.getItem('wv-draft-'+namespace));if(d){const before=snapshot();await rebuild(d.state,{cameraReset:true});pushHistory(before);}}catch(e){status(e.message,true);}$('notice').hidden=true;};
$('acceptUpdates').onclick=async()=>{const before=snapshot();if(pendingPayload){incoming=pendingPayload.incoming||[];pendingPayload=null;}const next=snapshot();for(const a of incoming){const matches=next.objects.filter(o=>o.source===a.source);if(matches.length)matches.forEach(o=>o.asset=a.asset);else next.objects.push({...a,id:crypto.randomUUID(),position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],visible:true});}await rebuild(next);pushHistory(before);$('notice').hidden=true;status('Input geometry updated. Existing transforms and names preserved.');};
gizmo.addEventListener('dragging-changed',e=>{orbit.enabled=!e.value;if(e.value)dragBefore=snapshot();else if(dragBefore){pushHistory(dragBefore);dragBefore=null;}});
gizmo.addEventListener('objectChange',()=>{const o=currentObject(),g=objects.get(selected);if(!o||!g)return;o.position=g.position.toArray();o.rotation=[g.rotation.x,g.rotation.y,g.rotation.z];o.scale=g.scale.toArray().map(n=>Math.max(.001,n));g.scale.fromArray(o.scale);selectionBox?.update();inspector();});
const raycaster=new THREE.Raycaster(),mouse=new THREE.Vector2();let pointerStart=null;
renderer.domElement.addEventListener('pointerdown',e=>{renderer.domElement.focus();$('viewport').focus();pointerStart={x:e.clientX,y:e.clientY,button:e.button};if(edit&&e.button===2){flying=true;orbit.enabled=false;renderer.domElement.setPointerCapture(e.pointerId);}});
renderer.domElement.addEventListener('pointermove',e=>{if(!flying)return;camera.rotateOnWorldAxis(new THREE.Vector3(0,0,1),-e.movementX*.004);camera.rotateX(-e.movementY*.004);});
renderer.domElement.addEventListener('pointerup',e=>{if(flying&&e.button===2){flying=false;keys.clear();orbit.target.copy(camera.position).add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(3));orbit.enabled=true;markDirty();}
 if(edit&&e.button===0&&pointerStart&&Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)<4&&!gizmo.axis&&!gizmo.dragging){const r=renderer.domElement.getBoundingClientRect();mouse.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(mouse,camera);const hits=raycaster.intersectObjects([...objects.values()].filter(o=>o.visible),true);if(hits.length){let o=hits[0].object;while(o&&!o.userData.worldId)o=o.parent;select(o?.userData.worldId);}else select(null);}pointerStart=null;});
orbit.addEventListener('end',()=>{if(edit&&!gizmo.dragging&&!flying)markDirty();});
renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('blur',()=>{keys.clear();if(flying){flying=false;orbit.target.copy(camera.position).add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(3));orbit.enabled=true;}});
window.addEventListener('keydown',e=>{if(!edit||['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;if(e.code==='Escape'){e.preventDefault();requestClose();return;}if(!$('dialog').hidden)return;if(flying){if(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ShiftLeft','ShiftRight'].includes(e.code)){keys.add(e.code);e.preventDefault();}return;}if((e.ctrlKey||e.metaKey)&&e.code==='KeyZ'){e.preventDefault();$(e.shiftKey?'redo':'undo').click();return;}const actions={KeyW:()=>document.querySelector('[data-mode=translate]').click(),KeyE:()=>document.querySelector('[data-mode=rotate]').click(),KeyR:()=>document.querySelector('[data-mode=scale]').click(),KeyF:frameSelection,Delete:()=>$('delete').click()};if(actions[e.code]){e.preventDefault();actions[e.code]();}});
window.addEventListener('keyup',e=>keys.delete(e.code));
function resize(){const r=$('viewport').getBoundingClientRect();if(r.width<1||r.height<1)return;camera.aspect=r.width/r.height;camera.updateProjectionMatrix();renderer.setSize(r.width,r.height,false);}new ResizeObserver(resize).observe($('viewport'));
function tick(now){requestAnimationFrame(tick);const dt=Math.min((now-lastFrame)/1000,.05);lastFrame=now;if(flying){const speed=dt*(keys.has('ShiftLeft')||keys.has('ShiftRight')?12:3),f=camera.getWorldDirection(new THREE.Vector3()),r=new THREE.Vector3().crossVectors(f,camera.up).normalize();if(keys.has('KeyW'))camera.position.addScaledVector(f,speed);if(keys.has('KeyS'))camera.position.addScaledVector(f,-speed);if(keys.has('KeyD'))camera.position.addScaledVector(r,speed);if(keys.has('KeyA'))camera.position.addScaledVector(r,-speed);if(keys.has('KeyE'))camera.position.z+=speed;if(keys.has('KeyQ'))camera.position.z-=speed;}else orbit.update();selectionBox?.update();renderer.render(scene,camera);}requestAnimationFrame(tick);
window.addEventListener('message',async e=>{if(e.origin!==location.origin||e.source!==parent||e.data?.channel!=='world-viewer')return;const m=e.data;if(m.type==='init'){clearInterval(stateRequestTimer);namespace=m.namespace||'default';await init(m.payload);}if(m.type==='edit')setEdit(true);if(m.type==='preview')setEdit(false);});
// Retry the handshake if the host restores the workflow after this iframe loads.
let stateRequests=0;
const stateRequestTimer=setInterval(()=>{notify('request-state');if(++stateRequests>=30)clearInterval(stateRequestTimer);},500);
window.addEventListener('pagehide',()=>clearInterval(stateRequestTimer));
setEdit(new URLSearchParams(location.search).has('demo'));notify('ready');
// Standalone test harness can initialize through the same validated message interface.
