import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest
spec=importlib.util.spec_from_file_location('storage',Path(__file__).parents[1]/'storage.py')
storage=importlib.util.module_from_spec(spec);spec.loader.exec_module(storage)

def glb(doc=None):
    raw=json.dumps(doc or {'asset':{'version':'2.0'}}).encode();raw+=b' '*((-len(raw))%4)
    return struct.pack('<4sIIII',b'glTF',2,20+len(raw),len(raw),0x4e4f534a)+raw

def scene(asset):return {'version':1,'objects':[{'id':'a','source':'asset_1','asset':asset,'name':'Box','position':[0,0,0],'rotation':[0,0,0],'scale':[1,1,1],'visible':True}],'camera':{'position':[3,-3,2],'target':[0,0,0]}}

class StorageTests(unittest.TestCase):
    def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.s=storage.Store(self.tmp.name)
    def tearDown(self):self.tmp.cleanup()
    def test_content_deduplicates(self):self.assertEqual(self.s.asset(glb()),self.s.asset(glb()))
    def test_commit_roundtrip_and_immutable(self):
        a=self.s.asset(glb());s=scene(a);r=self.s.commit(s,glb());self.assertEqual(self.s.scene(r),s)
        s['objects'][0]['position'][0]=2;r2=self.s.commit(s,glb());self.assertNotEqual(r,r2);self.assertEqual(self.s.scene(r)['objects'][0]['position'][0],0)
    def test_reject_path_escape(self):
        with self.assertRaises(ValueError):self.s.asset_path('../secrets')
    def test_reject_external_resources(self):
        with self.assertRaises(ValueError):self.s.asset(glb({'asset':{'version':'2.0'},'buffers':[{'uri':'https://example.com/asset.bin'}]}))
    def test_reject_compressed(self):
        with self.assertRaises(ValueError):self.s.asset(glb({'extensionsUsed':['KHR_draco_mesh_compression']}))
    def test_reject_animated(self):
        with self.assertRaises(ValueError):self.s.asset(glb({'animations':[{}]}))
    def test_missing_asset(self):
        with self.assertRaises(ValueError):self.s.commit(scene('a'*64),glb())
    def test_bad_transform(self):
        a=self.s.asset(glb());s=scene(a);s['objects'][0]['scale'][0]=0
        with self.assertRaises(ValueError):self.s.commit(s,glb())
    def test_nonfinite_transform(self):
        a=self.s.asset(glb());s=scene(a);s['objects'][0]['position'][0]=float('nan')
        with self.assertRaises(ValueError):self.s.commit(s,glb())
    def test_duplicate_identity(self):
        s=scene(self.s.asset(glb()));s['objects']*=2
        with self.assertRaises(ValueError):self.s.commit(s,glb())
    def test_truncated_glb(self):
        with self.assertRaises(ValueError):self.s.asset(glb()[:-1])

if __name__=='__main__':unittest.main()
