import { waitUntilNoSyncPending, syncBooks } from './mod.js'

await syncBooks({ maxPages: 5, startAt: 1 })
