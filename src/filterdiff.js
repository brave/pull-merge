import { spawn } from 'child_process'

export default async function filterdiff ({ content, args = ['--exclude=**/package-lock.json', '--exclude=**/yarn.lock', '--exclude=**/*.js.map'], debug }) {
  const realArgs = ['--strip=1']
  // if args is not an array, split it on spaces
  if (typeof args === 'string') {
    args = args.split(' ').filter(Boolean)
  }

  if (args.length > 0) { realArgs.push(...args) }

  if (debug) console.log(`filterdiff ${realArgs.join(' ')}`)

  const cp = spawn('filterdiff', realArgs)
  const output = []
  const error = []

  cp.stdin.write(content)

  cp.stdout.on('data', (data) => output.push(data))
  cp.stderr.on('data', (data) => error.push(data))
  cp.stdin.end()

  await new Promise((resolve) => cp.on('close', resolve))

  if (error.length > 0) { throw new Error(error.join()) }

  return output.join()
}
