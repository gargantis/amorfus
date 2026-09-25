import zlib from "node:zlib";
const N=+process.argv[2]; let s=7; const r=()=>(s=(Math.imul(s,1664525)+1013904223)>>>0)/2**32;
// clustered builds: 200 build sites, each player edits near a site, ~1 edit per 0.5 s over sessions
const sites=[...Array(200)].map(()=>[(r()*2000-1000)|0,(60+r()*40)|0,(r()*2000-1000)|0]);
const cells=new Map(); let l=1.79e12;
for(let i=0;i<N;i++){ const st=sites[(r()*sites.length)|0]; const x=st[0]+((r()*40-20)|0), y=st[1]+((r()*20-5)|0), z=st[2]+((r()*40-20)|0);
  l+= (r()*1000)|0; const k=`${x},${y},${z}`; cells.set(k,{x,y,z,v:(r()*8)|0|(r()<0.1?0x100:0),l,c:0,p:(r()*4)|0}); }
// group by chunk (32^3)
const chunks=new Map(); for(const e of cells.values()){ const ck=`${e.x>>5},${e.y>>5},${e.z>>5}`; (chunks.get(ck)??chunks.set(ck,[]).get(ck)).push(e); }
const out=[]; const vu=n=>{ while(n>=128){ out.push((n%128)|128); n=Math.floor(n/128);} out.push(n); }; const zz=n=>n<0?-2*n-1:2*n;
for(const [ck,es] of chunks){ const [cx,cy,cz]=ck.split(",").map(Number); vu(zz(cx));vu(zz(cy));vu(zz(cz)); vu(es.length);
  es.sort((a,b)=>a.l-b.l); let prev=0;
  for(const e of es){ const li=((e.x&31)<<10)|((e.y&31)<<5)|(e.z&31); out.push(li&255,li>>8); out.push(e.v&255,e.v>>8); vu(e.l-prev); prev=e.l; vu(e.c); out.push(e.p);} }
const b=Buffer.from(out); console.log(JSON.stringify({ops:N, live:cells.size, chunks:chunks.size, bytes:b.length, perLive:(b.length/cells.size).toFixed(2), deflateRaw:zlib.deflateRawSync(b,{level:6}).length, perLiveDeflated:(zlib.deflateRawSync(b).length/cells.size).toFixed(2)}));
