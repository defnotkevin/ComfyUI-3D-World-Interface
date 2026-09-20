// Replace geometry by source slot, keeping each instance's placement and name.
export function mergeAssets(scene, incoming, makeId, previousSources = []) {
 const next=JSON.parse(JSON.stringify(scene)); let changed=false;
 for(const asset of incoming){
  const matches=next.objects.filter(o=>o.source===asset.source);
  if(matches.length){for(const o of matches){if(o.asset!==asset.asset){o.asset=asset.asset;changed=true;}}}
  else if(!previousSources.includes(asset.source)){
   if(next.objects.length>=256)throw Error('Scene limit reached (256 objects).');
   next.objects.push({...asset,id:makeId(),position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],visible:true});changed=true;
  }
 }
 return {state:next,changed};
}
