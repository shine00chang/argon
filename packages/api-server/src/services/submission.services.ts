import {
  type CompilingTask,
  JudgerTaskType,
  type NewSubmission,
  SubmissionStatus,
  type Submission,
  type Problem
} from '@argoncs/types' /*=*/
import { rabbitMQ, judgerExchange, judgerTasksKey, submissionCollection, fetchContestProblem } from '@argoncs/common'
import { languageConfigs } from '../../configs/language.configs.js'

import { nanoid } from 'nanoid'

export async function createSubmission (
  { submission, userId, problemId, contestId, teamId }:
  { submission: NewSubmission, userId: string, problemId: string, contestId: string, teamId?: string }): Promise<{ submissionId: string }> 
{
  const problem = await fetchContestProblem({ problemId })

  const submissionId = nanoid()
  const pendingSubmission: Submission = {
    ...submission,
    id: submissionId,
    status: SubmissionStatus.Compiling,
    problemId: problem.id,
    teamId,
    userId,
    contestId,
    createdAt: (new Date()).getTime()
  }

  await submissionCollection.insertOne(pendingSubmission)

  const task: CompilingTask = {
    submissionId,
    type: JudgerTaskType.Compiling,
    source: submission.source,
    language: submission.language,
    constraints: languageConfigs[submission.language].constraints
  }
  rabbitMQ.publish(judgerExchange, judgerTasksKey, Buffer.from(JSON.stringify(task)))

  return { submissionId }
}

export async function querySubmissions ({ query }: { query: { problemId?: string, teamId?: string, userId?: string, contestId?: string } }): Promise<Submission[]> {
  return await submissionCollection.find(query).sort({ createdAt: -1 }).toArray()
}
