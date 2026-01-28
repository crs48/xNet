/**
 * Script Generator - AI-powered script generation with validation
 *
 * Uses AI to generate scripts from natural language descriptions,
 * validates them against the sandbox rules, and provides retry logic.
 */

import { validateScriptAST } from '../sandbox/ast-validator'
import type { ScriptTriggerType, ScriptOutputType } from '../schemas/script'
import { buildScriptPrompt, buildRetryPrompt, type AIScriptRequest } from './prompt'
import type { AIProvider } from './providers'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Response from AI script generation
 */
export interface AIScriptResponse {
  /** The generated script code */
  code: string
  /** AI-generated explanation of what the script does */
  explanation: string
  /** Suggested name for the script */
  suggestedName: string
  /** Suggested trigger type */
  suggestedTrigger: ScriptTriggerType
  /** Whether the code passed validation */
  validated: boolean
  /** Number of generation attempts */
  attempts: number
}

/**
 * Options for the ScriptGenerator
 */
export interface ScriptGeneratorOptions {
  /** Maximum number of retry attempts on validation failure */
  maxRetries?: number
  /** Whether to throw on final validation failure (default: false, returns invalid code) */
  throwOnValidationFailure?: boolean
}

// ─── Error Classes ───────────────────────────────────────────────────────────

/**
 * Error thrown when script generation fails
 */
export class ScriptGenerationError extends Error {
  constructor(
    message: string,
    public readonly validationErrors?: string[],
    public readonly attempts?: number
  ) {
    super(message)
    this.name = 'ScriptGenerationError'
  }
}

// ─── Script Generator ────────────────────────────────────────────────────────

/**
 * Generates validated scripts from natural language using AI.
 *
 * @example
 * ```typescript
 * const generator = new ScriptGenerator(aiProvider, { maxRetries: 2 })
 *
 * const response = await generator.generate({
 *   intent: 'Calculate total with 8% tax',
 *   schema: invoiceSchema,
 *   outputType: 'value'
 * })
 *
 * if (response.validated) {
 *   // Use response.code
 * }
 * ```
 */
export class ScriptGenerator {
  private ai: AIProvider
  private maxRetries: number
  private throwOnValidationFailure: boolean

  constructor(ai: AIProvider, options: ScriptGeneratorOptions = {}) {
    this.ai = ai
    this.maxRetries = options.maxRetries ?? 2
    this.throwOnValidationFailure = options.throwOnValidationFailure ?? false
  }

  /**
   * Generate a script from a natural language request.
   *
   * @param request - The script generation request
   * @returns Generated script response
   * @throws ScriptGenerationError if throwOnValidationFailure is true and validation fails
   */
  async generate(request: AIScriptRequest): Promise<AIScriptResponse> {
    const prompt = buildScriptPrompt(request)
    let attempts = 0
    let lastErrors: string[] = []
    let currentPrompt = prompt

    // Try generation with retries
    while (attempts <= this.maxRetries) {
      attempts++

      try {
        const raw = await this.ai.generate(currentPrompt)
        const code = this.extractCode(raw)

        // Validate the generated code
        const validation = validateScriptAST(code)

        if (validation.valid) {
          return {
            code,
            explanation: this.generateExplanation(request, code),
            suggestedName: this.generateName(request.intent),
            suggestedTrigger: request.triggerType ?? this.inferTrigger(request),
            validated: true,
            attempts
          }
        }

        // Validation failed - prepare for retry
        lastErrors = validation.errors

        if (attempts <= this.maxRetries) {
          // Build retry prompt with error feedback
          currentPrompt = buildRetryPrompt(prompt, validation.errors)
        }
      } catch (err) {
        // AI generation failed
        if (attempts > this.maxRetries) {
          throw new ScriptGenerationError(
            `AI generation failed after ${attempts} attempts: ${err instanceof Error ? err.message : String(err)}`,
            lastErrors,
            attempts
          )
        }
        // Continue to retry
      }
    }

    // All retries exhausted
    if (this.throwOnValidationFailure) {
      throw new ScriptGenerationError(
        `Script validation failed after ${attempts} attempts`,
        lastErrors,
        attempts
      )
    }

    // Return the last attempt (invalid) with validated: false
    const lastRaw = await this.ai.generate(currentPrompt)
    const lastCode = this.extractCode(lastRaw)

    return {
      code: lastCode,
      explanation: this.generateExplanation(request, lastCode),
      suggestedName: this.generateName(request.intent),
      suggestedTrigger: request.triggerType ?? this.inferTrigger(request),
      validated: false,
      attempts
    }
  }

  /**
   * Extract code from AI response (strips markdown fences, etc.)
   */
  private extractCode(raw: string): string {
    let text = raw.trim()

    // Strip markdown code fences
    const fencedMatch = text.match(/```(?:javascript|js|typescript|ts)?\s*\n?([\s\S]*?)```/)
    if (fencedMatch) {
      text = fencedMatch[1].trim()
    }

    // Strip single backticks
    if (text.startsWith('`') && text.endsWith('`')) {
      text = text.slice(1, -1).trim()
    }

    // Ensure it starts with arrow function or function
    if (!text.startsWith('(') && !text.startsWith('function')) {
      // Try to find the arrow function in the text
      const arrowMatch = text.match(/(\([^)]*\)\s*=>\s*[\s\S]+)/)
      if (arrowMatch) {
        text = arrowMatch[1]
      }
    }

    return text
  }

  /**
   * Generate an explanation for the script
   */
  private generateExplanation(request: AIScriptRequest, code: string): string {
    // Simple heuristic explanation based on intent
    const intent = request.intent.toLowerCase()

    if (intent.includes('calculat') || intent.includes('comput')) {
      return `Calculates ${intent.replace(/calculat\w*|comput\w*/i, '').trim()}`
    }

    if (intent.includes('tag') || intent.includes('mark') || intent.includes('label')) {
      return `Automatically ${intent}`
    }

    if (intent.includes('check') || intent.includes('validat') || intent.includes('verify')) {
      return `Validates that ${intent.replace(/check\w*|validat\w*|verify\w*/i, '').trim()}`
    }

    return `Script that ${intent}`
  }

  /**
   * Generate a name from the intent
   */
  private generateName(intent: string): string {
    // Take meaningful words and camelCase them
    const words = intent
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2) // Skip short words
      .slice(0, 4)

    if (words.length === 0) {
      return 'customScript'
    }

    return words
      .map((word, index) => {
        const lower = word.toLowerCase()
        if (index === 0) return lower
        return lower.charAt(0).toUpperCase() + lower.slice(1)
      })
      .join('')
  }

  /**
   * Infer the best trigger type from the request
   */
  private inferTrigger(request: AIScriptRequest): ScriptTriggerType {
    const intent = request.intent.toLowerCase()
    const outputType = request.outputType

    // Computed columns should use onView
    if (outputType === 'value') {
      return 'onView'
    }

    // Mutations that react to changes should use onChange
    if (outputType === 'mutation') {
      if (
        intent.includes('when') ||
        intent.includes('if') ||
        intent.includes('auto') ||
        intent.includes('automatic')
      ) {
        return 'onChange'
      }
    }

    // Default to manual for safety
    return 'manual'
  }
}

/**
 * Convenience function for one-off script generation.
 *
 * @param provider - AI provider to use
 * @param request - Script generation request
 * @returns Generated script response
 */
export async function generateScript(
  provider: AIProvider,
  request: AIScriptRequest
): Promise<AIScriptResponse> {
  const generator = new ScriptGenerator(provider)
  return generator.generate(request)
}
