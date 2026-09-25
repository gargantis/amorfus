import {joinRoom, selfId} from '@trystero-p2p/ws-relay'
import {RTCPeerConnection} from 'node-datachannel/polyfill'
const name = process.argv[2]
const room = joinRoom({appId: 'amorfus-probe', rtcPolyfill: RTCPeerConnection, relayConfig: {urls: ['ws://127.0.0.1:18080']}}, 'room-' + process.argv[3], {
  onJoinError: d => console.log(name, 'joinError', d.error?.message ?? d.error)
})
const edits = room.makeAction('edit')
edits.onMessage = (d, {peerId}) => console.log(name, 'reliable action from', peerId.slice(0,6), JSON.stringify(d))
const t0 = Date.now()
room.onPeerJoin = peerId => {
  console.log(name, 'peer joined after', Date.now()-t0, 'ms')
  const pc = room.getPeers()[peerId]
  console.log(name, 'getPeers() value is RTCPeerConnection-like:', typeof pc?.createDataChannel, 'state', pc?.connectionState)
  const ch = pc.createDataChannel('pos', {negotiated: true, id: 42, ordered: false, maxRetransmits: 0})
  ch.binaryType = 'arraybuffer'
  ch.onopen = () => { console.log(name, 'unreliable channel open; ordered=', ch.ordered, 'maxRetransmits=', ch.maxRetransmits); let i=0; const iv = setInterval(()=>{ if(ch.readyState==='open') ch.send(new Float32Array([i++, 1, 2, 3]).buffer) }, 50); setTimeout(()=>clearInterval(iv), 1500) }
  let n = 0; ch.onmessage = e => { n++ }
  setTimeout(() => { console.log(name, 'received', n, 'unreliable pos msgs'); edits.send({op:'place', x:1, y:2, z:3, from:name}) }, 2000)
  setTimeout(() => { console.log(name, 'trystero channel still works; leaving'); room.leave(); setTimeout(()=>process.exit(0), 500) }, 3500)
}
setTimeout(() => { console.log(name, 'TIMEOUT'); process.exit(1) }, 20000)
