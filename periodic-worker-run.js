
const sync = new Deno.Command('deno', {
  args: ['run', '-A', 'sync-worker.js'],
})

while (true) {
  const cmd = sync.spawn()
  await cmd.status
  await new Promise(s => setTimeout(s, 1000*60))
}
