import { NotFoundError } from 'http-errors-enhanced'
import { fetchDomainProblem, minio, uploadSessionCollection } from '@argoncs/common'

import path = require('node:path')
import { nanoid } from 'nanoid'

export async function testcaseExists ({ problemId, filename, versionId }: { problemId: string, filename: string, versionId: string }): Promise<void> {
  try {
    const stat = await minio.statObject('testcases', path.join(problemId, filename), { versionId })

    if (stat == null || stat.versionId !== versionId) {
      throw new NotFoundError('One of the testcases not found')
    }
  } catch (err) {
    throw new NotFoundError('One of the testcases not found')
  }
}

/*
export async function createUploadSession ({ problemId, domainId }: { problemId: string, domainId: string }): Promise<{ uploadId: string }> {
  const id = nanoid(32)
  await fetchDomainProblem({ problemId, domainId }) // Could throw not found
  await uploadSessionCollection.insertOne({ id, problemId, domainId, createdAt: (new Date()).getTime() })
  return { uploadId: id }
}
*/

export async function createPolygonUploadSession ({ domainId }: { domainId: string }): Promise<{ uploadId: string }> {
  const id = nanoid(32)
  await uploadSessionCollection.insertOne({ id, domainId, polygon: true, createdAt: (new Date()).getTime() })
  return { uploadId: id }
}
