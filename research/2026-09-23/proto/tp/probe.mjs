import {defaultRelayUrls as nostr} from '@trystero-p2p/nostr'
import {defaultRelayUrls as torrent} from '@trystero-p2p/torrent'
import {defaultRelayUrls as mqtt} from '@trystero-p2p/mqtt'
const probe = (url, proto) => new Promise(res => {
  const t0 = Date.now(); let ws
  try { ws = proto ? new WebSocket(url, proto) : new WebSocket(url) } catch (e) { return res([url, 'ERR ' + e.message]) }
  const to = setTimeout(() => { try{ws.close()}catch{}; res([url, 'TIMEOUT 8s']) }, 8000)
  ws.onopen = () => { clearTimeout(to); const ms = Date.now()-t0;
    if (url.includes('nostr') || nostr.includes(url)) {
      // publish an ephemeral-kind REQ to see if relay answers EOSE
      ws.send(JSON.stringify(['REQ','probe',{kinds:[20001],limit:1}]))
      const t2 = setTimeout(()=>{ws.close(); res([url, `OPEN ${ms}ms, no EOSE`])},4000)
      ws.onmessage = e => { clearTimeout(t2); ws.close(); res([url, `OPEN ${ms}ms, reply ${String(e.data).slice(0,60)}`]) }
    } else { ws.close(); res([url, `OPEN ${ms}ms`]) } }
  ws.onerror = e => { clearTimeout(to); res([url, 'ERROR ' + (e.message||e.type)]) }
})
const all = async (list, proto) => (await Promise.all(list.map(u => probe(u, proto)))).forEach(r => console.log(r.join('  ')))
console.log('== NOSTR (' + nostr.length + ')'); await all(nostr)
console.log('== TORRENT'); await all(torrent)
console.log('== MQTT'); await all(mqtt.map(u=>u.replace('public:public@','')), 'mqtt')
