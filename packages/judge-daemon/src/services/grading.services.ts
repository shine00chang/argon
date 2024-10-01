import {
  SandboxStatus, GradingStatus, type GradingTask, type GradingResult
} from '@argoncs/types'
import { languageConfigs } from '../../configs/language.configs.js'

import path = require('node:path')
import { makeExecutable, exec } from '../utils/system.utils.js'
import {
  runInSandbox
} from './sandbox.services.js'

import { fetchBinary, fetchTestcase } from './storage.services.js'

export async function gradeSubmission ({ task, boxId }: { task: GradingTask, boxId: number }): Promise<GradingResult> {

  const workDir = `/var/local/lib/isolate/${boxId}/box`
  const config = languageConfigs[task.language]
  const binaryPath = path.join(workDir, config.binaryFile)
  const inputPath = path.join(workDir, 'in.txt')
  const answerPath = path.join(workDir, 'ans.txt')

  await fetchBinary({ objectName: task.submissionId, destPath: binaryPath })
  await fetchTestcase({ objectName: task.testcase.input.objectName, versionId: task.testcase.input.versionId, destPath: inputPath })
  await fetchTestcase({ objectName: task.testcase.output.objectName, versionId: task.testcase.output.versionId, destPath: answerPath })
  await makeExecutable(path.join(workDir, config.binaryFile))

  let command = config.executeCommand
  command = command.replaceAll('{binary_path}', config.binaryFile)

  console.log('cmd: ', command);
  const sandboxResult = await runInSandbox(
    {
      task: {
        command,
        constraints: task.constraints,
        inputPath: 'in.txt',
        outputPath: 'out.txt'
      },
      boxId
    })
  //return  new Promise((resolve, reject) => resolve({ message: '', status: GradingStatus.Accepted, memory: 1, time: 1, wallTime: 1}));
  
  if (sandboxResult.status === SandboxStatus.Succeeded) {
    const { time, wallTime, memory } = sandboxResult
    try {
      await exec(`diff -Z -B ${answerPath} ${path.join(workDir, 'out.txt')}`)
      return {
        status: GradingStatus.Accepted,
        time,
        wallTime,
        memory,
        message: 'Submission accepted'
      }
    } catch (err) {
      return {
        status: GradingStatus.WrongAnswer,
        time,
        wallTime,
        memory,
        message: 'Wrong answer'
      }
    }
  } else {
    return sandboxResult
  }
}
