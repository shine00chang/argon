import { nanoid } from 'nanoid'
import { CompilingCheckerTask, JudgerTaskType, Problem, type Constraints, type NewProblem } from '@argoncs/types' /*=*/
import { type MultipartFile } from '@fastify/multipart' /*=*/
import { exec as exec_sync } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'
import { BadRequestError, UnauthorizedError } from 'http-errors-enhanced'
import { domainProblemCollection, judgerTasksKey, judgerExchange, rabbitMQ } from '@argoncs/common'
import { minio, uploadSessionCollection } from '@argoncs/common'
import type internal from 'node:stream'

const exec = promisify(exec_sync)

/* Extracts content from polygon package archive, updates problem data, and uploads testcases */
export async function uploadPolygon ({ domainId, replaceId, archive }: { domainId: string, replaceId?: string, archive: MultipartFile}):
  Promise<string>
{
  // Make working directory
  const work_path = path.join(process.cwd(), `temp-${nanoid()}`)
  await fs.mkdir(work_path)

  // Copy archive into directory
  await fs.writeFile(path.join(work_path, 'archive'), archive.file)

  // Unzip Archive
  const archive_path = path.join(work_path, 'archive')
  try {
    await exec(`unzip ${archive_path} -d ${work_path}`)
  } catch (err) {
    console.log(err)
    throw new BadRequestError(`Could not unzip package archive: ${err}`)
  }
  console.log(`== Finished Unzipping. ${archive_path} => ${work_path}`)

  // Extract Statement
  const problem_props = await fs.readFile(path.join(work_path, 'statements/english/problem-properties.json'))
  const statement = JSON.parse(problem_props.toString())
  console.log('statement: ', statement)

  // Extract Constraints
  const constraints: Constraints = {
    memory: statement.memoryLimit / 1024,
    time: statement.timeLimit
  }

  // Extract context
  const context = statement.legend + '\n\n' + statement.notes

  // Create Problem
  const problem: Problem = {
    id: replaceId ?? nanoid(),
    domainId,
    name: statement.name,
    context,
    inputFormat: statement.input,
    outputFormat: statement.output,
    samples: [],
    constraints
  }

  // Extract Testcases
  // Get testcase names
  const file_names = await fs.readdir(path.join(work_path, 'tests'))
  const test_names = file_names.filter(file => file !== 'archive' && !file.endsWith('.a'))
  const test_n = test_names.length
  problem.testcases = []
  console.log(test_names)

  // For each file, upload file and answer.
  for (const name of test_names) {
    const input_file = await fs.open(path.join(work_path, 'tests', name))
    const output_file = await fs.open(path.join(work_path, 'tests', name + '.a'))

    const input = await uploadTestcase({problemId:problem.id, filename: name, stream: input_file.createReadStream()})
    const output = await uploadTestcase({problemId: problem.id, filename: name + '-ans', stream: output_file.createReadStream()})

    problem.testcases.push({
      input,
      output,
      points: 100 / test_n
    })
  }
  console.log('problem: ', problem)

  // If ID exists, replace problem, else insert problem
  // The ID is set to replace ID if it exists. see above
  await domainProblemCollection.updateOne({ id: problem.id }, problem, { upsert: true })

  // Compile checker
  const checkerSource = (await fs.readFile(path.join(work_path, 'check.cpp'))).toString()
  const compileTask: CompilingCheckerTask = {
    type: JudgerTaskType.CompilingChecker,
    source: checkerSource,
    problemId: problem.id
  }
  rabbitMQ.publish(judgerExchange, judgerTasksKey, Buffer.from(JSON.stringify(compileTask)))

  // Cleanup working directory
  await exec(`rm -rf ${work_path}`)

  return problem.id
}

/* Uploads a single file into 'testcases' */
export async function uploadTestcase ({ problemId, filename, stream }:{
  problemId: string,
  filename: string,
  stream: internal.Readable
}): Promise<{ versionId: string, name: string }> {
  const objectName = path.join(problemId, filename)
  const { versionId } = await minio.putObject('testcases', objectName, stream)
  if (versionId == null) {
    throw Error('Versioning not enabled on testcases bucket')
  }

  return { versionId, name: filename }
}

/* Consumes an upload session, returns the domain and the problem to be replaced, if it exists */
export async function consumePolygonUploadSession (uploadId: string): Promise<{ domainId: string, replaceId?: string }> {
  const upload = await uploadSessionCollection.findOneAndDelete({ id: uploadId })
  if (upload == null) {
    throw new UnauthorizedError('Invalid upload session token')
  }
  return upload
}
