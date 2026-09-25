import {joinRoom, getRelaySockets} from '@trystero-p2p/nostr'
const q = new URLSearchParams(location.search)
const urls = q.get('default') ? undefined : ['relay.damus.io','relay.primal.net','nos.lol','offchain.pub','nostr.bitcoiner.social','yabu.me/v2'].map(u => 'wss://' + u)
const t0 = performance.now()
window.__log = []
const room = joinRoom({appId: 'amorfus-probe-' + q.get('app'), relayConfig: urls ? {urls} : undefined}, q.get('room'), {onJoinError: d => window.__log.push('joinError ' + String(d.error))})
room.onPeerJoin = async id => {
  window.__log.push('join ' + Math.round(performance.now() - t0) + 'ms')
  setTimeout(async () => { const st = await room.getPeers()[id].getStats(); st.forEach(s => { if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') window.__log.push('pair ' + st.get(s.localCandidateId).candidateType + '->' + st.get(s.remoteCandidateId).candidateType) }); window.__log.push('relays ' + Object.keys(getRelaySockets()).length); window.__done = true }, 500)
}
