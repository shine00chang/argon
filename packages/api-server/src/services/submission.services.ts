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
  { submission, userId, problemId, contestId, teamId = undefined }:
  { submission: NewSubmission, userId: string, problemId: string, contestId: string, teamId?: string }): Promise<{ submissionId: string }> 
{
  const problem = await fetchContestProblem({ problemId })

  const submissionId = nanoid()
  let pendingSubmission: Submission = {
    ...submission,
    id: submissionId,
    status: SubmissionStatus.Compiling,
    problemId: problem.id,
    teamId,
    userId,
    contestId,
    createdAt: (new Date()).getTime()
  }

  if (teamId == undefined)
    delete pendingSubmission.teamId;

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

export async function querySubmissions ({ query }: { query: { problemId?: string, teamId?: string, userId?: string, contestId?: string } }):
  Promise<any> 
{
  const submissions = await submissionCollection.aggregate([
    { $match: query },
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: 'id',
        as: 'user',
        pipeline: [
          { $project: { username: 1, name: 1, id: 1 } }
        ]
      }
    },
    {
      $lookup: {
        from: 'contestProblems',
        localField: 'problemId',
        foreignField: 'id',
        as: 'problem',
        pipeline: [
          { $project: { name: 1, id: 1 } }
        ]
      }
    },
   {
      $set: {
         user: {$arrayElemAt:["$user",0]},
         problem: {$arrayElemAt:["$problem",0]}
      }
   },
   {
       $unset: [ 'userId', 'problemId' ]
   },
    {
      $sort: { createdAt: -1 }
    }
  ]).toArray();

  return submissions;
}
