import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const resources = path.join(root, 'src-tauri/resources');
const app = path.join(resources, 'app');
for (const name of fs.readdirSync(path.join(root,'public')).filter(name=>/\.(js|html|css)$/.test(name))) {
  if (/^(?:<{7}|={7}|>{7})/m.test(fs.readFileSync(path.join(root,'public',name),'utf8'))) throw Error('Resolve merge markers before packaging: '+name);
}
fs.mkdirSync(app, {recursive:true});
// Allow-list sources; credentials, drafts, tests and dependency caches never enter the bundle.
for (const name of fs.readdirSync(root).filter(name => name.endsWith('.mjs'))) fs.copyFileSync(path.join(root,name),path.join(app,name));
fs.copyFileSync(path.join(root,'package.json'),path.join(app,'package.json'));
fs.cpSync(path.join(root,'public'),path.join(app,'public'),{recursive:true});
if(fs.existsSync(path.join(root,'lib'))) fs.cpSync(path.join(root,'lib'),path.join(app,'lib'),{recursive:true});
fs.copyFileSync(path.join(root,'scripts/desktop-server.mjs'),path.join(app,'desktop-server.mjs'));
const runtime = path.join(root,'../HTML_Slide_Studio_Windows_x64_API포함_2026-11-18/runtime');
const nodeSource = process.env.STUDIO_NODE_PATH || path.join(runtime,'node.exe');
if (!fs.existsSync(nodeSource)) throw Error('Set STUDIO_NODE_PATH to a trusted Windows node.exe runtime.');
fs.mkdirSync(path.join(resources,'runtime'),{recursive:true});
fs.copyFileSync(nodeSource,path.join(resources,'runtime/node.exe'));
const license = process.env.STUDIO_NODE_LICENSE || path.join(runtime,'LICENSE.txt');
if(!fs.existsSync(license)) throw Error('Set STUDIO_NODE_LICENSE to the runtime license file.');
fs.copyFileSync(license,path.join(resources,'runtime/LICENSE.txt'));
console.log('Desktop resources prepared without credentials.');
