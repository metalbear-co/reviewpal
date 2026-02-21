/**
 * Persona configurations and language detection for adversarial review.
 * Extracted from adversarial.ts for reuse by the unified review pipeline.
 */
import { DiffFile } from '../types.js';
export interface PersonaConfig {
    name: string;
    systemPrompt: string;
    focusTypes: string[];
}
export declare const SECURITY_AUDITOR: PersonaConfig;
export declare const REGRESSION_HUNTER: PersonaConfig;
export declare const RUST_SPECIALIST: PersonaConfig;
export declare const TYPESCRIPT_SPECIALIST: PersonaConfig;
export declare const PYTHON_SPECIALIST: PersonaConfig;
export declare const GO_SPECIALIST: PersonaConfig;
export declare const DEFAULT_SPECIALIST: PersonaConfig;
export type Language = 'rust' | 'typescript' | 'python' | 'go' | 'unknown';
export declare const EXTENSION_MAP: Record<string, Language>;
export declare function detectPrimaryLanguage(files: DiffFile[]): Language;
export declare function getSpecialist(language: Language): PersonaConfig;
/**
 * Build the set of 3 personas: security + regression + language-specialist
 */
export declare function selectPersonas(files: DiffFile[]): PersonaConfig[];
//# sourceMappingURL=personas.d.ts.map