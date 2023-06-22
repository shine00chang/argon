import {
  NewProblem,
  Problem
} from '@argoncs/types'
import { NotFoundError } from 'http-errors-enhanced'
import { mongoClient, problemBankCollection, submissionCollection, testcaseUploadCollection } from '@argoncs/common'
import { testcaseExists } from './testcase.services.js'

import { nanoid } from '../utils/nanoid.utils.js'

export async function createInProblemBank (newProblem: NewProblem, domainId: string): Promise<{ problemId: string }> {
  const problemId = await nanoid()
  const problem: Problem = { ...newProblem, id: problemId, domainId }
  await problemBankCollection.insertOne(problem)
  return { problemId }
}

export async function updateInProblemBank (problemId: string, domainId: string, problem: Partial<NewProblem>): Promise<{ modified: boolean }> {
  if (problem.testcases != null) {
    const testcasesVerifyQueue: Array<Promise<void>> = []
    problem.testcases.forEach((testcase) => {
      testcasesVerifyQueue.push(testcaseExists(problemId, domainId, testcase.input.name, testcase.input.versionId))
      testcasesVerifyQueue.push(testcaseExists(problemId, domainId, testcase.output.name, testcase.output.versionId))
    })
    await Promise.all(testcasesVerifyQueue)
  }

  const { matchedCount, modifiedCount } = await problemBankCollection.updateOne({ id: problemId, domainId }, { $set: problem })
  if (matchedCount === 0) {
    throw new NotFoundError('No problem found in this domain with the given ID.', { problemId, domainId })
  }

  return { modified: modifiedCount > 0 }
}

export async function deleteInProblemBank (problemId: string, domainId: string): Promise<void> {
  const session = mongoClient.startSession()
  try {
    const { deletedCount } = await problemBankCollection.deleteOne({ id: problemId, domainId }, { session })

    if (deletedCount === 0) {
      throw new NotFoundError('No problem found in this domain with the given ID.', { problemId, domainId })
    }

    await testcaseUploadCollection.deleteMany({ problemId })
    await submissionCollection.deleteMany({ problemId })
  } finally {
    await session.endSession()
  }
}

export async function fetchDomainProblems (domainId: string): Promise<Problem[]> {
  const problems = await problemBankCollection.find({ domainId }).sort({ _id: -1 }).toArray()

  return problems
}
