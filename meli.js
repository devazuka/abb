const meliUrl = Deno.env.get('MELI_URL').replace(/\/$/, '')
const key = Deno.env.get('MELI_KEY')
const Authorization = key && `Bearer ${key}`
const defaultHeaders = Authorization
  ? { 'Content-Type': 'application/json', Authorization }
  : { 'Content-Type': 'application/json' }

export const meliProxySearch = request =>
  fetch(`${meliUrl}/indexes/audiobooks/search`, request)

const waitForTaskToEnd = async (taskUid) => {
  do {
    // need to be var because do/while scope lol
    var task = await meli(`/tasks/${taskUid}`)
  } while (task.status === 'enqueued' || task.status === 'processing')
  return task
}

export const meli = async (path, data, method) => {
  const res = await fetch(`${meliUrl}${path}`, {
    method: method || (data ? 'POST' : 'GET'),
    headers: defaultHeaders,
    body: data && JSON.stringify(data),
  })

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
export const showTaskResult = async (taskUid) => {
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

export const addDocuments = documents =>
  meli('/indexes/audiobooks/documents', documents, 'PUT')

export const documentExists = async key => {
  const url = `https://audiobookbay.is/abss/${key}/`
  const result = await meli('/indexes/audiobooks/search', {
    attributesToSearchOn: ['url'],
    q: url,
    limit: 1,
  })
  return result?.hits?.[0]?.url === url
}
