import {defaultRelayUrls as nostr, createEvent} from '@trystero-p2p/nostr'
const topic = 'amorfusprobe' + Math.random().toString(36).slice(2)
const kind = 20000 + (topic.split('').reduce((a,c)=>a+c.charCodeAt(0),0) % 10000)
const test = url => new Promise(res => {
  const t0 = Date.now(); let sub, pub, done=false
  const fin = r => { if(done) return; done=true; try{sub.close()}catch{}; try{pub.close()}catch{}; res([url, r]) }
  setTimeout(()=>fin('NO ROUNDTRIP in 10s'), 10000)
  try { sub = new WebSocket(url) } catch(e) { return fin('ERR') }
  sub.onerror = () => fin('CONNECT ERROR')
  sub.onopen = () => {
    sub.send(JSON.stringify(['REQ','s1',{kinds:[kind], since: Math.floor(Date.now()/1000)-5, '#x':[topic]}]))
    pub = new WebSocket(url)
    pub.onopen = async () => { const ev = await createEvent(topic, JSON.stringify({peerId:'probe'})); t1 = Date.now(); pub.send(ev) }
    pub.onmessage = e => { const m = JSON.parse(e.data); if (m[0]==='OK' && m[2]===false) fin('PUBLISH REJECTED: ' + m[3]); if (m[0]==='NOTICE' || m[0]==='CLOSED') okmsg = m }
  }
  let t1, okmsg
  sub.onmessage = e => { const m = JSON.parse(e.data); if (m[0]==='EVENT') fin(`ROUNDTRIP ${Date.now()-t1}ms`); if (m[0]==='CLOSED') fin('SUB CLOSED: '+m[2]) }
})
const extra = ['relay.damus.io','relay.primal.net','relay.snort.social','nostr.mom','relay.nostr.band','offchain.pub','nostr.oxtr.dev','relay.nostr.net','nostr.bitcoiner.social','relay.nostr.bg','nostr-pub.wellorder.net','relay.nos.social','ftp.halifax.rwth-aachen.de/nostr'].map(u=>'wss://'+u); const r = await Promise.all(extra.map(test)); r.forEach(x=>console.log(x.join('  ')))
console.log('ok count', r.filter(x=>x[1].startsWith('ROUNDTRIP')).length, '/', r.length)
process.exit(0)
