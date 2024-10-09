import path = require('node:path')
import { promises as fs } from 'node:fs'

import { runInSandbox } from './sandbox.services.js'

import { type CompilingTask, SandboxStatus, type CompileSucceeded, type CompileFailed, CompilingStatus, type CompilingCheckerTask, CompilingCheckerResult } from '@argoncs/types'
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

export async function compileChecker ({ task, boxId }: { task: CompilingCheckerTask, boxId: number }): Promise<CompilingCheckerResult>
{
  const workDir = `/var/local/lib/isolate/${boxId}/box`
  const srcPath = path.join(workDir, 'checker.cpp')
  const binaryPath = path.join(workDir, 'checker')
  const logPath = path.join(workDir, 'checker-log.txt')
  await fs.writeFile(srcPath, task.source);

  const command = '/usr/bin/g++ -o2 -w -fmax-errors=3 -std=c++17 checker.cpp -lm -o checker' 

  console.log('command:', command);
  console.log(workDir, srcPath, binaryPath);

  const result = await runInSandbox({
    task: {
      constraints: {},
      command,
      stderrPath: logPath,
      env: 'PATH=/bin:/usr/local/bin:/usr/bin'
    },
    boxId
  })

  console.log('compiled checker')

  if (result.status !== SandboxStatus.Succeeded)
    return {
      status: CompilingStatus.Failed,
      log: (await fs.readFile(logPath)).toString()
    }
  
  const { versionId } = await minio.putObject('checkers', task.problemId, binaryPath)

  if (versionId === null) 
    return {
      status: CompilingStatus.Failed,
      log: 'failed to put into bucket'
    }

  console.log("checker put'ed")

  const log = (await fs.readFile(logPath)).toString()
  return {
    status: CompilingStatus.Succeeded,
    checker: {
      name: task.problemId,
      versionId
    }
  }
}
