import { queueGR } from './goodreads.js'
import { waitForAllBookUpdates, updateBook, documentExists, forEachBook } from './meili.js'
import { queueAA } from './annasarchive.js'
import { getABB, getABBPageResults } from './audiobookbay.js'

// Because AA as a strict rate limiting we run those query with a delay

let SYNC_PENDING
const syncBooks = async ({ maxPages = 3, startAt = 1, step = 1 } = {}) => {
  await SYNC_PENDING
  let i = startAt
  let total = 0
  let scanned = 0
  let emptyPages = 0
  while (i > 0 && i <= 500) {
    let newBooks
    while (true) {
      try {
        newBooks = []
        const bs = await getABBPageResults(i)
        scanned += bs.length
        for (const b of bs) {
          let book = await documentExists(b.key)
          if (!book?.name) {
            book = await getABB(b.key)
            updateBook(book)
            newBooks.push(book)
          }
          book.gr_updatedAt || queueGR.enqueue(book)
          book.aa_updatedAt || queueAA.enqueue(book)
        }
        break
      } catch (err) {
        console.log('unexpected error in main loop:', err)
        console.log('retry...')
      }
    }
    emptyPages += !newBooks.length
    if (emptyPages > maxPages) break
    total += newBooks.length
    i += step
  }
  await waitForAllBookUpdates()
  console.log(`total books added: ${total}/${scanned}`, total)
  setTimeout(() => SYNC_PENDING = syncBooks(), 10*60*1000)
}

SYNC_PENDING = syncBooks({ maxPages: 5, startAt: 1 })

setInterval(() => {
  // big scan every day
  SYNC_PENDING = syncBooks({ maxPages: 50, startAt: 1 })
}, 24*60*60*1000)

setInterval(() => {
  // Full scan every week
  SYNC_PENDING = syncBooks({ maxPages: 500, startAt: 1 })
}, 24*60*60*1000 * 7)

let total = 0
const after = 1724596276
for await (const book of forEachBook({ limit: 100 })) {
  await SYNC_PENDING
  total += 1
  const done = book.gr_updatedAt > after
  book.aa_updatedAt || book.aa_href || queueAA.enqueue(book)
  // console.log(book.name, done ? 'DONE' : 'TODO')
  if (done) continue
  const grChanges = await queueGR.enqueue(book)
}

// 2 issues to fix:
// - both background checks and main loop going
// - fix dates of newer entries
