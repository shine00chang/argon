import path = require('node:path')
import { promises as fs } from 'node:fs'

import { runInSandbox } from './sandbox.services.js'

import { type CompilingTask, SandboxStatus, type CompileSucceeded, type CompileFailed, CompilingStatus } from '@argoncs/types'
import { minio } from '@argoncs/common'
import { languageConfigs } from '../../configs/language.configs.js'

/*=*/

export async function compileSubmission ({ task, boxId }: { task: CompilingTask, boxId: number }): Promise<CompileSucceeded | CompileFailed> {
  const workDir = `/var/local/lib/isolate/${boxId}/box`
  const config = languageConfigs[task.language]
  const srcPath = path.join(workDir, config.srcFile)
  const binaryPath = path.join(workDir, config.binaryFile)
  const logPath = path.join(workDir, 'log.txt')
  await fs.writeFile(srcPath, task.source)

  const command = config.compileCommand
    .replaceAll('{src_path}', config.srcFile)
    .replaceAll('{binary_path}', config.binaryFile)

  console.log('command:', command);
  console.log(workDir, config, srcPath, binaryPath);

  const result = await runInSandbox(
    {
      task: {
        constraints: task.constraints,
        command,
        stderrPath: logPath,
        env: 'PATH=/bin:/usr/local/bin:/usr/bin'
      },
      boxId
    })

  console.log('compiled')
  if (result.status === SandboxStatus.Succeeded) {
    await minio.fPutObject('binaries', task.submissionId, binaryPath)
    return {
      status: CompilingStatus.Succeeded
    }
  } else {
    const log = (await fs.readFile(logPath)).toString()
    return {
      status: CompilingStatus.Failed,
      log
    }
  }
}

export async function compileChecker ({ task, boxId }: { task: CompilingTask, boxId: number }): Promise<CompileSucceeded | CompileFailed> {

  const workDir = `/var/local/lib/isolate/${boxId}/box`
  const srcPath = path.join(workDir, 'checker.cpp')
  const binaryPath = path.join(workDir, 'checker')
  const logPath = path.join(workDir, 'checker-log.txt')
  await fetchCheckerSource(srcPath);

  const command = '/usr/bin/g++ -o2 -w -fmax-errors=3 -std=c++17 checker.cpp -lm -o checker' 

  console.log('command:', command);
  console.log(workDir, srcPath, binaryPath);

  const result = await runInSandbox(
    {
      task: {
        constraints: {},
        command,
        stderrPath: logPath,
        env: 'PATH=/bin:/usr/local/bin:/usr/bin'
      },
      boxId
    })

  console.log('compiled')
  if (result.status !== SandboxStatus.Succeeded) {
    return {
      status: CompilingStatus.Failed,
      log: (await fs.readFile(logPath)).toString()
    }
  }

  await minio.fPutObject('checkers', task.problemId, binaryPath)
  return { status: CompilingStatus.Succeeded }
}
