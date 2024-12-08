import { type Problem } from '@argoncs/types' /*=*/
import { NotFoundError } from 'http-errors-enhanced'
import { contestProblemCollection } from '../connections/mongodb.connections.js'

export async function fetchContestProblem ({ problemId }: { problemId: string }): Promise<Problem> {
  const problem = await contestProblemCollection.findOne({ id: problemId })
  if (problem == null) {
    throw new NotFoundError('Problem not found')
  }
  return problem
}
