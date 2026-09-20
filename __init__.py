"""3D World Interface 0.1.4 — ComfyUI a8686f2b prototype."""
from pathlib import Path
import hashlib
import json
from aiohttp import web
import folder_paths
from server import PromptServer
from .storage import Store, MAX_GLB, validate_glb

WEB_DIRECTORY='./web'
UI=Path(__file__).parent/'ui'

def store():return Store(Path(folder_paths.get_output_directory())/'world_viewer')

def input_file(name):
    root=Path(folder_paths.get_input_directory()).resolve()
    p=(root/name).resolve()
    if not p.is_relative_to(root) or p.suffix.lower()!='.glb' or not p.is_file():
        raise ValueError('Choose a GLB inside ComfyUI/input.')
    if p.stat().st_size>MAX_GLB:raise ValueError('Asset exceeds 256 MiB.')
    return p

class LoadWorldAsset:
    @classmethod
    def INPUT_TYPES(cls):
        root=Path(folder_paths.get_input_directory())
        names=sorted(str(p.relative_to(root)).replace('\\','/') for p in root.rglob('*.glb'))
        return {'required':{'file':(names,), 'name':('STRING',{'default':'Imported asset'})}}
    RETURN_TYPES=('WORLD_ASSET',)
    FUNCTION='load'
    CATEGORY='3d/world interface'
    @classmethod
    def IS_CHANGED(cls,file,name):return hashlib.sha256(input_file(file).read_bytes()).hexdigest()
    def load(self,file,name):return ({'asset':store().asset(input_file(file).read_bytes()),'name':name},)

class MeshToWorldAsset:
    @classmethod
    def INPUT_TYPES(cls):return {'required':{'mesh':('MESH',),'name':('STRING',{'default':'Generated asset'})}}
    RETURN_TYPES=('WORLD_ASSET',)
    FUNCTION='convert'
    CATEGORY='3d/world interface'
    def convert(self,mesh,name):
        from comfy_extras.nodes_save_3d import mesh_item_to_glb_bytes
        if mesh.vertices.shape[0]!=1:raise ValueError('Connect one mesh per asset, not a mesh batch.')
        data=mesh_item_to_glb_bytes(mesh,0)
        if data is None:raise ValueError('Mesh is empty.')
        return ({'asset':store().asset(data),'name':name},)

class WorldViewer:
    @classmethod
    def INPUT_TYPES(cls):
        return {'required':{'scene_revision':('STRING',{'default':'','multiline':False})},
                'optional':{f'asset_{i}':('WORLD_ASSET',) for i in range(1,5)}}
    RETURN_TYPES=('WORLD_SCENE','STRING')
    RETURN_NAMES=('scene','glb_path')
    FUNCTION='view'
    CATEGORY='3d/world interface'
    OUTPUT_NODE=True
    def view(self,scene_revision='',**kwargs):
        s=store();incoming=[]
        for i in range(1,5):
            v=kwargs.get(f'asset_{i}')
            if v:
                s.asset_path(v['asset'])
                incoming.append({'source':f'asset_{i}','asset':v['asset'],'name':str(v.get('name',f'Asset {i}'))[:200]})
        if not incoming and not scene_revision:raise ValueError('Connect at least one World Asset and run once.')
        if scene_revision:
            state=s.scene(scene_revision)
            path=str(s.path('revisions',scene_revision,'.glb'))
        else:
            state={'version':1,'objects':[dict(v,id=v['source'],position=[(i-(len(incoming)-1)/2)*2.5,0,0],rotation=[0,0,0],scale=[1,1,1],visible=True) for i,v in enumerate(incoming)],'camera':{'position':[6,-8,5],'target':[0,0,1]}}
            path=''
        output={'revision':scene_revision,'state':state,'glb_path':path,'committed':bool(scene_revision)}
        return {'ui':{'world_viewer':[{'state':state,'incoming':incoming,'revision':scene_revision}]},'result':(output,path)}

class WorldSceneGLB:
    @classmethod
    def INPUT_TYPES(cls):return {'required':{'scene':('WORLD_SCENE',)}}
    RETURN_TYPES=('FILE_3D_GLB',)
    FUNCTION='convert'
    CATEGORY='3d/world interface'
    def convert(self,scene):
        if not scene.get('committed'):
            from comfy_execution.graph import ExecutionBlocker
            return (ExecutionBlocker(None),)
        from comfy_api.latest import Types
        from io import BytesIO
        s=store();s.scene(scene['revision'])
        return (Types.File3D(BytesIO(s.path('revisions',scene['revision'],'.glb').read_bytes()),file_format='glb'),)


class DemoWorldAsset:
    @classmethod
    def INPUT_TYPES(cls):return {'required':{'sample':(['Terrace','Pavilion','Textured block','Column'],)}}
    RETURN_TYPES=('WORLD_ASSET',)
    FUNCTION='load'
    CATEGORY='3d/world interface'
    def load(self,sample):
        names=['Terrace','Pavilion','Textured block','Column']
        i=names.index(sample)+1
        data=(Path(__file__).parent/'example_workflows'/f'demo_{i}.glb').read_bytes()
        return ({'asset':store().asset(data),'name':sample},)

routes=PromptServer.instance.routes

@routes.get('/worldviewer/ui/{path:.*}')
async def static_ui(request):
    p=(UI/request.match_info['path']).resolve()
    if not p.is_relative_to(UI.resolve()) or not p.is_file():raise web.HTTPNotFound()
    return web.FileResponse(p)

@routes.get('/worldviewer/asset/{ident}')
async def asset_response(request):
    try:return web.FileResponse(store().asset_path(request.match_info['ident']))
    except ValueError as e:raise web.HTTPNotFound(text=str(e))

@routes.get('/worldviewer/revision/{ident}')
async def revision_response(request):
    try:return web.json_response(store().scene(request.match_info['ident']))
    except ValueError as e:raise web.HTTPNotFound(text=str(e))

@routes.post('/worldviewer/commit')
async def commit_response(request):
    try:
        reader=await request.multipart();scene=None;data=None
        while True:
            part=await reader.next()
            if part is None:break
            limit=2*1024*1024 if part.name=='scene' else MAX_GLB
            body=bytearray()
            while chunk:=await part.read_chunk():
                body.extend(chunk)
                if len(body)>limit:raise ValueError('Save exceeds prototype size limit.')
            if part.name=='scene':scene=json.loads(body)
            elif part.name=='glb':data=bytes(body)
        if scene is None or data is None:raise ValueError('Scene and GLB are both required.')
        ident=store().commit(scene,data)
        return web.json_response({'revision':ident})
    except (ValueError,TypeError,KeyError) as e:return web.json_response({'error':str(e)},status=400)

NODE_CLASS_MAPPINGS={'DemoWorldAsset':DemoWorldAsset,'WorldViewer':WorldViewer,'LoadWorldAsset':LoadWorldAsset,'MeshToWorldAsset':MeshToWorldAsset,'WorldSceneGLB':WorldSceneGLB}
NODE_DISPLAY_NAME_MAPPINGS={'DemoWorldAsset':'Demo World Asset','WorldViewer':'3D World Interface','LoadWorldAsset':'Load World Asset (GLB)','MeshToWorldAsset':'Mesh to World Asset','WorldSceneGLB':'World Scene to GLB'}
