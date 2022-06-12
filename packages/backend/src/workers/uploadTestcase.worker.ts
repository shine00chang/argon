import { workerData, parentPort } from 'node:worker_threads'

import { cleanTestcase, BlobStorage } from '@project-carbon/common'

const { data } = workerData
const cleaned = cleanTestcase(data)

BlobStorage.uploadBuffer(cleaned, 'testcases', workerData.id).then((result) => {
  parentPort?.postMessage({ id: result.blobName })
}).catch((err) => {
  throw err
})