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

export async function createPolygonUploadSession ({ domainId, replaceId = undefined }: { domainId: string, replaceId?: string }):
  Promise<{ uploadId: string }> 
{
  const id = nanoid(32)
  await uploadSessionCollection.insertOne({ id, domainId, replaceId, createdAt: (new Date()).getTime() })
  return { uploadId: id }
}
