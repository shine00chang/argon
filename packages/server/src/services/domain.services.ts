import { NewDomain, Domain, NotFoundError, ConflictError, DomainDB } from '@argoncs/types'
import { mongoClient, mongoDB } from '@argoncs/libraries'
import { deleteInProblemBank, fetchDomainProblems } from './problem.services'

import { fetchUser, updateUser } from './user.services'

const domainCollection = mongoDB.collection<DomainDB>('domains')

export async function createDomain (newDomain: NewDomain): Promise<{ domainId: string }> {
  const domain: Domain = { ...newDomain, members: [] }
  const { insertedId } = await domainCollection.insertOne({ ...domain, _id: '' })
  return { domainId: insertedId.toString() }
}

export async function deleteDomain (domainId: string): Promise<{ domainId: string }> {
  const session = mongoClient.startSession()
  try {
    let deletedDomain = ''
    await session.withTransaction(async () => {
      const { value: domain } = await domainCollection.findOneAndDelete({ _id: domainId })
      if (domain == null) {
        throw new NotFoundError('Domain does not exist.', { domainId })
      }

      const removedMembers: Array<Promise<{ domainId: string, userId: string }>> = []
      domain.members.forEach((userId) => {
        removedMembers.push(removeDomainMember(domainId, userId))
      })
      await Promise.allSettled(removedMembers)

      const deletedProblems: Array<Promise<{ problemId: string }>> = []
      const domainProblems = await fetchDomainProblems(domainId)
      domainProblems.forEach((problem) => {
        deletedProblems.push(deleteInProblemBank(problem.id, domainId))
      })

      await Promise.allSettled(deletedProblems)

      deletedDomain = domain._id
    })

    return { domainId: deletedDomain }
  } finally {
    await session.endSession()
  }
}

export async function addDomainMember (domainId: string, userId: string, scopes: string[]): Promise<{ domainId: string, userId: string }> {
  const user = await fetchUser(userId)

  if (user.scopes[domainId] != null) {
    throw new ConflictError('User is already a member of the domain.', { domainId, userId })
  }

  user.scopes[domainId] = scopes

  const session = mongoClient.startSession()
  try {
    let updatedUser: string = ''
    let updatedDomain: string = ''
    await session.withTransaction(async () => {
      updatedUser = (await updateUser(user, userId)).userId
      const { upsertedCount, upsertedId } = await domainCollection.updateOne({ _id: domainId }, { $addToSet: { members: userId } })
      if (upsertedCount === 0) {
        throw new NotFoundError('Domain does not exist.', { domainId })
      }
      updatedDomain = upsertedId.toString()
    })
    return { userId: updatedUser, domainId: updatedDomain }
  } finally {
    await session.endSession()
  }
}

export async function removeDomainMember (domainId: string, userId: string): Promise<{ domainId: string, userId: string }> {
  const user = await fetchUser(userId)

  if (user.scopes[domainId] != null) {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete user.scopes[domainId]
  }

  const session = mongoClient.startSession()
  try {
    let updatedUser: string = ''
    let updatedDomain: string = ''
    await session.withTransaction(async () => {
      updatedUser = (await updateUser(user, userId)).userId
      const { upsertedCount, upsertedId } = await domainCollection.updateOne({ _id: domainId }, { $pull: { members: userId } })
      if (upsertedCount === 0) {
        throw new NotFoundError('Domain does not exist.', { domainId })
      }
      updatedDomain = upsertedId.toString()
    })
    return { userId: updatedUser, domainId: updatedDomain }
  } finally {
    await session.endSession()
  }
}

export async function updateMemberScopes (domainId: string, userId: string, scopes: string[]): Promise<{ domainId: string, userId: string }> {
  const user = await fetchUser(userId)

  if (user.scopes[domainId] == null) {
    throw new NotFoundError('User is not part of this domain', { userId, domainId })
  }

  user.scopes[domainId] = scopes

  const updatedUser = await updateUser(user, userId)

  return { userId: updatedUser.userId, domainId }
}
