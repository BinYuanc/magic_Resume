export interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean };
}
export const tools: ToolDescriptor[];
export function validate(value: unknown, schema: Record<string, unknown>, path?: string): void;
