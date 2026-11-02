import { z } from "zod";
import type { PreparedExecution } from "./agent-runtime";
import type { TaskOutput } from "./task-queue";

const SectionValue = z.union([
  z.string().trim().min(1).max(12000),
  z.array(z.string().trim().min(1).max(4000)).max(50),
]);

function sectionKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export class InvalidWorkflowOutput extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWorkflowOutput";
  }
}

export function validateTaskOutput(execution: PreparedExecution, output: TaskOutput): TaskOutput {
  const parsed = z.object({
    summary: z.string().trim().min(1).max(2000),
    data: z.record(z.string().min(1).max(80), z.unknown()),
  }).strict().safeParse(output);
  if (!parsed.success) throw new InvalidWorkflowOutput("Task output must contain a concise summary and structured data");
  if (!execution.workflow) return parsed.data as TaskOutput;

  const sections = z.record(z.string(), SectionValue).safeParse(parsed.data.data.sections);
  if (!sections.success) throw new InvalidWorkflowOutput("Workflow output must include a sections object containing non-empty text or text lists");
  const required = execution.workflow.outputContract.map(sectionKey);
  const missing = required.filter((key) => !(key in sections.data));
  if (missing.length) throw new InvalidWorkflowOutput(`Workflow output is missing required sections: ${missing.join(", ")}`);
  const unexpected = Object.keys(sections.data).filter((key) => !required.includes(key));
  if (unexpected.length) throw new InvalidWorkflowOutput(`Workflow output contains unsupported sections: ${unexpected.join(", ")}`);
  return parsed.data as TaskOutput;
}
