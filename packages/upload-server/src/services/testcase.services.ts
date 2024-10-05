import { minio, uploadSessionCollection } from '@argoncs/common'
import { type MultipartFile } from '@fastify/multipart'
import { BadRequestError, UnauthorizedError } from 'http-errors-enhanced'
import path from 'node:path'
import type internal from 'node:stream'

/* Uploads a MultipartFile to testcases. Warps 'uploadFile(..)' */
export async function uploadTestcase (
  domainId: string,
  problemId: string,
  testcase: MultipartFile
): Promise<{ versionId: string, name: string }> {
  const filename = testcase.filename.replaceAll('/', '.')
  return await uploadFile(domainId, problemId, filename, testcase.file)
}

/* Uploads a single file into 'testcases' */
export async function uploadFile (
  domainId: string,
  problemId: string,
  filename: string,
  stream: internal.Readable
): Promise<{ versionId: string, name: string }> {
  const objectName = path.join(domainId, problemId, filename)
  const { versionId } = await minio.putObject('testcases', objectName, stream)
  if (versionId == null) {
    throw Error('Versioning not enabled on testcases bucket')
  }

  return { versionId, name: filename }
}

/* Consumes an upload session, returns the domain and problem authorized */
export async function consumeUploadSession (uploadId: string): Promise<{ domainId: string, problemId: string }> {
  const upload = await uploadSessionCollection.findOneAndDelete({ id: uploadId })
  if (upload == null) {
    throw new UnauthorizedError('Invalid upload session token')
  }
  const { domainId, problemId } = upload;
  if (!problemId) {
    if (upload.polygon) 
      throw new BadRequestError('Upload session created for Polygon upload, not testcase upload.')
    else 
      throw new BadRequestError('Testcase upload session does not have problemId.')
  }
  return { domainId, problemId } 
}

/* Consumes an upload session, returns the domain and problem authorized */
export async function consumePolygonUploadSession (uploadId: string): Promise<{ domainId: string }> {
  const upload = await uploadSessionCollection.findOneAndDelete({ id: uploadId })
  if (upload == null) {
    throw new UnauthorizedError('Invalid upload session token')
  }
  if (upload.problemId && !upload.polygon) {
    throw new BadRequestError('Upload session created for testcase upload, not Polygon upload.')
  }
  return upload
}
