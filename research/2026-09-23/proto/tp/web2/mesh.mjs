import {joinRoom} from '@trystero-p2p/nostr'
const q = new URLSearchParams(location.search)
const urls = q.get('default') ? undefined : ['relay.damus.io','relay.primal.net','nos.lol','offchain.pub','nostr.bitcoiner.social','yabu.me/v2'].map(u => 'wss://' + u)
window.__peers = new Set(); window.__errs = []
const room = joinRoom({appId: 'amorfus-mesh-' + q.get('app'), relayConfig: urls ? {urls} : undefined}, q.get('room'), {onJoinError: d => window.__errs.push(String(d.error).slice(0,60))})
room.onPeerJoin = id => window.__peers.add(id)
room.onPeerLeave = id => window.__peers.delete(id)
