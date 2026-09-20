"""Content-addressed assets and immutable scene revisions. No ComfyUI dependencies."""
import hashlib
import json
import math
import os
from pathlib import Path
import re
import struct
import tempfile

MAX_GLB = 256 * 1024 * 1024
KEY = re.compile(r'^[a-f0-9]{64}$')

def key(value):
    if not isinstance(value, str) or not KEY.fullmatch(value):
        raise ValueError('Invalid content ID')
    return value

def validate_glb(data):
    if len(data) < 20 or len(data) > MAX_GLB:
        raise ValueError('GLB must be between 20 bytes and 256 MiB.')
    magic, version, size = struct.unpack_from('<4sII', data)
    if magic != b'glTF' or version != 2 or size != len(data):
        raise ValueError('Expected a complete glTF 2.0 binary (.glb).')
    length, kind = struct.unpack_from('<II', data, 12)
    if kind != 0x4E4F534A or length > len(data)-20:
        raise ValueError('Invalid GLB JSON chunk.')
    doc = json.loads(data[20:20+length])
    for item in doc.get('buffers', []) + doc.get('images', []):
        uri = item.get('uri')
        if uri and not uri.startswith('data:'):
            raise ValueError('External GLB resources are not supported. Embed textures and buffers.')
    if doc.get('skins') or doc.get('animations'):
        raise ValueError('Prototype supports static assets. Export a static mesh without skins/animations.')
    forbidden = {'KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu'}
    if forbidden.intersection(doc.get('extensionsUsed', []) + doc.get('extensionsRequired', [])):
        raise ValueError('Compressed GLB requires an unavailable decoder. Export uncompressed GLB with PNG/JPEG textures.')
    for image in doc.get('images', []):
        mime = image.get('mimeType', '')
        if mime and mime not in ('image/png', 'image/jpeg'):
            raise ValueError('Only embedded PNG/JPEG textures are supported.')
    return doc

def vector(value, size, label, positive=False):
    if not isinstance(value, list) or len(value) != size:
        raise ValueError(f'{label}: expected {size} numbers')
    if any(isinstance(x, bool) or not isinstance(x, (float,int)) or not math.isfinite(x) or abs(x)>1e8 for x in value):
        raise ValueError(f'{label}: invalid number')
    if positive and any(x <= 0 for x in value):
        raise ValueError('Scale components must be positive.')
    return value

def validate_scene(scene):
    if not isinstance(scene, dict) or scene.get('version') != 1:
        raise ValueError('Unsupported scene version.')
    objects = scene.get('objects')
    if not isinstance(objects, list) or len(objects)>256:
        raise ValueError('Scene must contain at most 256 objects.')
    ids=set()
    for obj in objects:
        if not isinstance(obj, dict): raise ValueError('Invalid object.')
        ident=obj.get('id')
        if not isinstance(ident,str) or not ident or len(ident)>100 or ident in ids: raise ValueError('Object IDs must be unique.')
        ids.add(ident); key(obj.get('asset'))
        if not isinstance(obj.get('name'),str) or len(obj['name'])>200: raise ValueError('Invalid object name.')
        if obj.get('source') not in ('asset_1','asset_2','asset_3','asset_4'): raise ValueError('Invalid source slot.')
        vector(obj.get('position'),3,'Position'); vector(obj.get('rotation'),3,'Rotation'); vector(obj.get('scale'),3,'Scale',True)
        if not isinstance(obj.get('visible'),bool):raise ValueError('Invalid visibility.')
    camera=scene.get('camera',{})
    vector(camera.get('position'),3,'Camera');vector(camera.get('target'),3,'Target')
    view=scene.get('viewport')
    if view is not None:
        if not isinstance(view,dict) or not isinstance(view.get('grid'),bool) or not isinstance(view.get('axes'),bool):raise ValueError('Invalid viewport settings.')
        light=view.get('lighting')
        if not isinstance(light,(int,float)) or not math.isfinite(light) or not .2<=light<=3:raise ValueError('Invalid viewport lighting.')
    return scene

class Store:
    def __init__(self, root):
        self.root=Path(root)
        for name in ('assets','revisions'):(self.root/name).mkdir(parents=True,exist_ok=True)
    def path(self, kind, ident, suffix):
        return self.root/kind/(key(ident)+suffix)
    def _put(self, path, data):
        if path.exists():return
        fd,tmp=tempfile.mkstemp(dir=path.parent,prefix='.pending-')
        try:
            with os.fdopen(fd,'wb') as f:f.write(data)
            os.replace(tmp,path)
        finally:
            if os.path.exists(tmp):os.unlink(tmp)
    def asset(self,data):
        validate_glb(data);ident=hashlib.sha256(data).hexdigest()
        self._put(self.path('assets',ident,'.glb'),data);return ident
    def asset_path(self,ident):
        p=self.path('assets',ident,'.glb')
        if not p.is_file():raise ValueError('Referenced asset is missing from World Interface storage.')
        return p
    def commit(self,scene,glb):
        validate_scene(scene);validate_glb(glb)
        for obj in scene['objects']:self.asset_path(obj['asset'])
        data=json.dumps(scene,sort_keys=True,separators=(',',':'),allow_nan=False).encode()
        ident=hashlib.sha256(data+b'\x00'+glb).hexdigest()
        self._put(self.path('revisions',ident,'.glb'),glb)
        self._put(self.path('revisions',ident,'.json'),data)
        return ident
    def scene(self,ident):
        p=self.path('revisions',ident,'.json')
        if not p.is_file():raise ValueError('Saved scene revision missing; restore the world_viewer storage folder.')
        return validate_scene(json.loads(p.read_text()))
