#!/usr/bin/env node

import { parseArgs } from 'node:util';
const [ node, file, _module, ...args ] = process.argv;

const run = (await import(_module)).default;
const innerArgs = parseArgs({args, strict: false});

console.log(await run(innerArgs.values));