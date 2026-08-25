import { When, Then } from '@cucumber/cucumber'
import { expect } from 'chai'
import { spawn } from 'child_process'

When('run.js executes {string} with args {string}', function (modulePath, args) {
  const argv = ['run.js']
  if (modulePath) argv.push(modulePath)
  if (args) argv.push(...args.split(' ').filter(Boolean))
  return new Promise((resolve) => {
    const child = spawn(process.execPath, argv, { cwd: process.cwd() })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('close', (code) => {
      this.exitCode = code
      this.stdout = stdout
      this.stderr = stderr
      resolve()
    })
  })
})

Then('it exits with code {int}', function (code) {
  expect(this.exitCode, `stderr: ${this.stderr}`).to.equal(code)
})

Then('it exits with a non-zero code', function () {
  expect(this.exitCode).to.not.equal(0)
})

Then('it prints {string}', function (text) {
  expect(this.stdout).to.equal(`${text}\n`)
})
