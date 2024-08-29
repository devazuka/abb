import { logReq, echo } from './lib.js'

const meiliUrl = Deno.env.get('MEILI_URL').replace(/\/$/, '')
const key = Deno.env.get('MEILI_MASTER_KEY')
const Authorization = key && `Bearer ${key}`
const defaultHeaders = Authorization
  ? { 'Content-Type': 'application/json', Authorization }
  : { 'Content-Type': 'application/json' }

export const meliProxySearch = request => {
  const headers = new Headers(request.headers)
  Authorization && headers.set('Authorization', Authorization)

  return fetch(`${meiliUrl}/indexes/audiobooks/search`, {
    method: request.method,
    headers,
    body: request.body,
    redirect: 'manual',
  })
}

const wait500ms = s => setTimeout(s, 1000)
const waitForTaskToEnd = async taskUid => {
  do {
    // var hoisting allow us to return it outside of the do / while
    await new Promise(wait500ms)
    var task = await meli(`/tasks/${taskUid}`)
  } while (task.status === 'enqueued' || task.status === 'processing')
  return task
}

const { origin, hostname } = new URL(meiliUrl)
const log = (...args) => logReq(hostname, ...args)
export const meli = async (path, data, method) => {
  method = method || (data ? 'POST' : 'GET')
  const res = await fetch(`${meiliUrl}${path}`, {
    method,
    headers: defaultHeaders,
    body: data && JSON.stringify(data),
  })
  path.includes('/tasks/') || log(res.status, ...(data?.q ? [`${path}?q=${data.q}`] : [path, method]))
  if (res.status === 204) return
  if (!res.ok) {
    const body = await res.text()
    const err = Error(res.statusText)
    err.code = res.status
    err.body = body
    try {
      err.body = JSON.parse(body)
    } catch {}
    throw err
  }
  return res.json()
}

// request.taskUid
export const showTaskResult = async taskUid => {
  const result = await waitForTaskToEnd(taskUid)
  if (result.status === 'failed') {
    const err = Error(result.error.message)
    err.type = result.error.type
    echo(result.error.message)
    echo(result.error.link)
    throw err
  }
  return result
}

export const getDocument = id => meli(`/indexes/audiobooks/documents/${id}`)
export const updateDocument = documents =>
  meli('/indexes/audiobooks/documents', documents, 'PUT')

export const attributeSearch = async (key, value, props) =>
  (await meli('/indexes/audiobooks/search', {
    ...props,
    attributesToSearchOn: [key],
    q: value,
  }))?.hits || []

export const documentExists = async key => {
  const [hit] = await attributeSearch('slug', key, { limit: 1 })
  return hit?.slug === key && hit
}

// await updateBook('c0a84cf1e56f7179bdb9a3c9d18d71e79ce3e759')
const resolvers = []
const batch = []
const handleBatch = async () => {
  const books = [...batch]
  batch.length = 0

  const resolversPending = [...resolvers]
  resolvers.length = 0

  try {
    const { taskUid } = await updateDocument(books)
    const result = await showTaskResult(taskUid)
    echo('updated books:', result.details.indexedDocuments)
    for (const { resolve } of resolversPending) resolve(books.length)
  } catch (err) {
    echo('unable to update books, error:', err)
    for (const { reject } of resolversPending) reject(err)
  }
}

let batchTimeout
const push = item => {
  clearTimeout(batchTimeout)
  batch.push(item)
  batchTimeout = setTimeout(handleBatch, 1000 - batch.length * 50)
}

export const waitForAllBookUpdates = () => new Promise((resolve, reject) => {
  if (!batch.length) return resolve(0)
  resolvers.push({ resolve, reject })
})

export const updateBook = async (data, id) => {
  try {
    if (!data) return
    if (!data.id && !(data.id = id)) throw Error('missing data id')
    const match = batch.find(i => i.id === data.id)
    if (match) return Object.assign(match, data)
    const item = { id: data.id }
    try {
      Object.assign(item, await getDocument(data.id))
    } catch (err) {
      if (err.code !== 404) throw err
    }
    Object.assign(item, data)
    push(item)
  } catch (err) {
    echo('update book error:',  err)
    await new Promise(s => setTimeout(s, 1000))
    return updateBook(data, id)
  }
}



// Do some global changes on the database:
// update the dates format to timestamps (in sec)

const getBooksPages = async function* ({ limit = 10, offset = 0, reverse } = {}) {
  while (true) {
    try {
      const { results } = await meli('/indexes/audiobooks/documents/fetch', {
        offset,
        limit,
        // sort: sort || ['uploadDate:desc', 'creationDate:desc'],
      })
      echo('get-books-progress', offset / limit + 1, { offset, count: results.length })
      reverse ? (offset -= limit) : (offset += limit)
      yield results
      if (results.length < limit) break
    } catch (err) {
      echo('retry in 1s, err:', err)
      await new Promise(s => setTimeout(s, 1000))
    }
  }
}

export const forEachBook = async function* (args) {
  if (args?.reverse) {
    for await (const results of getBooksPages(args)) {
      for (const result of results.reverse()) yield result
    }
  } else {
    for await (const results of getBooksPages(args)) {
      for (const result of results) yield result
    }
  }
}

/*
const idkwhatisdis = {}
for await (const book of forEachBook(10000)) {
  for (const key of ['datePublished', 'uploadDate', 'gr_updatedAt', 'aa_updatedAt', 'creationDate']) {
    if (book[key] && typeof book[key] === 'number' && book[key] < 1724592) {
      console.log(book)
      Deno.exit(1)
    }
  }
//  await new Promise(s => setTimeout(s, 1000))
}


await Deno.writeTextFile('db-names.json', JSON.stringify(idkwhatisdis, null, 2))


*/