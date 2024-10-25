import {
  type Problem
} from '@argoncs/types' /*=*/
import { NotFoundError } from 'http-errors-enhanced'
import { mongoClient, domainProblemCollection, submissionCollection, uploadSessionCollection } from '@argoncs/common'


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
