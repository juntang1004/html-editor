import fs from 'node:fs';
import path from 'node:path';
export function packageNotices(root, output) {
  const registry=path.join(process.env.USERPROFILE,'.cargo/registry/src');
  const sources=fs.readdirSync(registry).map(name=>path.join(registry,name));
  const lock=fs.readFileSync(path.join(root,'src-tauri/Cargo.lock'),'utf8');
  const entries=[];
  for(const block of lock.split('[[package]]').slice(1)) {
    if(!block.includes('source = "registry+'))continue;
    const name=/^name = "([^"]+)"/m.exec(block)?.[1];
    const version=/^version = "([^"]+)"/m.exec(block)?.[1];
    const directory=sources.map(source=>path.join(source,`${name}-${version}`)).find(source=>fs.existsSync(source));
    if(!directory)continue; // Platform-specific crates absent from this Windows build are not distributed.
    const manifest=fs.readFileSync(path.join(directory,'Cargo.toml'),'utf8');
    const license=/^license = "([^"]+)"/m.exec(manifest)?.[1]||'See bundled license files';
    const destination=path.join(output,'licenses/rust',`${name}-${version}`);
    fs.mkdirSync(destination,{recursive:true});
    const notices=fs.readdirSync(directory).filter(file=>/^(LICENSE|LICENCE|COPYING|NOTICE)/i.test(file)&&fs.statSync(path.join(directory,file)).isFile());
    const explicit=/^license-file = "([^"]+)"/m.exec(manifest)?.[1];
    if(explicit&&fs.existsSync(path.join(directory,explicit))&&!notices.includes(explicit))notices.push(explicit);
    for(const file of notices)fs.copyFileSync(path.join(directory,file),path.join(destination,path.basename(file)));
    entries.push(`${name} ${version} — ${license}\n  https://crates.io/crates/${name}/${version}\n  License texts: licenses/rust/${name}-${version}/ (${notices.length} files)`);
  }
  fs.writeFileSync(path.join(output,'THIRD-PARTY-NOTICES.txt'),'HTML Slide Studio third-party notices\n\nNode.js: resources/runtime/LICENSE.txt\nWebView2 is supplied by Microsoft separately.\n\nRust dependencies (including build dependencies present in this Windows build):\n\n'+entries.sort().join('\n\n')+'\n');
}
