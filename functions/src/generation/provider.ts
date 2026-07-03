export interface GenerationInput { photoBytes: Buffer; mimeType: string; prompt: string; }
export interface GenerationOutput { imageBytes: Buffer; mimeType: string; costEstimate: number; }
export interface GenerationProvider { generate(input: GenerationInput): Promise<GenerationOutput>; }
