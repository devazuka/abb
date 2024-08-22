import { queueGR } from './goodreads.js'
import { showTaskResult, addDocuments, documentExists, meli } from './meli.js'
import { queueAA } from './annasarchive.js'
import { getABB, getABBPageResults } from './audiobookbay.js'

// Because AA as a strict rate limiting we run those query with a delay

const addBook = async book => {
  try {
    await addDocuments([book])
  } catch {
    return addBook(book)
  }
}

let pendingSync
const syncBooks = async ({ maxPages = 3, startAt = 1, step = 1 } = {}) => {
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
          if (!book) {
            book = await getABB(b.key)
            await addBook(book)
            newBooks.push(book)
          } else {
            if (book.gr_bookId && !book.gr_updatedAt) {
              book.gr_updatedAt = Date.now()
            }
            if (book.aa_href && !book.aa_updatedAt) {
              book.aa_updatedAt = Date.now()
            }
          }
          queueGR.push(book)
          queueAA.push(book)
        }
        break
      } catch (err) {
        console.log(err)
        console.log('retry...')
      }
    }
    emptyPages += !newBooks.length
    if (emptyPages > maxPages) break
    total += newBooks.length
    i += step
  }
  console.log(`total books added: ${total}/${scanned}`, total)
  pendingSync = undefined
}

setInterval(() => pendingSync || syncBooks(), 1000 * 60 * 60)
setInterval(
  () =>
    (pendingSync = Promise.resolve(pendingSync).then(() =>
      syncBooks({ maxPages: 300 }),
    )),
  1000 * 60 * 60 * 24,
)
pendingSync = syncBooks({ maxPages: 500, startAt: 1 })
