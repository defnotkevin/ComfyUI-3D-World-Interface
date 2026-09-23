"""Backend contract checks with lightweight ComfyUI stubs, not a GPU integration test."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from test_storage import glb

class NodeTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);(self.root/'input').mkdir()
        self.old={}
        def stub(name,module):self.old[name]=sys.modules.get(name);sys.modules[name]=module
        folder=types.ModuleType('folder_paths');folder.get_input_directory=lambda:str(self.root/'input');folder.get_output_directory=lambda:str(self.root/'output');stub('folder_paths',folder)
        class Routes:
            def get(self,*a):return lambda f:f
            post=get
        server=types.ModuleType('server');server.PromptServer=types.SimpleNamespace(instance=types.SimpleNamespace(routes=Routes()));stub('server',server)
        aio=types.ModuleType('aiohttp');aio.web=types.SimpleNamespace();stub('aiohttp',aio)
        spec=importlib.util.spec_from_file_location('world_test_package',Path(__file__).parents[1]/'__init__.py',submodule_search_locations=[str(Path(__file__).parents[1])]);self.m=importlib.util.module_from_spec(spec);stub(spec.name,self.m);spec.loader.exec_module(self.m)
    def tearDown(self):
        for name,value in self.old.items():
            if value is None:sys.modules.pop(name,None)
            else:sys.modules[name]=value
        sys.modules.pop('world_test_package.storage',None);self.tmp.cleanup()
    def test_revision_whitespace_and_case(self):
        self.assertEqual(self.m.normalize_revision('  '+ 'AB'*32 +'\n'), 'ab'*32)
        self.assertEqual(self.m.normalize_revision('  '), '')
    def test_invalid_revision_is_rejected_before_execution(self):
        for value in ['None', 'saved.glb', 'abc...', '../scene', 123]:
            self.assertIsInstance(self.m.WorldViewer.VALIDATE_INPUTS(value), str)
        self.assertIs(self.m.WorldViewer.VALIDATE_INPUTS(''), True)

    def test_four_optional_slots(self):
        self.assertEqual(list(self.m.WorldViewer.INPUT_TYPES()['optional']),['asset_1','asset_2','asset_3','asset_4'])
    def test_initial_then_committed_scene(self):
        (self.root/'input'/'box.glb').write_bytes(glb());a=self.m.LoadWorldAsset().load('box.glb','Box')[0]
        first=self.m.WorldViewer().view(asset_1=a);self.assertFalse(first['result'][0]['committed']);state=first['ui']['world_viewer'][0]['state'];state['objects'][0]['position']=[2,3,4];revision=self.m.store().commit(state,glb())
        again=self.m.WorldViewer().view(scene_revision=revision,asset_1=a);self.assertEqual(again['result'][0]['state']['objects'][0]['position'],[2,3,4]);self.assertTrue(Path(again['result'][1]).is_file())
    def test_regeneration_keeps_committed_version(self):
        a={'asset':self.m.store().asset(glb()),'name':'Original'};state=self.m.WorldViewer().view(asset_1=a)['ui']['world_viewer'][0]['state'];rev=self.m.store().commit(state,glb());b={'asset':self.m.store().asset(glb({'asset':{'version':'2.0','generator':'updated'}})),'name':'New'}
        result=self.m.WorldViewer().view(scene_revision=rev,asset_1=b);self.assertEqual(result['result'][0]['state']['objects'][0]['asset'],a['asset']);self.assertEqual(result['ui']['world_viewer'][0]['incoming'][0]['asset'],b['asset'])
    def test_bundled_demo_assets(self):
        for name in ['Terrace','Pavilion','Textured block','Column']:
            asset=self.m.DemoWorldAsset().load(name)[0]
            self.assertTrue(self.m.store().asset_path(asset['asset']).is_file())
            self.assertEqual(asset['name'],name)
    def test_file_demo_without_input_copies(self):
        choices=self.m.LoadWorldAsset.INPUT_TYPES()['required']['file'][0]
        for name in self.m.DEMO_FILES:
            self.assertIn(name,choices)
            asset=self.m.LoadWorldAsset().load(name,'Demo')[0]
            self.assertTrue(self.m.store().asset_path(asset['asset']).is_file())
        self.assertEqual(list((self.root/'input').iterdir()),[])

    def test_user_demo_file_takes_precedence(self):
        name='world_viewer_demo/demo_1.glb'
        path=self.root/'input'/name
        path.parent.mkdir()
        path.write_bytes(glb())
        self.assertEqual(self.m.input_file(name),path.resolve())

    def test_no_assets(self):
        with self.assertRaises(ValueError):self.m.WorldViewer().view()
    def test_input_path_escape(self):
        with self.assertRaises(ValueError):self.m.input_file('../secrets.glb')

if __name__=='__main__':unittest.main()
