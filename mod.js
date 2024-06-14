import { loadGoodReadsData } from './goodreads.js'
import { showTaskResult, addDocuments, documentExists, meli } from './meli.js'
import { searchAA } from './annasarchive.js'
import { getABB, getABBPageResults } from './audiobookbay.js'
import { startServer } from './server.js'

// Because AA as a strict rate limiting we run those query with a delay
const queue = []
setInterval(async () => {
  const book = queue.pop()
  if (!book) return
  try {
    const aa = await searchAA(book.name)
    Object.assign(book, aa[0])
    await addDocuments([book])
  } catch (err) {
    console.log('fail to retrive AA info for book:', book, err)
    queue.push(book)
  }
}, 60*1000)

let pendingSync
const syncBooks = async ({ maxPages = 3, startAt = 0, step = 1 } = {}) => {
  let i = startAt
  let total = 0
  let scanned = 0
  let emptyPages = 0
  const tasks = []
  while ((i+=step) > 0) {
    let newBooks
    while (true) {
      try {
        newBooks = []
        const bs = await getABBPageResults(i)
        scanned += bs.length
        for (const b of bs) {
          if (await documentExists(b.key)) continue
          const book = await getABB(b.key)
          const pageUrl = `/indexes/audiobooks/documents/${book.id}`
          const current = await meli(pageUrl).catch(err => err)
          if (current.code !== 404) continue
          const gr = await loadGoodReadsData(book.name).catch(err => ({}))
          Object.assign(book, gr[0])
          newBooks.push(book)
          queue.push(book)
        }
        break
      } catch (err) {
        console.log(err)
        console.log('retry...')
      }
    }
    emptyPages += !newBooks.length
    if (emptyPages > maxPages) break
    tasks.push(await addDocuments(newBooks))
    total += newBooks.length
  }
  console.log(`total books added: ${total}/${scanned}`, total)
  console.log(await Promise.all(tasks.map(r => showTaskResult(r.taskUid))))
  pendingSync = undefined
}

setInterval(() => pendingSync || syncBooks(), 1000 * 60 * 60)
setInterval(() => pendingSync = Promise.resolve(pendingSync).then(() => syncBooks({ maxPages: 300 })), 1000 * 60 * 60 * 24)
syncBooks()
startServer()
