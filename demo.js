/*
 * Storage adapter for running Application Ledger outside claude.ai.
 *
 * The app talks to three services through window.claude.use(name):
 *   "db"     collection().onSnapshot / add, doc().set / delete
 *   "assets" upload(file, {type}) -> {id, sizeBytes}
 *   "user"   can(permission)
 * This file provides the same surface backed by localStorage, seeded with
 * fictional sample data. Swap it for a real backend (Supabase, Firebase, etc.)
 * without touching app.js.
 */
(function(){
  if(window.claude && window.claude.use) return; // running inside claude.ai: use the real runtime

  const KEY="application-ledger:data:v1";
  const day=n=>{ const d=new Date(); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); };
  const stamp=n=>{ const d=new Date(); d.setDate(d.getDate()+n); return d.toISOString(); };

  /* ---------- sample data (all fictional) ---------- */
  function seed(){
    const jd={id:"sample-job-description",name:"Northwind Labs - Senior PM, Platform.pdf",size:2100};
    const cv={id:"sample-resume",name:"Jordan_Rivera_PM_Platform_v3.pdf",size:2000};
    const jobs={
      j1:{company:"Northwind Labs",title:"Senior Product Manager, Platform",jdUrl:"https://example.com/careers/northwind-senior-pm",jdFile:jd,
        location:"Austin, TX",workMode:"Hybrid",salary:"$165k–$190k",datePosted:day(-4),dateFound:day(-3),status:"applied",dateApplied:day(-2),followUp:day(5),
        resumeLabel:"PM-platform-v3",resumePath:"/Users/you/resume-tailoring/output/PM_Platform_v3.docx",resumeFile:cv,resumeVersions:[],
        matchJda:91,matchTailoring:88,ats:94,tools:["job-description-analyzer","resume-tailoring","resume-ats-optimizer"],
        notes:"Platform team owns the internal developer portal. Referral from a former colleague. Emphasize the API migration work.",createdAt:stamp(-3),updatedAt:stamp(-2),updatedBy:"you"},
      j2:{company:"Brightline Health",title:"Group Product Manager, Patient Experience",jdUrl:"https://example.com/careers/brightline-gpm",
        location:"Boston, MA",workMode:"Hybrid",salary:"$180k–$210k",datePosted:day(-9),dateFound:day(-8),status:"in_works",dateApplied:"",followUp:"",
        resumeLabel:"PM-health-v1",resumePath:"/Users/you/resume-tailoring/output/PM_Health_v1.docx",resumeVersions:[{label:"People-leader emphasis",path:"/Users/you/resume-tailoring/output/PM_Health_v1_leader.docx"}],
        matchJda:84,matchTailoring:79,ats:81,tools:["job-description-analyzer","resume-tailoring"],
        notes:"Need a stronger regulated-industry story. Draft a bullet on the HIPAA review process.",createdAt:stamp(-8),updatedAt:stamp(-1),updatedBy:"you"},
      j3:{company:"Copperleaf Software",title:"Product Manager, Growth",jdUrl:"https://example.com/careers/copperleaf-growth-pm",
        location:"Remote (US)",workMode:"Remote",salary:"$145k–$170k",datePosted:day(-16),dateFound:day(-15),status:"applied",dateApplied:day(-12),followUp:day(-1),
        resumeLabel:"PM-growth-v2",resumePath:"/Users/you/resume-tailoring/output/PM_Growth_v2.docx",resumeVersions:[],
        matchJda:76,matchTailoring:82,ats:88,tools:["resume-tailoring","resume-ats-optimizer","resume-quantifier"],
        notes:"Recruiter screen done. Waiting on the take-home. Follow-up date has passed; send a short nudge.",createdAt:stamp(-15),updatedAt:stamp(-5),updatedBy:"you"},
      j4:{company:"Meridian Freight Tech",title:"Director of Product, Logistics Platform",jdUrl:"https://example.com/careers/meridian-director",
        location:"Chicago, IL",workMode:"Onsite",salary:"$200k–$230k",datePosted:day(-27),dateFound:day(-26),status:"on_ice",dateApplied:"",followUp:"",
        resumeLabel:"PM-director-v1",resumeVersions:[],matchJda:68,matchTailoring:71,ats:77,tools:["job-description-analyzer","executive-resume-writer"],
        notes:"Interesting scope but fully onsite. Revisit if the location policy changes.",createdAt:stamp(-26),updatedAt:stamp(-14),updatedBy:"you"},
      j5:{company:"Lumen Analytics",title:"Senior Product Manager, Data Products",jdUrl:"https://example.com/careers/lumen-data-pm",
        location:"Denver, CO",workMode:"Hybrid",salary:"$155k–$180k",datePosted:day(-1),dateFound:day(0),status:"in_works",dateApplied:"",followUp:"",
        resumeLabel:"PM-data-v1",resumeVersions:[],matchJda:87,matchTailoring:null,ats:null,tools:["job-description-analyzer"],
        notes:"Just found. Run tailoring next.",createdAt:stamp(0),updatedAt:stamp(0),updatedBy:"you"},
      j6:{company:"Tidewater Payments",title:"Product Manager, Merchant Onboarding",jdUrl:"https://example.com/careers/tidewater-onboarding",
        location:"Remote (US)",workMode:"Remote",salary:"$150k–$175k",datePosted:day(-40),dateFound:day(-38),status:"not_applying",dateApplied:"",followUp:"",
        resumeLabel:"",resumeVersions:[],matchJda:54,matchTailoring:null,ats:null,tools:["job-description-analyzer"],
        notes:"Skills mismatch: heavy payments-compliance requirement.",createdAt:stamp(-38),updatedAt:stamp(-30),updatedBy:"you"},
      j7:{company:"Kestrel Aerospace Software",title:"Senior Technical Product Manager",jdUrl:"https://example.com/careers/kestrel-tpm",
        location:"Seattle, WA",workMode:"Hybrid",salary:"$170k–$200k",datePosted:day(-21),dateFound:day(-20),status:"applied",dateApplied:day(-18),followUp:day(3),
        resumeLabel:"PM-technical-v2",resumePath:"/Users/you/resume-tailoring/output/PM_Technical_v2.docx",resumeVersions:[],
        matchJda:80,matchTailoring:85,ats:90,tools:["job-description-analyzer","resume-tailoring","resume-ats-optimizer","tech-resume-optimizer"],
        notes:"Phone screen scheduled. Prep: roadmap prioritization example, one stakeholder-conflict story.",createdAt:stamp(-20),updatedAt:stamp(-3),updatedBy:"you"},
      j8:{company:"Harbor & Pine",title:"Product Lead, Marketplace",jdUrl:"https://example.com/careers/harbor-pine-lead",
        location:"New York, NY",workMode:"Hybrid",salary:"$175k–$205k",datePosted:day(-6),dateFound:day(-5),status:"in_works",dateApplied:"",followUp:"",
        resumeLabel:"PM-marketplace-v1",resumeVersions:[],matchJda:73,matchTailoring:74,ats:79,tools:["resume-tailoring","resume-bullet-writer"],
        notes:"Two-sided marketplace experience is the gap. Look for a transferable example.",createdAt:stamp(-5),updatedAt:stamp(-4),updatedBy:"you"}
    };
    const companies={
      c1:{name:"Northwind Labs",url:"https://example.com/northwind",location:"Austin, TX",workMode:"Hybrid",interest:"high",
        notes:"Strong engineering culture, publishes its roadmap. Know two people on the platform team.",createdAt:stamp(-30),updatedAt:stamp(-3),updatedBy:"you"},
      c2:{name:"Brightline Health",url:"https://example.com/brightline",location:"Boston, MA",workMode:"Hybrid",interest:"high",
        notes:"Mission-driven. Recent Series C. Roles to watch: patient app, care-team tools.",createdAt:stamp(-20),updatedAt:stamp(-8),updatedBy:"you"},
      c3:{name:"Copperleaf Software",url:"https://example.com/copperleaf",location:"Remote (US)",workMode:"Remote",interest:"medium",
        notes:"Fully remote, small PM team. Pay band is mid-range.",createdAt:stamp(-15),updatedAt:stamp(-12),updatedBy:"you"},
      c4:{name:"Meridian Freight Tech",url:"https://example.com/meridian",location:"Chicago, IL",workMode:"Onsite",interest:"low",
        notes:"Onsite five days a week.",createdAt:stamp(-26),updatedAt:stamp(-14),updatedBy:"you"},
      c5:{name:"Orchard & Vale",url:"https://example.com/orchard-vale",location:"Portland, OR",workMode:"Remote",interest:"medium",
        notes:"No open PM role yet. Set an alert on the careers page and reach out to the head of product in January.",createdAt:stamp(-10),updatedAt:stamp(-10),updatedBy:"you"}
    };
    return {jobs,companies};
  }

  /* ---------- persistence ---------- */
  function load(){
    try{ const raw=localStorage.getItem(KEY); if(raw){ const d=JSON.parse(raw); if(d&&d.jobs&&d.companies) return d; } }catch(_){}
    const d=seed(); save(d); return d;
  }
  function save(d){ try{ localStorage.setItem(KEY,JSON.stringify(d)); }catch(_){} }

  let data=load();
  const listeners={jobs:new Set(),companies:new Set()};
  const snapshot=name=>({
    docs:Object.entries(data[name]).map(([id,doc])=>({id,data:()=>JSON.parse(JSON.stringify(doc))})),
    metadata:{fromCache:false}
  });
  const emit=name=>listeners[name].forEach(fn=>{ try{ fn(snapshot(name)); }catch(e){ console.error(e); } });
  const uid=()=>Math.random().toString(36).slice(2,10);

  const dbService={
    collection(name){
      if(!listeners[name]) throw Object.assign(new Error("unknown collection"),{code:"not_found"});
      return {
        onSnapshot(next){
          listeners[name].add(next);
          setTimeout(()=>next(snapshot(name)),0);
          return ()=>listeners[name].delete(next);
        },
        async add(doc){ const id="u"+uid(); data[name][id]=doc; save(data); emit(name); return {id}; }
      };
    },
    doc(path){
      const [name,id]=path.split("/");
      return {
        async set(doc){ data[name][id]=doc; save(data); emit(name); },
        async delete(){ delete data[name][id]; save(data); emit(name); }
      };
    }
  };

  /* Uploaded files live in memory for the session (the sample PDFs are static files in /assets). */
  const blobs=new Map();
  const ALLOWED=["application/pdf","text/plain","text/markdown"];
  const assetsService={
    async upload(file,opts={}){
      const type=opts.type||file.type;
      if(!ALLOWED.includes(type)) throw Object.assign(new Error("unsupported"),{code:"unsupported_type"});
      if(file.size>20*1024*1024) throw Object.assign(new Error("too large"),{code:"too_large"});
      const id="local-"+uid();
      blobs.set(id,URL.createObjectURL(new Blob([file],{type})));
      return {id,sizeBytes:file.size};
    }
  };

  window.ledgerBlobUrl=id=>{
    if(blobs.has(id)) return blobs.get(id);
    if(/^sample-/.test(id)) return "assets/"+id+".pdf";
    return "/_blob/"+id;
  };
  window.ledgerResetDemo=()=>{ data=seed(); save(data); blobs.clear(); emit("jobs"); emit("companies"); };
  window.LEDGER_DEMO=true;

  const services={db:dbService,assets:assetsService,user:{async can(){ return true; }}};
  window.claude={use:async name=>services[name]||null};
})();
