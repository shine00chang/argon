import { Constraints, JudgerTaskType } from './judger.types'
import { Static, Type } from '@sinclair/typebox'

export enum SubmissionLang {
  C = 'C',
  CPP = 'C++',
}

export interface LanguageConfig {
  srcFile: string
  binaryFile: string
  displayName: string
  compileCommand: string
  executeCommand: string
  constraints: Constraints
}

export interface CompilingTask {
  type: JudgerTaskType.Compiling
  constraints: Constraints
  language: SubmissionLang
  submissionId: string
}

export enum CompilingStatus {
  Succeeded = 'CS',
  Failed = 'CF'
}

export const CompileSucceededSchema = Type.Object({
  status: Type.Literal(CompilingStatus.Succeeded)
})
export type CompileSucceeded = Static<typeof CompileSucceededSchema>

export const CompileFailedSchema = Type.Object({
  status: Type.Literal(CompilingStatus.Failed),
  log: Type.String()
})
export type CompileFailed = Static<typeof CompileFailedSchema>

// When using Type.Union, all children should not have addtionalProperties: false set to avoid an ajv issue
export const CompilingResultSchema = Type.Union([CompileSucceededSchema, CompileFailedSchema])
export type CompilingResult = Static<typeof CompilingResultSchema>
