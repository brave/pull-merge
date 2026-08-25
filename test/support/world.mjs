import { Before, After, setWorldConstructor, setDefaultTimeout } from '@cucumber/cucumber'
import path from 'path'
import { fileURLToPath } from 'url'
import { mockState, resetState } from './state.mjs'
import { hermeticFetch } from './fake-fetch.mjs'

const supportDir = path.dirname(fileURLToPath(import.meta.url))
const testBinDir = path.join(supportDir, '..', 'bin')

class CustomWorld {
  constructor ({ attach, parameters }) {
    this.attach = attach
    this.parameters = parameters
    this.state = mockState()
  }
}

setWorldConstructor(CustomWorld)
setDefaultTimeout(20000)

let savedFetch = null
let savedPath = null
let savedLog = null
let savedCwd = null
let envSnapshot = null

Before(function () {
  this.state = resetState()
  savedFetch = globalThis.fetch
  globalThis.fetch = hermeticFetch
  savedPath = process.env.PATH
  process.env.PATH = `${testBinDir}:${process.env.PATH}`
  savedLog = console.log
  console.log = (...args) => { this.state.logs.push(args.map((arg) => arg instanceof Error ? arg.message : typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ')) }
  savedCwd = process.cwd()
  envSnapshot = { ...process.env }
})

After(function () {
  globalThis.fetch = savedFetch
  process.env.PATH = savedPath
  console.log = savedLog
  if (process.cwd() !== savedCwd) {
    process.chdir(savedCwd)
  }
  for (const key of Object.keys(process.env)) {
    if (!(key in envSnapshot)) {
      delete process.env[key]
    }
  }
  for (const [key, value] of Object.entries(envSnapshot)) {
    process.env[key] = value
  }
})
