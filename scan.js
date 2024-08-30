import { forEachBook } from './meili.js'
import { waitUntilNoSyncPending, syncBooks } from './mod.js'
import { syncBookAA } from './annasarchive.js'
import { syncBookGR } from './goodreads.js'

syncBooks({ maxPages: 5, startAt: 1 })

setInterval(() => {
  // big scan every day
  syncBooks({ maxPages: 50, startAt: 1 })
}, 24*60*60*1000)

setInterval(() => {
  // Full scan every week
  syncBooks({ maxPages: 500, startAt: 1 })
}, 24*60*60*1000 * 7)

const wait500ms = s => setTimeout(s, 500)
const limitCapV2 = (handler, cap) => {
  const queue = new Set()
  return async (item) => {
    while (queue.size > cap) {
      await new Promise(wait500ms)
    }
    const work = handler(item)
    queue.add(work)
    work.finally(() => queue.delete(work))
  }
}

const AA = limitCapV2(syncBookAA, 3, 'AA')
const GR = limitCapV2(syncBookGR, 6, 'GR')


let total = 0
const after = 1724596276
for await (const book of forEachBook({ limit: 100, offset: 9000 })) {
  await waitUntilNoSyncPending()
  total += 1
  const done = book.gr_updatedAt > after
  book.aa_updatedAt || book.aa_href || AA(book)
  // console.log(book.name, done ? 'DONE' : 'TODO')
  if (done) continue
  console.log('enqueue', book.name)
  await GR(book)
}

// 2 issues to fix:
// - both background checks and main loop going
// - fix dates of newer entries
