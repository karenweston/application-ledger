const STATUSES=[
  {key:"in_works",label:"In the works"},
  {key:"applied",label:"Applied"},
  {key:"on_ice",label:"On ice"},
  {key:"not_applying",label:"Not going to apply"}
];
const STATUS_LABEL=Object.fromEntries(STATUSES.map(s=>[s.key,s.label]));
/* Claude skills that work on the résumé itself */
const TOOLS=["job-description-analyzer","resume-tailoring","resume-ats-optimizer","resume-tailor","resume-bullet-writer","resume-quantifier","resume-formatter","resume-section-builder","resume-version-manager","tech-resume-optimizer","executive-resume-writer","creative-portfolio-resume","career-changer-translator","academic-cv-builder","portfolio-case-study-writer"];
const SHORT={"job-description-analyzer":"JD analyzer","resume-tailoring":"Tailoring","resume-ats-optimizer":"ATS optimizer"};

let db=null, assets=null, jobs=[], loaded=false, canWrite=true;
let filter="all", query="", sortBy="match";
let editing=null, draft=null, deleteArmed=false;

const $=s=>document.querySelector(s);
function h(tag,attrs,...kids){
  const el=document.createElement(tag);
  for(const [k,v] of Object.entries(attrs||{})){
    if(v==null||v===false) continue;
    if(k==="class") el.className=v;
    else if(k.startsWith("on")) el.addEventListener(k.slice(2),v);
    else el.setAttribute(k,v===true?"":v);
  }
  for(const k of kids.flat()){ if(k==null||k===false) continue; el.append(k.nodeType?k:document.createTextNode(String(k))); }
  return el;
}
const num=v=>(v===""||v==null||isNaN(+v))?null:Math.max(0,Math.min(100,Math.round(+v)));
const scoreColor=v=>v>=80?"var(--good)":v>=60?"var(--ok)":"var(--weak)";
const fmtDate=d=>{ if(!d) return ""; const t=new Date(d+(d.length===10?"T12:00:00":"")); return isNaN(t)?d:t.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"}); };
const blobUrl=id=>window.ledgerBlobUrl?window.ledgerBlobUrl(id):"/_blob/"+id;
function postedCell(d){
  if(!d) return h("span",{class:"empty-v"},"—");
  const t=new Date(d+(d.length===10?"T12:00:00":"")); if(isNaN(t)) return h("span",{},d);
  const today=new Date(); today.setHours(12,0,0,0);
  const days=Math.round((today-new Date(t.getFullYear(),t.getMonth(),t.getDate(),12))/864e5);
  const ago=days<=0?"Today":days===1?"Yesterday":days<14?`${days} days ago`:days<60?`${Math.round(days/7)} weeks ago`:`${Math.round(days/30)} months ago`;
  return h("span",{class:"posted",title:`Posted ${fmtDate(d)}`},
    h("span",{class:"ago"+(days<=7?" fresh":days>30?" stale":"")},ago),
    h("span",{class:"on"},t.toLocaleDateString(undefined,{month:"short",day:"numeric"})));
}
const bestMatch=j=>{ const a=[j.matchJda,j.matchTailoring].filter(v=>typeof v==="number"); return a.length?Math.max(...a):null; };

function meter(v){ return h("div",{class:"meter"}, h("span",{style:v==null?"width:0":`width:${v}%;background:${scoreColor(v)}`})); }
function pct(v,title){ return v==null?h("span",{class:"empty-v",title},"—"):h("span",{class:"pct",title,style:`color:${scoreColor(v)}`},v,h("small",{},"%")); }
function matchTitle(j){ const p=[]; if(typeof j.matchJda==="number") p.push(`JD analyzer ${j.matchJda}%`); if(typeof j.matchTailoring==="number") p.push(`Tailoring ${j.matchTailoring}%`); return p.join(" · ")||"No match score yet"; }

/* ---------- files: in-page viewer for uploads, copy for Mac paths ---------- */
function toast(msg,path){
  const t=$("#toast"); t.replaceChildren(h("span",{},msg));
  if(path){ const i=h("input",{readonly:true,"aria-label":"File path"}); i.value=path; t.append(i); setTimeout(()=>{ i.focus(); i.select(); },0); }
  t.hidden=false; clearTimeout(toast.t); toast.t=setTimeout(()=>{ t.hidden=true; },path?12000:3000);
}
function copyPath(p){
  const fallback=()=>toast("Copy this path, then press ⌘⇧G in Finder and paste:",p);
  try{ navigator.clipboard.writeText(p).then(()=>toast("Path copied. In Finder, press ⌘⇧G and paste."),fallback); }catch(_){ fallback(); }
}
function viewFile(f,title){
  const host=$("#viewerHost");
  const body=h("div",{class:"vbody"},h("div",{class:"vmsg"},"Loading…"));
  const esc=e=>{ if(e.key==="Escape") close(); };
  const close=()=>{ host.replaceChildren(); document.removeEventListener("keydown",esc); };
  document.addEventListener("keydown",esc);
  host.replaceChildren(h("div",{class:"scrim",style:"z-index:30",onclick:close}),
    h("div",{class:"viewer",role:"dialog","aria-modal":"true","aria-label":title||"File"},
      h("header",{}, h("div",{class:"vt"},h("strong",{},title||"File"),h("span",{class:"vp"},f.name||"")),
        h("button",{class:"x",type:"button","aria-label":"Close",onclick:close},"×")),
      body));
  (async()=>{
    try{
      const r=await fetch(blobUrl(f.id)); if(!r.ok) throw new Error(String(r.status));
      const type=r.headers.get("content-type")||"";
      if(type.includes("pdf")||/\.pdf$/i.test(f.name||"")){
        if(!window.pdfjsLib) throw new Error("no viewer");
        const pdf=await pdfjsLib.getDocument({data:new Uint8Array(await r.arrayBuffer())}).promise;
        body.replaceChildren();
        const width=Math.min((body.clientWidth||800)-32,900);
        const dpr=window.devicePixelRatio||1;
        for(let i=1;i<=pdf.numPages;i++){
          if(!host.contains(body)) return;
          const page=await pdf.getPage(i);
          const scale=width/page.getViewport({scale:1}).width;
          const vp=page.getViewport({scale:scale*dpr});
          const c=h("canvas",{class:"vpage","aria-label":`Page ${i}`}); c.width=vp.width; c.height=vp.height; c.style.width=(vp.width/dpr)+"px";
          body.append(c);
          await page.render({canvasContext:c.getContext("2d"),viewport:vp}).promise;
        }
      } else {
        body.replaceChildren(h("pre",{class:"vtext"},await r.text()));
      }
    }catch(e){ body.replaceChildren(h("div",{class:"vmsg"},"Couldn't open this file. It may have been removed from the tracker.")); }
  })();
}
const fileName=p=>(p||"").split("/").pop();
const fileExt=p=>{ const m=/\.([a-z0-9]+)$/i.exec(p||""); return m?"."+m[1].toLowerCase():""; };

/* ---------- list ---------- */
function renderStrip(){
  const counts={all:jobs.length}; STATUSES.forEach(s=>counts[s.key]=jobs.filter(j=>j.status===s.key).length);
  const avg=k=>{ const v=jobs.map(k).filter(x=>typeof x==="number"); return v.length?Math.round(v.reduce((a,b)=>a+b,0)/v.length):null; };
  const am=avg(bestMatch), aa=avg(j=>j.ats);
  const strip=$("#strip"); strip.replaceChildren();
  const COLOR={in_works:"var(--works)",applied:"var(--applied)",on_ice:"var(--ice)",not_applying:"var(--no)"};
  const tile=(key,label)=>h("button",{type:"button",class:"tile","aria-pressed":String(filter===key),onclick:()=>{filter=filter===key&&key!=="all"?"all":key;render();}},
    h("span",{class:"n mono"},counts[key]), h("span",{class:"l"}, COLOR[key]?h("span",{class:"dot",style:`background:${COLOR[key]}`}):null, label));
  strip.append(tile("all","All jobs"));
  STATUSES.forEach(s=>strip.append(tile(s.key,s.label)));
  strip.append(h("div",{class:"tile avg"},
    h("div",{}, h("span",{class:"n mono",style:am==null?"":`color:${scoreColor(am)}`}, am??"–"), h("span",{class:"l"},"Avg match")),
    h("div",{}, h("span",{class:"n mono",style:aa==null?"":`color:${scoreColor(aa)}`}, aa??"–"), h("span",{class:"l"},"Avg ATS"))));
}

function visibleJobs(){
  const q=query.trim().toLowerCase();
  let list=jobs.filter(j=>filter==="all"||j.status===filter);
  if(q) list=list.filter(j=>[j.company,j.title,j.location,j.resumeLabel,j.resumeFile?.name,j.resumePath,(j.resumeVersions||[]).map(v=>`${v?.label||""} ${v?.path||""}`).join(" "),j.notes,(j.tools||[]).join(" ")].join(" ").toLowerCase().includes(q));
  const by={
    updated:(a,b)=>(b.updatedAt||"").localeCompare(a.updatedAt||""),
    match:(a,b)=>(bestMatch(b)??-1)-(bestMatch(a)??-1),
    ats:(a,b)=>(b.ats??-1)-(a.ats??-1),
    applied:(a,b)=>(b.dateApplied||"").localeCompare(a.dateApplied||""),
    posted:(a,b)=>(b.datePosted||"").localeCompare(a.datePosted||""),
    company:(a,b)=>(a.company||"").localeCompare(b.company||"")
  };
  return list.sort(by[sortBy]);
}

function renderRows(){
  const host=$("#rows"); host.replaceChildren();
  if(!loaded && !jobs.length){ host.append(h("div",{class:"blank"},h("h3",{},"Loading your applications…"))); return; }
  if(!jobs.length){
    host.append(h("div",{class:"blank"},
      h("h3",{},"No jobs tracked yet"),
      h("div",{},"Add a posting with its link or PDF, or ask Claude in chat to log one after scoring your résumé against it."),
      canWrite?h("button",{class:"btn primary",type:"button",onclick:()=>openSheet(null)},"+ Add your first job"):null));
    return;
  }
  const list=visibleJobs();
  if(!list.length){ host.append(h("div",{class:"blank"},h("h3",{},"Nothing matches"),h("div",{},"Try another status or clear the search."))); return; }
  for(const j of list){
    const tools=j.tools||[];
    host.append(h("div",{class:"row job",role:"button",tabindex:"0","aria-label":`Edit ${j.company||"job"} ${j.title||""}`,
        onclick:e=>{ if(e.target.closest("a,button")) return; openSheet(j.id); },
        onkeydown:e=>{ if(e.target!==e.currentTarget) return; if(e.key==="Enter"||e.key===" "){e.preventDefault();openSheet(j.id);} }},
      h("div",{class:"role c-role"},
        h("span",{class:"co"}, j.company||"Untitled company", j.example?h("span",{class:"chip ex",style:"margin-left:8px"},"Example"):null),
        h("span",{class:"ti"}, j.title||""),
        h("span",{class:"links"},
          j.jdUrl?h("a",{class:"chip",href:j.jdUrl,target:"_blank",rel:"noopener"},"Posting ↗"):null,
          j.jdFile?.id?h("button",{type:"button",class:"chip btnchip",title:"View the job description",onclick:()=>viewFile(j.jdFile,`${j.company||""} · job description`)},"JD PDF"):null,
          j.jdPath?h("button",{type:"button",class:"chip btnchip",title:j.jdPath,onclick:()=>copyPath(j.jdPath)},"Copy JD path"):null)),
      h("div",{class:"c-status","data-label":"Status"}, j.status?h("span",{class:"pill s-"+j.status},STATUS_LABEL[j.status]):h("span",{class:"empty-v"},"—")),
      h("div",{class:"c-posted","data-label":"Posted"}, postedCell(j.datePosted)),
      h("div",{class:"loc c-loc","data-label":"Location"},
        j.workMode?h("span",{class:"mode m-"+j.workMode},j.workMode):null,
        j.location?h("span",{},j.location):(j.workMode?null:h("span",{class:"empty-v"},"—"))),
      h("div",{class:"sal c-sal","data-label":"Salary"}, j.salary||h("span",{class:"empty-v"},"—")),
      h("div",{class:"c-match","data-label":"Match"}, pct(bestMatch(j),matchTitle(j))),
      h("div",{class:"c-ats","data-label":"ATS"}, pct(j.ats,"resume-ats-optimizer score")),
      h("div",{class:"resume c-resume","data-label":"Résumé"},
        (j.resumeLabel||j.resumePath||j.resumeFile?.name)
          ?h("span",{class:"rname"},(j.resumeLabel||fileName(j.resumePath)||j.resumeFile?.name).replace(/_/g," "))
          :h("span",{class:"empty-v"},"—"),
        (j.resumeFile?.id||j.resumePath||j.status==="applied")?h("span",{class:"links",style:"margin-top:4px"},
          j.resumePath?h("button",{type:"button",class:"chip btnchip",title:`Working file: ${j.resumePath}`,onclick:()=>copyPath(j.resumePath)},"Working file "+fileExt(j.resumePath)):null,
          j.resumeFile?.id?h("button",{type:"button",class:"chip btnchip sub",title:`Submitted: ${j.resumeFile.name||"PDF"}`,onclick:()=>viewFile(j.resumeFile,`${j.company||""} · submitted résumé`)},"Submitted PDF")
            :(j.status==="applied"?h("span",{class:"chip missing",title:"Upload the PDF you sent in the job's Résumé section"},"No submitted PDF"):null)):null,
        (j.resumeVersions||[]).filter(v=>v&&(v.label||v.path)).map(v=>h("div",{class:"rver"},
          h("span",{class:"rname"},(v.label||fileName(v.path)).replace(/_/g," ")),
          v.path?h("span",{class:"links",style:"margin-top:4px"},
            h("button",{type:"button",class:"chip btnchip",title:`Working file: ${v.path}`,onclick:()=>copyPath(v.path)},"Working file "+fileExt(v.path))):null))),
      h("div",{class:"tools c-tools","data-label":"Claude tools"},
        tools.length?tools.map(t=>h("span",{class:"chip",title:t},SHORT[t]||t)):h("span",{class:"empty-v"},"—"))));
  }
}
/* ---------- company notes ---------- */
const INTEREST=[{key:"high",label:"High interest"},{key:"medium",label:"Some interest"},{key:"low",label:"Low interest"}];
const INTEREST_LABEL=Object.fromEntries(INTEREST.map(i=>[i.key,i.label]));
const INTEREST_RANK={high:0,medium:1,low:2};
let companies=[], coLoaded=false, tab="jobs", coQuery="", coSort="interest", coEditing=null;
const norm=s=>(s||"").trim().toLowerCase();
const jobsFor=c=>jobs.filter(j=>norm(j.company)&&norm(j.company)===norm(c.name));
const hostOf=u=>{ try{ return new URL(u).host.replace(/^www\./,""); }catch(_){ return u; } };

function setTab(t){
  tab=t; try{localStorage.setItem("ledger-tab",t);}catch(_){}
  $("#tab-jobs").setAttribute("aria-selected",String(t==="jobs"));
  $("#tab-companies").setAttribute("aria-selected",String(t==="companies"));
  $("#jobsView").hidden=t!=="jobs"; $("#coView").hidden=t!=="companies";
  $("#addBtn").textContent=t==="jobs"?"+ Add job":"+ Add company";
}
function renderCompanies(){
  const host=$("#coGrid"); host.replaceChildren();
  if(!coLoaded && !companies.length){ host.append(h("div",{class:"blank"},h("h3",{},"Loading your companies…"))); return; }
  if(!companies.length){
    host.append(h("div",{class:"blank"},
      h("h3",{},"No company notes yet"),
      h("div",{},"Keep notes on places you'd like to work, even before there's a role to apply for."),
      canWrite&&db?h("button",{class:"btn primary",type:"button",onclick:()=>openCoSheet(null)},"+ Add your first company"):null));
    return;
  }
  const q=norm(coQuery);
  let list=companies.filter(c=>!q||[c.name,c.url,c.location,c.workMode,c.notes].join(" ").toLowerCase().includes(q));
  const by={
    interest:(a,b)=>(INTEREST_RANK[a.interest]??3)-(INTEREST_RANK[b.interest]??3)||(a.name||"").localeCompare(b.name||""),
    updated:(a,b)=>(b.updatedAt||"").localeCompare(a.updatedAt||""),
    name:(a,b)=>(a.name||"").localeCompare(b.name||"")
  };
  list.sort(by[coSort]);
  if(!list.length){ host.append(h("div",{class:"blank"},h("h3",{},"Nothing matches"),h("div",{},"Try a different search."))); return; }
  for(const c of list){
    const linked=jobsFor(c);
    host.append(h("div",{class:"co-card",role:"button",tabindex:"0","aria-label":`Edit notes for ${c.name||"company"}`,
        onclick:e=>{ if(e.target.closest("a,button")) return; openCoSheet(c.id); },
        onkeydown:e=>{ if(e.target!==e.currentTarget) return; if(e.key==="Enter"||e.key===" "){e.preventDefault();openCoSheet(c.id);} }},
      h("div",{class:"cohead"}, h("h3",{},c.name||"Untitled company"), c.interest?h("span",{class:"int i-"+c.interest},INTEREST_LABEL[c.interest]):null),
      (c.workMode||c.location)?h("div",{class:"cometa"}, c.workMode?h("span",{class:"mode m-"+c.workMode},c.workMode):null, c.location?h("span",{},c.location):null):null,
      c.notes?h("div",{class:"conotes"},c.notes):h("div",{class:"empty-v"},"No notes yet"),
      h("div",{class:"cofoot"},
        c.url?h("a",{class:"chip",href:c.url,target:"_blank",rel:"noopener",title:c.url},hostOf(c.url)+" ↗"):null,
        linked.length?h("button",{type:"button",class:"chip btnchip",title:"Show these jobs in the Jobs tab",onclick:()=>{ query=c.name; $("#search").value=c.name; filter="all"; setTab("jobs"); render(); }},`${linked.length} job${linked.length>1?"s":""} tracked`):null)));
  }
}

function openCoSheet(id){
  coEditing=id; editing=null; deleteArmed=false;
  const c=id?companies.find(x=>x.id===id):null;
  draft=c?JSON.parse(JSON.stringify(c)):{name:"",url:"",location:"",workMode:"",interest:"",notes:""};
  delete draft.id;
  drawCoSheet();
}
function drawCoSheet(){
  const host=$("#sheetHost"); host.replaceChildren();
  const c=coEditing?companies.find(x=>x.id===coEditing):null;
  const intset=h("div",{class:"statusset",role:"radiogroup","aria-label":"Interest"},
    INTEREST.concat([{key:"",label:"Not sure yet"}]).map(i=>{ const r=h("input",{type:"radio",name:"int",value:i.key,id:"int-"+(i.key||"none")}); r.checked=(draft.interest||"")===i.key;
      r.addEventListener("change",()=>{ draft.interest=i.key; });
      return h("label",{for:"int-"+(i.key||"none")},r,i.key?h("span",{class:"int i-"+i.key},i.label):h("span",{},i.label)); }));
  const saveErr=h("span",{class:"err",hidden:true});
  const saveBtn=h("button",{type:"button",class:"btn primary",onclick:save},coEditing?"Save changes":"Add company");
  const delBtn=coEditing?h("button",{type:"button",class:"btn danger"+(deleteArmed?" armed":""),onclick:del},deleteArmed?"Click again to delete":"Delete"):null;
  async function save(){
    if(!draft.name.trim()){ saveErr.textContent="Add the company's name."; saveErr.hidden=false; return; }
    saveBtn.disabled=true; saveBtn.textContent="Saving…";
    const now=new Date().toISOString();
    const data={...draft,updatedAt:now,updatedBy:"you"};
    if(!coEditing) data.createdAt=now;
    try{
      if(coEditing) await db.doc("companies/"+coEditing).set(data); else await db.collection("companies").add(data);
      closeSheet();
    }catch(e){
      saveBtn.disabled=false; saveBtn.textContent=coEditing?"Save changes":"Add company";
      saveErr.textContent=e?.code==="invalid_argument"?"You don't have permission to change this tracker.":"Couldn't save. Check your connection and try again.";
      saveErr.hidden=false;
    }
  }
  async function del(){
    if(!deleteArmed){ deleteArmed=true; drawCoSheet(); return; }
    try{ await db.doc("companies/"+coEditing).delete(); closeSheet(); }catch(e){ saveErr.textContent="Couldn't delete. Try again."; saveErr.hidden=false; }
  }
  host.append(
    h("div",{class:"scrim",onclick:closeSheet}),
    h("aside",{class:"sheet",role:"dialog","aria-modal":"true","aria-labelledby":"sheetTitle",onkeydown:e=>{ if(e.key==="Escape") closeSheet(); }},
      h("header",{}, h("h2",{id:"sheetTitle"}, coEditing?(draft.name||"Edit company"):"Add a company"), h("button",{class:"x",type:"button","aria-label":"Close",onclick:closeSheet},"×")),
      h("div",{class:"body"},
        h("fieldset",{}, h("legend",{},"Company"),
          field("Company name","name",{full:true}),
          field("Link","url",{type:"url",full:true,placeholder:"https://…/careers",hint:"Careers page, website, or anything worth bookmarking."}),
          field("Location","location",{placeholder:"City, State"}),
          field("Work mode","workMode",{options:["","Remote","Hybrid","Onsite"]})),
        h("fieldset",{}, h("legend",{},"How interested are you?"), intset),
        h("fieldset",{}, h("legend",{},"Notes"), field("Notes","notes",{type:"textarea",full:true,hint:"Why it's interesting, culture, people you know, roles to watch for."})),
        c?.updatedAt?h("div",{class:"stamp"},`Last updated ${new Date(c.updatedAt).toLocaleString()} by ${c.updatedBy==="claude"?"Claude":"you"}`):null),
      h("footer",{}, delBtn||h("span"), h("div",{style:"display:flex;gap:8px;align-items:center;flex-wrap:wrap"}, saveErr, h("button",{type:"button",class:"btn",onclick:closeSheet},"Cancel"), saveBtn))));
  if(!canWrite){ host.querySelectorAll(".sheet input,.sheet select,.sheet textarea,.sheet footer .primary,.sheet footer .danger").forEach(e=>e.disabled=true); }
  setTimeout(()=>{ const f=$("#f-name"); if(f&&!coEditing) f.focus(); },0);
}

function render(){
  renderStrip(); renderRows(); renderCompanies();
  $("#cnt-jobs").textContent=jobs.length; $("#cnt-companies").textContent=companies.length;
  $("#addBtn").hidden=!canWrite||!db;
}

/* ---------- sheet ---------- */
const BLANK=()=>({company:"",title:"",jdUrl:"",jdFile:null,location:"",workMode:"",salary:"",dateFound:new Date().toISOString().slice(0,10),
  status:"in_works",dateApplied:"",followUp:"",resumeLabel:"",resumeFile:null,resumeVersions:[],matchJda:null,matchTailoring:null,ats:null,tools:[],notes:""});

function openSheet(id){
  editing=id; coEditing=null; deleteArmed=false;
  const j=id?jobs.find(x=>x.id===id):null;
  draft=j?JSON.parse(JSON.stringify(j)):BLANK();
  delete draft.id;
  draft.tools=draft.tools||[];
  draft.resumeVersions=(draft.resumeVersions||[]).map(v=>({label:v?.label||"",path:v?.path||""}));
  drawSheet();
}
function closeSheet(){ editing=null; coEditing=null; draft=null; $("#sheetHost").replaceChildren(); }

function field(label,key,opts={}){
  const id="f-"+key;
  const input=opts.type==="textarea"?h("textarea",{id}):opts.options?h("select",{id},...opts.options.map(o=>h("option",{value:o},o||"—"))):h("input",{id,type:opts.type||"text",placeholder:opts.placeholder||null,min:opts.min,max:opts.max,inputmode:opts.inputmode});
  input.value=draft[key]??"";
  input.addEventListener("input",()=>{ draft[key]=opts.number?num(input.value):input.value; if(opts.onchange) opts.onchange(); });
  return h("div",{class:"f"+(opts.full?" full":"")}, h("label",{for:id},label), input, opts.hint?h("span",{class:"hint"},opts.hint):null);
}
function scoreField(label,key,hint){
  const id="f-"+key;
  const input=h("input",{id,type:"number",min:"0",max:"100",inputmode:"numeric",placeholder:"0–100"});
  input.value=draft[key]??"";
  const box=h("div",{class:"scorebox"},input,meter(draft[key]));
  input.addEventListener("input",()=>{ draft[key]=num(input.value); box.lastChild.replaceWith(meter(draft[key])); });
  return h("div",{class:"f"}, h("label",{for:id},label), box, h("span",{class:"hint"},hint));
}
function fileField(label,key,accept,hint){
  const id="f-"+key;
  const err=h("span",{class:"err",hidden:true});
  const nameBox=h("div",{class:"name"});
  const input=h("input",{id,type:"file",accept});
  const pick=h("button",{type:"button",class:"btn"},"Choose file");
  const clear=h("button",{type:"button",class:"btn"},"Remove");
  const paint=()=>{
    nameBox.replaceChildren(draft[key]?.id?h("button",{type:"button",class:"linkbtn",onclick:()=>viewFile(draft[key],draft[key].name)},draft[key].name||"File"):h("span",{class:"empty-v"},"No file uploaded"));
    clear.hidden=!draft[key]; pick.textContent=draft[key]?"Replace":"Choose file";
  };
  pick.addEventListener("click",()=>input.click());
  clear.addEventListener("click",()=>{ draft[key]=null; paint(); });
  input.addEventListener("change",async()=>{
    const f=input.files[0]; if(!f) return;
    err.hidden=true; pick.disabled=true; pick.textContent="Uploading…";
    const ext=(f.name.split(".").pop()||"").toLowerCase();
    const type={pdf:"application/pdf",txt:"text/plain",md:"text/markdown"}[ext]||f.type;
    try{
      const r=await assets.upload(f,{type});
      draft[key]={id:r.id,name:f.name,size:r.sizeBytes};
    }catch(e){
      err.textContent=e?.code==="unsupported_type"?"That file type can't be stored here. Save it as PDF (or .txt / .md) and try again.":e?.code==="too_large"?"That file is over 20 MB.":"Upload failed. Try again in a moment.";
      err.hidden=false;
    }
    pick.disabled=false; input.value=""; paint();
  });
  paint();
  if(!assets){ pick.hidden=true; clear.hidden=true; }
  return h("div",{class:"f full"}, h("span",{class:"lab"},label), h("div",{class:"file"},nameBox,pick,clear,input), err,
    h("span",{class:"hint"}, assets?hint:"Only people who can edit this page can upload files."));
}

function versionsField(){
  const list=h("div",{class:"vers"});
  const paint=()=>{
    list.replaceChildren(
      ...draft.resumeVersions.map((v,i)=>{
        const name=h("input",{type:"text",placeholder:"Version name, e.g. Executive","aria-label":`Version ${i+2} name`});
        const path=h("input",{type:"text",placeholder:"/Users/…/output/Other_Version.docx","aria-label":`Version ${i+2} working file`});
        name.value=v.label; path.value=v.path;
        name.addEventListener("input",()=>{ v.label=name.value; });
        path.addEventListener("input",()=>{ v.path=path.value; });
        return h("div",{class:"verrow"},name,path,
          h("button",{type:"button",class:"btn",onclick:()=>{ draft.resumeVersions.splice(i,1); paint(); }},"Remove"));
      }),
      h("div",{}, h("button",{type:"button",class:"btn",onclick:()=>{ draft.resumeVersions.push({label:"",path:""}); paint(); }},"+ Add another version")));
  };
  paint();
  return h("div",{class:"f full"}, h("span",{class:"lab"},"Other versions"), list,
    h("span",{class:"hint"},"Alternate résumés for this job, each with its own working file. The main one stays above."));
}

function drawSheet(){
  const host=$("#sheetHost"); host.replaceChildren();
  const statusset=h("div",{class:"statusset",role:"radiogroup","aria-label":"Status"},
    STATUSES.map(s=>{ const r=h("input",{type:"radio",name:"st",value:s.key,id:"st-"+s.key}); r.checked=draft.status===s.key;
      r.addEventListener("change",()=>{ const was=draft.status; draft.status=s.key; if(s.key==="applied"&&!draft.dateApplied) draft.dateApplied=new Date().toISOString().slice(0,10);
        if((was==="applied")!==(s.key==="applied")){ const b=$(".sheet .body"), top=b?b.scrollTop:0; drawSheet(); const nb=$(".sheet .body"); if(nb) nb.scrollTop=top; }
        else { const d=$("#f-dateApplied"); if(d) d.value=draft.dateApplied; } });
      return h("label",{for:"st-"+s.key},r,h("span",{class:"pill s-"+s.key},s.label)); }));
  const toolgrid=h("div",{class:"toolgrid"}, TOOLS.concat((draft.tools||[]).filter(t=>!TOOLS.includes(t))).map(t=>{
    const c=h("input",{type:"checkbox",id:"t-"+t}); c.checked=draft.tools.includes(t);
    c.addEventListener("change",()=>{ draft.tools=c.checked?[...new Set([...draft.tools,t])]:draft.tools.filter(x=>x!==t); });
    return h("label",{for:"t-"+t},c,t); }));
  const custom=h("input",{id:"f-customTool",type:"text",placeholder:"Other tool, then Enter"});
  custom.addEventListener("keydown",e=>{ if(e.key!=="Enter") return; e.preventDefault(); const v=custom.value.trim(); if(!v) return; if(!draft.tools.includes(v)) draft.tools.push(v); drawSheet(); });

  const saveErr=h("span",{class:"err",hidden:true});
  const saveBtn=h("button",{type:"button",class:"btn primary",onclick:save},editing?"Save changes":"Add job");
  const delBtn=editing?h("button",{type:"button",class:"btn danger"+(deleteArmed?" armed":""),onclick:del},deleteArmed?"Click again to delete":"Delete"):null;
  async function save(){
    if(!draft.company.trim()&&!draft.title.trim()){ saveErr.textContent="Add at least a company or a job title."; saveErr.hidden=false; return; }
    saveBtn.disabled=true; saveBtn.textContent="Saving…";
    const now=new Date().toISOString();
    const data={...draft,updatedAt:now,updatedBy:"you"};
    if(!editing) data.createdAt=now;
    try{
      if(editing) await db.doc("jobs/"+editing).set(data); else await db.collection("jobs").add(data);
      closeSheet();
    }catch(e){
      saveBtn.disabled=false; saveBtn.textContent=editing?"Save changes":"Add job";
      saveErr.textContent=e?.code==="invalid_argument"?"You don't have permission to change this tracker.":"Couldn't save. Check your connection and try again.";
      saveErr.hidden=false;
    }
  }
  async function del(){
    if(!deleteArmed){ deleteArmed=true; drawSheet(); return; }
    try{ await db.doc("jobs/"+editing).delete(); closeSheet(); }catch(e){ saveErr.textContent="Couldn't delete. Try again."; saveErr.hidden=false; }
  }
  const j=editing?jobs.find(x=>x.id===editing):null;
  host.append(
    h("div",{class:"scrim",onclick:closeSheet}),
    h("aside",{class:"sheet",role:"dialog","aria-modal":"true","aria-labelledby":"sheetTitle",onkeydown:e=>{ if(e.key==="Escape") closeSheet(); }},
      h("header",{}, h("h2",{id:"sheetTitle"}, editing?(draft.company||"Edit job"):"Add a job"), h("button",{class:"x",type:"button","aria-label":"Close",onclick:closeSheet},"×")),
      h("div",{class:"body"},
        h("fieldset",{}, h("legend",{},"The posting"),
          field("Company","company"), field("Job title","title"),
          field("Posting link","jdUrl",{type:"url",full:true,placeholder:"https://…"}),
          fileField("Job description PDF (upload)","jdFile",".pdf,application/pdf","Uploaded PDFs open right here in the tracker."),
          field("…or file path on your Mac","jdPath",{full:true,placeholder:"/Users/…/resume-tailoring/jobdescriptions/Company - Role.pdf",hint:"Shown with a Copy button. In Finder, press ⌘⇧G and paste to jump to it."}),
          field("Location","location",{placeholder:"City, State"}),
          field("Work mode","workMode",{options:["","Remote","Hybrid","Onsite"]}),
          field("Salary range","salary",{placeholder:"$140k–$165k"}),
          field("Date posted","datePosted",{type:"date",hint:"When the company listed it."}),
          field("Date found","dateFound",{type:"date"})),
        h("fieldset",{}, h("legend",{},"Application"),
          statusset,
          field("Date applied","dateApplied",{type:"date"}), field("Follow up on","followUp",{type:"date"})),
        h("fieldset",{}, h("legend",{},"Résumé"),
          field("Résumé version name","resumeLabel",{full:true,placeholder:"e.g. PM-fintech-v3",hint:"The name you'd recognize it by."}),
          field("Working file on your Mac","resumePath",{full:true,placeholder:"/Users/…/resume-tailoring/output/Your_Resume.docx",hint:"The .docx or .pages you edit. Shown with a Copy button; in Finder, press ⌘⇧G and paste."}),
          versionsField(),
          (draft.status==="applied"||draft.resumeFile)
            ?fileField("Submitted résumé (PDF)","resumeFile",".pdf,application/pdf","The exact PDF you sent. It opens right here in the tracker.")
            :h("div",{class:"f full"},h("span",{class:"hint"},"Once you mark this job Applied, you can attach the PDF you submitted here."))),
        h("fieldset",{}, h("legend",{},"Scores"),
          scoreField("Match · JD analyzer","matchJda","From job-description-analyzer"),
          scoreField("Match · Tailoring","matchTailoring","From resume-tailoring"),
          scoreField("ATS score","ats","From resume-ats-optimizer")),
        h("fieldset",{}, h("legend",{},"Claude tools used on this résumé"), toolgrid,
          h("div",{class:"f full"}, custom)),
        h("fieldset",{}, h("legend",{},"Notes"), field("Notes","notes",{type:"textarea",full:true})),
        j?.updatedAt?h("div",{class:"stamp"},`Last updated ${new Date(j.updatedAt).toLocaleString()} by ${j.updatedBy==="claude"?"Claude":"you"}`):null),
      h("footer",{}, delBtn||h("span"), h("div",{style:"display:flex;gap:8px;align-items:center;flex-wrap:wrap"}, saveErr, h("button",{type:"button",class:"btn",onclick:closeSheet},"Cancel"), saveBtn))));
  if(!canWrite){ host.querySelectorAll(".sheet input,.sheet select,.sheet textarea,.sheet footer .primary,.sheet footer .danger").forEach(e=>e.disabled=true); }
  setTimeout(()=>{ const f=$("#f-company"); if(f&&!editing) f.focus(); },0);
}

/* ---------- wiring ---------- */
$("#addBtn").addEventListener("click",()=>tab==="companies"?openCoSheet(null):openSheet(null));
$("#tab-jobs").addEventListener("click",()=>setTab("jobs"));
$("#tab-companies").addEventListener("click",()=>setTab("companies"));
$("#coSearch").addEventListener("input",e=>{ coQuery=e.target.value; renderCompanies(); });
$("#coSort").addEventListener("change",e=>{ coSort=e.target.value; renderCompanies(); });
try{ const t=localStorage.getItem("ledger-tab"); setTab(t==="companies"?"companies":"jobs"); }catch(_){ setTab("jobs"); }
$("#search").addEventListener("input",e=>{ query=e.target.value; renderRows(); });
$("#sort").addEventListener("change",e=>{ sortBy=e.target.value; try{localStorage.setItem("ledger-sort",sortBy);}catch(_){} renderRows(); });
try{ const s=localStorage.getItem("ledger-sort"); if(s){ sortBy=s; $("#sort").value=s; } }catch(_){}
function note(msg){ const n=$("#note"); n.textContent=msg||""; n.hidden=!msg; }
const DEMO_MSG="Demo mode: all data here is fictional and stays in this browser. Edit anything you like.";

render();
(async()=>{
  let c=window.claude, tries=0;
  while(!c?.use && tries<30){ await new Promise(r=>setTimeout(r,100)); c=window.claude; tries++; }
  if(!c?.use){ loaded=true; coLoaded=true; canWrite=false; note("This tracker saves to claude.ai. Open it there to see and edit your jobs."); render(); return; }
  [db,assets]=await Promise.all([c.use("db"),c.use("assets")]);
  const user=await c.use("user");
  if(user){ try{ const w=await user.can("data.write"); if(w===false) canWrite=false; }catch(_){} }
  if(!db){ loaded=true; coLoaded=true; canWrite=false; note("Sign in to claude.ai to see your tracked jobs."); render(); return; }
  if(window.LEDGER_DEMO){
    const rb=$("#resetBtn"); rb.hidden=false;
    rb.addEventListener("click",()=>{ if(confirm("Reset to the original sample data?")) window.ledgerResetDemo(); });
  }
  const timer=setTimeout(()=>{ if(!loaded) note("Can't reach your saved jobs yet. They'll appear once the connection comes back."); },10000);
  db.collection("jobs").onSnapshot(snap=>{
    jobs=snap.docs.map(d=>({id:d.id,...d.data()}));
    if(!snap.metadata.fromCache){ loaded=true; clearTimeout(timer); note(window.LEDGER_DEMO?DEMO_MSG:""); }
    render();
  },err=>{ loaded=true; clearTimeout(timer); note("Lost the connection to your saved jobs. Reload the page to reconnect."); render(); });
  db.collection("companies").onSnapshot(snap=>{
    companies=snap.docs.map(d=>({id:d.id,...d.data()}));
    if(!snap.metadata.fromCache) coLoaded=true;
    render();
  },err=>{ coLoaded=true; render(); });
})();
