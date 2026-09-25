import {defaultRelayUrls as nostr} from '@trystero-p2p/nostr'
import {getRelays} from '@trystero-p2p/core'
for (const appId of ['amorfus','amorf.us','us.amorf.game','amorfus-v1']) console.log(appId, getRelays({appId}, nostr, 5, true))
