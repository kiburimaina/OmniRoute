"use client";
import { FormEvent, useState } from "react";

type Project = { id: string; name: string; description: string };
type Task = { id: string; title: string; status: string; projectId: string | null; assignedAgentId?: string | null; agentName?: string | null };
type Agent = { id: string; name: string; department: string };
type Approval = { id: string; taskId: string; action: string; details: Record<string, unknown>; status: string };

export function WorkspaceManager({ organizationId, initialProjects, initialTasks, initialApprovals, availableAgents, canWrite, canApprove }: {
 organizationId: string; initialProjects: Project[]; initialTasks: Task[]; initialApprovals: Approval[]; availableAgents: Agent[]; canWrite: boolean; canApprove: boolean;
}) {
 const [projects,setProjects]=useState(initialProjects), [tasks,setTasks]=useState(initialTasks), [approvals,setApprovals]=useState(initialApprovals);
 const [projectName,setProjectName]=useState(""), [taskTitle,setTaskTitle]=useState(""), [taskProject,setTaskProject]=useState(""), [taskAgent,setTaskAgent]=useState("");
 const [busy,setBusy]=useState(false), [error,setError]=useState("");
 async function request(path:string,method:string,body:Record<string,unknown>) {
  const response=await fetch(path,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.error || "Request failed");
  return data;
 }
 async function addProject(e:FormEvent<HTMLFormElement>) { e.preventDefault();setBusy(true);setError("");try{const d=await request("/api/projects","POST",{organizationId,name:projectName.trim()});setProjects(x=>[d.project,...x]);setProjectName("");}catch(x){setError(x instanceof Error?x.message:"Could not create project");}finally{setBusy(false);} }
 async function addTask(e:FormEvent<HTMLFormElement>) { e.preventDefault();setBusy(true);setError("");try{const d=await request("/api/tasks","POST",{organizationId,title:taskTitle.trim(),projectId:taskProject||null,assignedAgentId:taskAgent||null});setTasks(x=>[d.task,...x]);setTaskTitle("");setTaskAgent("");}catch(x){setError(x instanceof Error?x.message:"Could not create task");}finally{setBusy(false);} }
 async function cancelTask(task:Task) { setError("");try{const d=await request("/api/tasks?id="+encodeURIComponent(task.id),"PATCH",{organizationId});setTasks(x=>x.map(t=>t.id===task.id?{...t,status:d.task.status}:t));setApprovals(x=>x.map(a=>a.taskId===task.id&&a.status==="pending"?{...a,status:"rejected"}:a));}catch(x){setError(x instanceof Error?x.message:"Could not cancel task");} }
 async function decide(a:Approval,decision:"approved"|"rejected") { setError("");try{const d=await request("/api/approvals?id="+encodeURIComponent(a.id),"PATCH",{organizationId,decision});setApprovals(x=>x.map(y=>y.id===a.id?{...y,status:d.approval.status}:y));setTasks(x=>x.map(t=>t.id===a.taskId?{...t,status:decision==="approved"?"queued":"cancelled"}:t));}catch(x){setError(x instanceof Error?x.message:"Could not save decision");} }
 return <div className="workspace-grid">
  <section className="card" id="projects"><h2 className="section-title">Projects</h2>
   {projects.length?projects.map(p=><article className="workspace-item" key={p.id}><strong>{p.name}</strong><p className="sub">{p.description||"No description added"}</p></article>):<p className="sub">No projects yet.</p>}
   {canWrite&&<form className="agent-form" onSubmit={addProject}><label>Project name<input required maxLength={160} value={projectName} onChange={e=>setProjectName(e.target.value)} placeholder="Website redesign"/></label><button className="auth-button" disabled={busy}>Create project</button></form>}
  </section>
  <section className="card" id="tasks"><h2 className="section-title">Tasks</h2>
   {tasks.length?tasks.map(t=><article className="workspace-item" key={t.id}><div className="workspace-item-head"><strong>{t.title}</strong><span className="pill">{t.status}</span></div><p className="sub">{projects.find(p=>p.id===t.projectId)?.name||"Unassigned project"} · {t.agentName||"Unassigned agent"}</p>{canWrite&&["queued","running","waiting_approval"].includes(t.status)&&<div className="decision-actions"><button className="secondary-button danger-button" onClick={()=>void cancelTask(t)}>Cancel task</button></div>}</article>):<p className="sub">No tasks yet.</p>}
   {canWrite&&<form className="agent-form" onSubmit={addTask}><label>Task title<input required maxLength={200} value={taskTitle} onChange={e=>setTaskTitle(e.target.value)} placeholder="Prepare project requirements"/></label><label>Project<select value={taskProject} onChange={e=>setTaskProject(e.target.value)}><option value="">No project</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Assign agent<select value={taskAgent} onChange={e=>setTaskAgent(e.target.value)}><option value="">No agent</option>{availableAgents.map(a=><option key={a.id} value={a.id}>{a.name} · {a.department}</option>)}</select></label><button className="auth-button" disabled={busy}>Create task</button></form>}
  </section>
  <section className="card approval-panel" id="approvals"><h2 className="section-title">Approval queue</h2>
   {approvals.length?approvals.map(a=><article className="workspace-item" key={a.id}><div className="workspace-item-head"><strong>{a.action}</strong><span className="pill">{a.status}</span></div><p className="sub">Task {a.taskId.slice(0,8)} · {JSON.stringify(a.details)}</p>{canApprove&&a.status==="pending"&&<div className="decision-actions"><button className="secondary-button" onClick={()=>void decide(a,"approved")}>Approve</button><button className="secondary-button danger-button" onClick={()=>void decide(a,"rejected")}>Reject</button></div>}</article>):<p className="sub">No approval requests.</p>}
   <p className="metric-note">Decisions update workflow records only; they do not execute external actions.</p>
  </section>{error&&<p className="form-error" role="alert">{error}</p>}
 </div>;
}
