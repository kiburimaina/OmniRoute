export type Department = "development" | "sales" | "operations";
export type WorkflowDefinition = {
  id: string;
  department: Department;
  title: string;
  description: string;
  requiredInputs: string[];
  outputContract: string[];
  approvalActions: string[];
};

export const DEPARTMENT_WORKFLOWS: WorkflowDefinition[] = [
  { id: "dev-feature-plan", department: "development", title: "Feature implementation plan", description: "Convert a product requirement into a reviewable technical plan without changing production systems.", requiredInputs: ["goal", "constraints", "acceptance criteria"], outputContract: ["summary", "proposed design", "files or components affected", "implementation steps", "test plan", "risks and open questions"], approvalActions: ["repository_merge", "deploy"] },
  { id: "dev-qa-review", department: "development", title: "Quality assurance review", description: "Assess a proposed change against acceptance criteria and identify test gaps.", requiredInputs: ["change summary", "acceptance criteria", "test evidence"], outputContract: ["test coverage", "findings by severity", "reproduction steps", "release recommendation"], approvalActions: ["repository_merge", "deploy"] },
  { id: "sales-lead-qualification", department: "sales", title: "Lead qualification", description: "Organise a customer enquiry and prepare a human-reviewable follow-up recommendation.", requiredInputs: ["customer enquiry", "approved product information"], outputContract: ["customer need", "intent", "relevant products", "missing information", "suggested reply", "human handoff reason"], approvalActions: ["external_message"] },
  { id: "sales-product-consultation", department: "sales", title: "Product consultation", description: "Answer product questions using only approved catalogue and pricing data.", requiredInputs: ["customer question", "approved catalogue data"], outputContract: ["customer requirements", "matching products", "verified prices or explicit price gaps", "suggested next step"], approvalActions: ["external_message", "purchase"] },
  { id: "ops-daily-review", department: "operations", title: "Daily operations review", description: "Summarise authorised operational records and flag exceptions for a manager.", requiredInputs: ["reporting period", "authorised operational data"], outputContract: ["key metrics", "completed work", "overdue items", "blockers", "recommended actions", "data limitations"], approvalActions: ["external_message", "purchase"] },
  { id: "ops-sop-draft", department: "operations", title: "Standard operating procedure draft", description: "Draft an internal procedure for human review; do not publish or change live processes.", requiredInputs: ["process description", "roles", "known controls"], outputContract: ["purpose", "scope", "roles", "step-by-step procedure", "controls", "exceptions", "review owner"], approvalActions: ["publish"] },
];

export function getDepartmentWorkflows(department: Department): WorkflowDefinition[] {
  return DEPARTMENT_WORKFLOWS.filter((workflow) => workflow.department === department);
}

export function getWorkflow(id: string): WorkflowDefinition | undefined {
  return DEPARTMENT_WORKFLOWS.find((workflow) => workflow.id === id);
}
