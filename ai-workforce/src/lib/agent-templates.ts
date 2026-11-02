type AgentExecutionPolicy = { maxSteps: number; maxRuntimeSeconds: number; maxOutputTokens: number; allowedTools: string[]; requireApprovalFor: string[] };

export type AgentTemplate = {
  id: string;
  name: string;
  department: "development" | "sales" | "operations";
  description: string;
  responsibilities: string[];
  policy: AgentExecutionPolicy;
};

const safePolicy: AgentExecutionPolicy = {
  maxSteps: 8,
  maxRuntimeSeconds: 60,
  maxOutputTokens: 0,
  allowedTools: [],
  requireApprovalFor: ["external_message", "publish", "purchase", "deploy", "repository_merge"],
};

export const AGENT_TEMPLATES: AgentTemplate[] = [
  { id: "development-architect", name: "Solution Architect", department: "development", description: "Turns business goals into technical plans and scoped implementation tasks.", responsibilities: ["Review requirements and constraints", "Propose architecture and interfaces", "Break work into reviewable tasks"], policy: safePolicy },
  { id: "development-frontend", name: "Frontend Engineer", department: "development", description: "Plans accessible user interfaces and frontend implementation work.", responsibilities: ["Plan page and component structure", "Define responsive and accessible behaviour", "Prepare implementation and test tasks"], policy: safePolicy },
  { id: "development-backend", name: "Backend Engineer", department: "development", description: "Plans APIs, business logic, data contracts and integrations.", responsibilities: ["Define API contracts", "Plan validation and error handling", "Identify integration and security requirements"], policy: safePolicy },
  { id: "development-qa", name: "QA Engineer", department: "development", description: "Creates test plans and identifies functional and regression risks.", responsibilities: ["Write acceptance criteria", "Plan unit and integration coverage", "Record defects and release risks"], policy: safePolicy },
  { id: "sales-receptionist", name: "AI Receptionist", department: "sales", description: "Welcomes visitors, captures enquiries and routes requests for human follow-up.", responsibilities: ["Collect contact and enquiry details", "Classify enquiry intent", "Escalate urgent or uncertain requests"], policy: safePolicy },
  { id: "sales-consultant", name: "Sales Consultant", department: "sales", description: "Helps customers evaluate catalogue items using approved business information.", responsibilities: ["Answer product questions from approved data", "Qualify customer needs", "Prepare quotes for human confirmation"], policy: safePolicy },
  { id: "sales-support", name: "Customer Support", department: "sales", description: "Triages support issues and prepares clear responses for review.", responsibilities: ["Categorise support requests", "Gather relevant order context", "Escalate complaints and sensitive cases"], policy: safePolicy },
  { id: "operations-coordinator", name: "Operations Coordinator", department: "operations", description: "Organises internal workflows, checklists and task follow-through.", responsibilities: ["Track operational tasks", "Prepare standard operating checklists", "Flag delays and dependencies"], policy: safePolicy },
  { id: "operations-analyst", name: "Business Analyst", department: "operations", description: "Prepares operational summaries and highlights trends from authorised data.", responsibilities: ["Define useful operating metrics", "Prepare summaries and exception reports", "Document data gaps and assumptions"], policy: safePolicy },
];

export function getAgentTemplate(id: string): AgentTemplate | undefined {
  return AGENT_TEMPLATES.find((template) => template.id === id);
}
