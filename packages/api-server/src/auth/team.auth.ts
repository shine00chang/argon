/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { FastifyReply, FastifyRequest } from 'fastify'
import { ForbiddenError, InternalServerError, UnauthorizedError } from 'http-errors-enhanced'
import { fetchTeam } from '../services/team.services.js'
import { submissionAnnotateHook } from '../hooks/submission.hooks.js'

export async function verifyTeamMembership (request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (request.auth == null) {
    throw new UnauthorizedError('User not logged in')
  }

  // @ts-expect-error
  if ((request.params.teamId == null || request.params.contestId == null) && request.params.submissionId != null) {
    await submissionAnnotateHook(request, reply)
  }

  const { contestId, teamId } = request.params as { contestId: string | undefined, teamId: string | undefined }

  if (contestId == null || typeof contestId !== 'string' || teamId == null || typeof teamId !== 'string') {
    throw new InternalServerError('Resource not associated with a contest or a team')
  }

  if (request.auth.teams[contestId] == null || request.auth.teams[contestId] !== teamId) {
    throw new ForbiddenError('User is not a member of this team')
  }
}

export async function verifyTeamCaptain (request: FastifyRequest, reply: FastifyReply) {
  if (request.auth == null) {
    throw new UnauthorizedError('User not logged in')
  }

  const { contestId, teamId } = request.params as { contestId: string | undefined, teamId: string | undefined }

  if (contestId == null || typeof contestId !== 'string' || teamId == null || typeof teamId !== 'string') {
    throw new InternalServerError('Resource not associated with a contest or a team')
  }

  const team = await fetchTeam(teamId, contestId)
  if (team.captain !== request.auth.id) {
    throw new ForbiddenError('User needs to be the captain to perform this action')
  }
}