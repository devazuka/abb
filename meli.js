import { logReq } from './lib.js'

const meiliUrl = Deno.env.get('MEILI_URL').replace(/\/$/, '')
const key = Deno.env.get('MEILI_MASTER_KEY')
const Authorization = key && `Bearer ${key}`
const defaultHeaders = Authorization
  ? { 'Content-Type': 'application/json', Authorization }
  : { 'Content-Type': 'application/json' }

export const meliProxySearch = request =>
  fetch(`${meiliUrl}/indexes/audiobooks/search`, request)

const wait500ms = s => setTimeout(s, 500)
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
  log(res.status, path, method)
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
    console.log(result.error.message)
    console.log(result.error.link)
    throw err
  }
  return
}

export const getDocument = id => meli(`/indexes/audiobooks/documents/${id}`)
export const addDocuments = documents =>
  meli('/indexes/audiobooks/documents', documents, 'PUT')

export const documentExists = async key => {
  const url = `https://audiobookbay.is/abss/${key}/`
  const result = await meli('/indexes/audiobooks/search', {
    attributesToSearchOn: ['url'],
    q: url,
    limit: 1,
  })
  const hit = result?.hits?.[0]
  return hit?.url === url && hit
}

// TODO: update book buffer that olds books to update and mass apply changes
// every minutes or something
export const updateBook = async (bookId, data, tries = 0) => {
  try {
    // exponnential backoff
    await new Promise(s => setTimeout(s, tries ** tries * 50))
    const book = Object.assign(await getDocument(bookId), data)
    const { taskUid } = await addDocuments([book])
    await showTaskResult(taskUid)
    return book
  } catch {
    return updateBook(bookId, data, tries + 1)
  }
}

// await updateBook('c0a84cf1e56f7179bdb9a3c9d18d71e79ce3e759')
