import {
  type NewProblem,
  type Problem
} from '@argoncs/types' /*=*/
import { NotFoundError } from 'http-errors-enhanced'
import { mongoClient, domainProblemCollection, submissionCollection, uploadSessionCollection } from '@argoncs/common'
import { testcaseExists } from './testcase.services.js'

import { nanoid } from 'nanoid'

/*
export async function createDomainProblem ({ newProblem, domainId }: { newProblem: NewProblem, domainId: string }): Promise<{ problemId: string }> {
  const problemId = nanoid()
  const problem: Problem = { ...newProblem, id: problemId, domainId }
  await domainProblemCollection.insertOne(problem)
  return { problemId }
}
*/

/*
export async function updateDomainProblem ({ problemId, domainId, problem }: { problemId: string, domainId: string, problem: Partial<NewProblem> }): Promise<{ modified: boolean }> {
  if (problem.testcases != null) {
    const testcasesVerifyQueue: Array<Promise<void>> = []
    problem.testcases.forEach((testcase) => {
      testcasesVerifyQueue.push(testcaseExists({ problemId, filename: testcase.input.name, versionId: testcase.input.versionId }))
      testcasesVerifyQueue.push(testcaseExists({ problemId, filename: testcase.output.name, versionId: testcase.output.versionId }))
    })
    await Promise.all(testcasesVerifyQueue)
  }

  const { matchedCount, modifiedCount } = await domainProblemCollection.updateOne({ id: problemId, domainId }, { $set: problem })
  if (matchedCount === 0) {
    throw new NotFoundError('Problem not found')
  }

  return { modified: modifiedCount > 0 }
}
*/

export async function deleteDomainProblem ({ problemId, domainId }: { problemId: string, domainId: string }): Promise<void> {
  const session = mongoClient.startSession()
  try {
    await session.withTransaction(async () => {
      const { deletedCount } = await domainProblemCollection.deleteOne({ id: problemId, domainId }, { session })

      if (deletedCount === 0) {
        throw new NotFoundError('Problem not found')
      }

      await uploadSessionCollection.deleteMany({ problemId })
      await submissionCollection.deleteMany({ problemId })
    })
  } finally {
    await session.endSession()
  }
}

export async function fetchDomainProblems ({ domainId }: { domainId: string }): Promise<Problem[]> {
  const problems = await domainProblemCollection.find({ domainId }).sort({ _id: -1 }).toArray()

  return problems
}
