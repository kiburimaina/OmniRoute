import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { withOrganization, withUserTransaction } from "@/lib/db";
import { WorkspaceManager } from "./workspace-manager";

export const runtime = "nodejs";

export default async function WorkspacePage() {
 const session=await auth.api.getSession({headers:await headers()});
 if(!session) redirect("/sign-in");
 const organizations=await withUserTransaction(async(client,userId)=>{
  const result=await client.query(
   `SELECT o.id,o.name,m.role FROM organizations o JOIN organization_members m ON m.organization_id=o.id WHERE m.user_id=$1 ORDER BY o.created_at ASC LIMIT 1`,
   [userId],
  );
  return result.rows as Array<{id:string;name:string;role:string}>;
 });
 if(!organizations.length) redirect("/onboarding");
 const organization=organizations[0];
 const data=await withOrganization(organization.id,["owner","admin","operator","viewer"],async(client)=>{
  const [p,t,a,g]=await Promise.all([
   client.query(`SELECT id,name,description FROM projects WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 100`,[organization.id]),
   client.query(`SELECT t.id,t.title,t.status,t.project_id AS "projectId",t.assigned_agent_id AS "assignedAgentId",t.workflow_id AS "workflowId",t.result,t.last_error AS "lastError",t.attempt_count AS "attemptCount",t.max_attempts AS "maxAttempts",t.started_at AS "startedAt",t.completed_at AS "completedAt",a.name AS "agentName" FROM tasks t LEFT JOIN agents a ON a.organization_id=t.organization_id AND a.id=t.assigned_agent_id WHERE t.organization_id=$1 ORDER BY t.created_at DESC LIMIT 100`,[organization.id]),
   client.query(`SELECT id,task_id AS "taskId",action,details,status FROM approvals WHERE organization_id=$1 ORDER BY requested_at DESC LIMIT 100`,[organization.id]),
   client.query(`SELECT id,name,department FROM agents WHERE organization_id=$1 AND enabled=true ORDER BY name ASC`,[organization.id]),
  ]);
  return {projects:p.rows,tasks:t.rows,approvals:a.rows,agents:g.rows};
 });
 const canWrite=["owner","admin","operator"].includes(organization.role);
 const canApprove=["owner","admin"].includes(organization.role);
 return <div className="shell">
  <aside className="sidebar"><div className="brand">AI <span>WORKFORCE</span></div><div className="nav-label">Workspace</div>
   <Link className="nav-item" href="/">Overview</Link><Link className="nav-item" href="/agents">Agent registry</Link><Link className="nav-item active" href="/workspace">Projects & tasks</Link>
   <div className="nav-label">Current workspace</div><span className="nav-item">{organization.name}</span>
  </aside>
  <main className="main"><div className="topline"><div><div className="eyebrow">Workspace operations · {organization.role}</div><h1>Projects, tasks & approvals</h1><p className="sub">Plan work, track task status, and review requests that require human approval.</p></div><Link className="pill" href="/">Command centre</Link></div>
   <div className="notice">Safe mode: creating records and recording approval decisions does not run agents, call models, send messages, or perform external actions.</div>
   <WorkspaceManager organizationId={organization.id} initialProjects={data.projects} initialTasks={data.tasks} initialApprovals={data.approvals} availableAgents={data.agents} canWrite={canWrite} canApprove={canApprove}/>
  </main>
 </div>;
}
