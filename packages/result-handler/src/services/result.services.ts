import { contestCollection, contestProblemCollection, fetchSubmission, judgerExchange, judgerTasksKey, rabbitMQ, ranklistRedis, recalculateTeamTotalScore, submissionCollection, teamScoreCollection } from '@argoncs/common'
import { type CompilingResult, CompilingStatus, type GradingResult, GradingStatus, type GradingTask, JudgerTaskType, type Problem, SubmissionStatus, type CompilingCheckerResult  } from '@argoncs/types' /*=*/
import {NotFoundError} from 'http-errors-enhanced';
import path from 'path'

export async function handleCompileResult (compileResult: CompilingResult, submissionId: string): Promise<void> {
  const submission = await fetchSubmission({ submissionId })

  // Not a compiling submission?
  if (submission.status !== SubmissionStatus.Compiling) {
    console.error('handleCompletResult() got submission that is not compiling. skip.');
    return;
  }

  // Compilation failed
  if (compileResult.status !== CompilingStatus.Succeeded) {
    await submissionCollection.updateOne({ id: submissionId }, {
      $set: {
        status: SubmissionStatus.CompileFailed,
        log: compileResult.log
      }
    });
    return;
  }


  const { problemId } = submission

  const problem = await contestProblemCollection.findOne({ problemId });
  if (problem === null) 
    throw new NotFoundError("problem does not exist");

  if (problem.testcases == null) {
    await completeGrading(submissionId, 'Problem does not have testcases');
    return
  }

  if (problem.checker === null || problem.checker === undefined) {
    await completeGrading(submissionId, 'Problem Checker does not exist or is not compiled');
    return
  }

  const submissionTestcases: Array<{}> = []

  problem.testcases.forEach((testcase, index) => {
    const task: GradingTask = {
      constraints: problem.constraints,
      type: JudgerTaskType.Grading,
      submissionId,
      problemId: problem.id,
      testcase: {
        input: {
          objectName: path.join(problem.id, testcase.input.name),
          versionId: testcase.input.versionId
        },
        output: {
          objectName: path.join(problem.id, testcase.output.name),
          versionId: testcase.output.versionId
        }
      },
      checker: { 
        objectName: problem.checker!.name,
        versionId: problem.checker!.versionId 
      },
      testcaseIndex: index,
      language: submission.language
    }
    rabbitMQ.publish(judgerExchange, judgerTasksKey, Buffer.from(JSON.stringify(task)))
    submissionTestcases.push({})
  })

  await submissionCollection.updateOne({ id: submissionId }, {
    $set: {
      status: SubmissionStatus.Grading,
      gradedCases: 0,
      testcases: submissionTestcases
    }
  })
}

export async function completeGrading (submissionId: string, log?: string): Promise<void> {
  const submission = await fetchSubmission({ submissionId })
  const { problemId, contestId, teamId, status, createdAt } = submission;
  const problem = await contestProblemCollection.findOne({ problemId });
  const contest = await contestCollection.findOne({ contestId });
  if (contest == null) throw new NotFoundError("contest does not exist")
  if (problem == null) throw new NotFoundError("problem does not exist")

  // Unexpected status
  if (status !== SubmissionStatus.Compiling &&
      status !== SubmissionStatus.Grading) {
    console.error('completeGrading recieved unexpected status: ', submission.status);
    return;
  }

  // Failed on Transition from Compiling to Grading or Grading Failed
  if (submission.status === SubmissionStatus.Compiling ||
      submission.gradedCases !== submission.testcases.length) {
    await submissionCollection.updateOne({ id: submissionId }, { $set: { status: SubmissionStatus.Terminated, log } })
    return;
  } 
  const testcases = submission.testcases;

  // Calculate score
  // eslint-disable-next-line @typescript-eslint/restrict-plus-operands 
  const passes = testcases.reduce((t, testcase) => t + (testcase.result!).status == GradingStatus.Accepted ? 1 : 0, 1);
  const score = problem.partials ? 
    passes / testcases.length * 100 :
    (passes == testcases.length ? 100 : 0);
  const was = await submissionCollection.find({ problemId, teamId, score: { $ne: 100 }, createdAt: { $lt: createdAt } }).count();
  const penalty = score === 100 ?
    was * 10 + (createdAt - contest.startTime) / 3600 :
    0;
    
  await submissionCollection.updateOne({ id: submissionId }, {
    $set: {
      score,
      penalty,
      status: SubmissionStatus.Graded
    },
    $unset: { gradedCases: '' }
  })

  // Skip score update if testing submission
  if (contestId == null || teamId == null) 
    return

  const { modifiedCount } = await teamScoreCollection.updateOne({ contestId, id: teamId }, {
    $max: { [`scores.${problemId}`]: score }
  })

  // Only update if score increased 
  if (modifiedCount > 0) {
    await teamScoreCollection.updateOne({ contestId, id: teamId }, {
      $set: {
        [`time.${problemId}`]: createdAt,
        [`penalty.${problemId}`]: penalty } 
    })
    await recalculateTeamTotalScore({ contestId, teamId })
    await ranklistRedis.set(`${submission.contestId}-obsolete`, 1)
  }
}

export async function handleGradingResult (gradingResult: GradingResult, submissionId: string, testcaseIndex: number): Promise<void> {
  const submission = await fetchSubmission({ submissionId })

  if (submission.status !== SubmissionStatus.Grading) 
    return

  if (submission.testcases[testcaseIndex] == null) 
    throw new NotFoundError('No testcase found at the given index')

  submission.testcases[testcaseIndex].result = gradingResult
  await submissionCollection.updateOne(
    { id: submissionId }, 
    {
      $set: { [`testcases.${testcaseIndex}.result`]: gradingResult },
      $inc: { gradedCases: 1 }
    })

  const updatedSubmission = await fetchSubmission({ submissionId })
  if (updatedSubmission.status === SubmissionStatus.Grading && 
      updatedSubmission.gradedCases === updatedSubmission.testcases.length) 
    await completeGrading(submissionId)
}

export async function handleCompileCheckerResult (result: CompilingCheckerResult, problemId: string): Promise<void> {

  if (result.status == CompilingStatus.Failed) {
    // TODO: warn of broken checker
    console.log('checker compilation failed')
    return
  }

  const checker = result.checker;
  console.log('checker compilation result recieved: ', checker);
  await contestProblemCollection.updateOne({ id: problemId }, { $set: { checker }});
}

