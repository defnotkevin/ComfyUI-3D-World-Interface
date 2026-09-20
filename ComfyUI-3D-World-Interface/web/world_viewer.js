import { app } from '../../scripts/app.js';
import { api } from '../../scripts/api.js';
const channel='world-viewer';
app.registerExtension({
 name:'WorldViewer.Prototype',
 async beforeRegisterNodeDef(nodeType,nodeData){
  if(nodeData.name!=='WorldViewer')return;
  const created=nodeType.prototype.onNodeCreated;
  nodeType.prototype.onNodeCreated=function(){
   const result=created?.apply(this,arguments),node=this;
   this.properties=this.properties||{};
   this.properties.world_viewer_id ||= crypto.randomUUID();
   const host=document.createElement('div');host.style.cssText='width:100%;height:320px;display:flex;flex-direction:column;background:#172127;border-radius:8px;overflow:hidden;';
   const frame=document.createElement('iframe');frame.title='3D World Interface preview';frame.style.cssText='border:0;flex:1;width:100%;min-height:260px;';
   frame.src=api.apiURL('/worldviewer/ui/index.html?v=0.1.4');
   const caption=document.createElement('div');caption.textContent='Connect 1–4 assets and run the workflow.';caption.style.cssText='color:#abc0c8;font:11px system-ui;padding:8px;';host.append(frame,caption);
   this.addDOMWidget('world_preview','div',host,{serialize:false,hideOnZoom:false});
   let payload=null,overlay=null,editFrame=null,previewReady=false;
   // Workflow properties may be reactive proxies after ComfyUI restores them.
   // Send plain JSON, never framework-owned objects, across the iframe boundary.
   const plain=value=>JSON.parse(JSON.stringify(value));
   const post=(f,type,data={})=>f?.contentWindow?.postMessage(plain({channel,type,...data}),location.origin);
   const initialize=(f,isEdit=false)=>{if(payload)post(f,'init',{payload,namespace:node.properties.world_viewer_id});if(isEdit)post(f,'edit');};
   // DOM widgets can detach/reinsert iframes during workflow restoration.
   // Each document load must receive the current scene again.
   frame.addEventListener('load',()=>{previewReady=true;initialize(frame);});
   const close=()=>{overlay?.remove();overlay=null;editFrame=null;};
   this.addWidget('button','Edit',null,()=>{
    if(!payload){caption.textContent='Run the workflow once to load assets before editing.';return;}
    if(overlay)return;
    overlay=document.createElement('div');overlay.style.cssText='position:fixed;inset:16px;z-index:100000;background:#172127;border:1px solid #596b73;border-radius:12px;box-shadow:0 0 0 30px #0009,0 20px 80px #0009;overflow:hidden;';
    editFrame=document.createElement('iframe');editFrame.title='3D World Interface editor';editFrame.style.cssText='border:0;width:100%;height:100%;';editFrame.src=api.apiURL('/worldviewer/ui/index.html?v=0.1.4');overlay.append(editFrame);document.body.append(overlay);
   });
   const listener=e=>{
    if(e.origin!==location.origin||e.data?.channel!==channel)return;
    const isPreview=e.source===frame.contentWindow,isEditor=editFrame&&e.source===editFrame.contentWindow;
    if(!isPreview&&!isEditor)return;
    if(e.data.type==='ready'||e.data.type==='request-state'){if(isPreview)previewReady=true;initialize(isPreview?frame:editFrame,!!isEditor);}
    if(e.data.type==='saved'&&isEditor){
     const widget=node.widgets.find(w=>w.name==='scene_revision');widget.value=e.data.revision;
     widget.callback?.(widget.value);payload={...payload,state:e.data.state,revision:e.data.revision};
     node.properties.world_viewer_payload=payload;
     initialize(frame);node.graph?.change();app.graph.setDirtyCanvas(true,true);
     caption.textContent='Saved. Run workflow for updated downstream outputs; save workflow to retain the revision.';
    }
    if(e.data.type==='close'&&isEditor)close();
    if(e.data.type==='error')caption.textContent=e.data.message;
   };
   window.addEventListener('message',listener);
   this._worldReceive=value=>{payload=value;node.properties.world_viewer_payload=value;caption.textContent=value.revision?'Scene loaded with current inputs. Edit → Save Work to commit updates.':'Assets loaded. Edit → Save Work to commit the scene.';initialize(frame);if(editFrame)initialize(editFrame,true);};
   let restoreEpoch=0;
   this._worldRestore=async()=>{
    const epoch=++restoreEpoch;
    const cached=node.properties.world_viewer_payload;
    const revision=node.widgets?.find(w=>w.name==='scene_revision')?.value;
    if(!revision){if(cached)this._worldReceive(plain(cached));return;}
    caption.textContent='Restoring saved scene…';
    try{
     const response=await api.fetchApi('/worldviewer/revision/'+encodeURIComponent(revision));
     if(!response.ok)throw new Error('Saved revision could not be read ('+response.status+').');
     const state=await response.json();
     if(epoch!==restoreEpoch||node.widgets?.find(w=>w.name==='scene_revision')?.value!==revision)return;
     this._worldReceive({state,revision,incoming:plain(cached?.incoming||[])});
    }catch(error){
     if(epoch!==restoreEpoch)return;
     caption.textContent='Could not restore saved scene: '+error.message+' Keep the revision; check the server output/world_viewer folder.';
    }
   };
   this._worldCleanup=()=>{restoreEpoch++;window.removeEventListener('message',listener);close();host.remove();};
   this.setSize([420,440]);return result;
  };
  const executed=nodeType.prototype.onExecuted;nodeType.prototype.onExecuted=function(message){executed?.apply(this,arguments);if(message.world_viewer?.[0])this._worldReceive?.(message.world_viewer[0]);};
  const configured=nodeType.prototype.onConfigure;nodeType.prototype.onConfigure=function(){configured?.apply(this,arguments);this._worldRestore?.();};
  const removed=nodeType.prototype.onRemoved;nodeType.prototype.onRemoved=function(){this._worldCleanup?.();removed?.apply(this,arguments);};
 }
});
