import nodeDataChannel from 'node-datachannel'
const test = (label, iceServers) => new Promise(res => {
  const pc = new nodeDataChannel.PeerConnection(label, { iceServers, iceTransportPolicy: 'relay' })
  const cands = []
  pc.onLocalCandidate(c => cands.push(c))
  pc.onGatheringStateChange(s => { if (s === 'complete') { pc.close(); res([label, cands.filter(c=>c.includes('relay')).length ? 'RELAY OK ' + cands.find(c=>c.includes('relay')).split(' ').slice(4,6).join(':') : 'NO RELAY CANDIDATE']) } })
  pc.createDataChannel('x')
  setTimeout(() => { try{pc.close()}catch{}; res([label, 'TIMEOUT, relay cands=' + cands.filter(c=>c.includes('relay')).length]) }, 15000)
})
const r = await Promise.all([
  test('openrelay udp80', ['turn:openrelayproject:openrelayproject@openrelay.metered.ca:80']),
  test('openrelay tcp443', ['turn:openrelayproject:openrelayproject@openrelay.metered.ca:443?transport=tcp']),
  test('freestun', ['turn:free:free@freestun.net:3478']),
])
r.forEach(x => console.log(x.join('  ')))
process.exit(0)
