import {joinRoom} from '@trystero-p2p/ws-relay'
const log = (...a) => { (window.__log ??= []).push(a.join(' ')) }
const room = joinRoom({appId: 'amorfus-probe', relayConfig: {urls: ['ws://127.0.0.1:18081']}}, 'room-browser', {onJoinError: d => log('joinError', String(d.error))})
const edits = room.makeAction('edit')
edits.onMessage = d => log('reliable', JSON.stringify(d))
room.onPeerJoin = peerId => {
  const pc = room.getPeers()[peerId]
  log('isRTCPeerConnection', pc instanceof RTCPeerConnection)
  const ch = pc.createDataChannel('pos', {negotiated: true, id: 42, ordered: false, maxRetransmits: 0})
  ch.binaryType = 'arraybuffer'
  let n = 0
  ch.onmessage = () => n++
  ch.onopen = () => { log('pos open ordered=' + ch.ordered + ' maxRetransmits=' + ch.maxRetransmits); let i = 0; const iv = setInterval(() => ch.readyState === 'open' && ch.send(new Float32Array([i++,0,0,0]).buffer), 50); setTimeout(() => clearInterval(iv), 1500) }
  setTimeout(async () => {
    log('pos received ' + n)
    await edits.send({op: 'place'})
    const stats = await pc.getStats(); stats.forEach(s => { if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') { const l = stats.get(s.localCandidateId), r = stats.get(s.remoteCandidateId); log('pair', l.candidateType, l.protocol, '->', r.candidateType) } })
    const sdp = pc.remoteDescription?.sdp ?? ''; log('remote sdp bytes ' + sdp.length)
    window.__done = true
  }, 2500)
}
