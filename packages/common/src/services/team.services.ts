import { teamScoreCollection } from '../connections/mongodb.connections.js'

export async function recalculateTeamTotalScore ({ contestId, teamId = undefined }: { contestId: string, teamId?: string }): Promise<void> {
  const query = teamId != null ? { contestId, id: teamId } : { contestId }

  await teamScoreCollection.aggregate([
    {
      $match: query
    },
    {
      $project: { v: { $objectToArray: '$scores' } }
    },
    {
      $set: { totalScore: { $sum: '$v.v' } }
    },
    {
      $unset: "v"
    },
    { 
      $merge: { into: "teamScores" } 
    }
  ]).toArray()

  await teamScoreCollection.aggregate([
    {
      $match: query
    },
    {
      $project: { v: { $objectToArray: '$time' } }
    },
    {
      $set: { lastTime: { $max: '$v.v' } }
    },
    {
      $unset: "v"
    },
    { 
      $merge: { into: "lastTime" } 
    }
  ]).toArray()
}
