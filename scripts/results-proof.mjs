import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const text=value=>String(value??'').trim();
const number=value=>{const parsed=Number(String(value??'').replace(/,/g,''));return Number.isFinite(parsed)?parsed:0};
const safeDate=value=>{if(!value)return null;const date=new Date(value);return Number.isFinite(date.getTime())?date.toISOString():null};
const resultValue=value=>{
  const result=text(value).toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');
  if(['won','winner','win','settled won'].includes(result))return'won';
  if(['lost','lose','loss','settled lost','failed'].includes(result))return'lost';
  if(['void','push','cancelled','canceled','refunded'].includes(result))return'void';
  return'pending';
};
const verificationValue=value=>{
  const status=text(value).toLowerCase().replace(/[_-]+/g,' ');
  if(['verified','source verified','manual verified'].includes(status))return'verified';
  if(['needs review','review','unverified','legacy unverified'].includes(status))return'needs_review';
  return'pending';
};

async function readJson(path,fallback){try{return JSON.parse(await readFile(resolve(path),'utf8'))}catch{return fallback}}
async function writeJson(path,value){const full=resolve(path);const temporary=`${full}.tmp`;await mkdir(dirname(full),{recursive:true});await writeFile(temporary,`${JSON.stringify(value,null,2)}\n`,'utf8');await rename(temporary,full)}
function proofId(row){
  const payload=[text(row.code).toUpperCase(),row.result,row.settled_at||'',Number(row.odds||0).toFixed(2),Math.floor(number(row.selections)),text(row.method),text(row.evidence_url)].join('|');
  return createHash('sha256').update(payload).digest('hex').slice(0,20);
}
function publicEvidence(value){const candidate=text(value);return /^https:\/\//i.test(candidate)?candidate:null}

export async function updateSettlementLedger(feed,options={}){
  const generatedAt=safeDate(feed.generated_at)||new Date().toISOString();
  const ledgerPath=resolve(options.ledgerPath||'data/settlement-ledger.json');
  const summaryPath=resolve(options.summaryPath||'data/results-summary.json');
  const previous=await readJson(ledgerPath,{version:1,updated_at:null,entries:[]});
  const entryMap=new Map((previous.entries||[]).filter(row=>text(row.code)).map(row=>[text(row.code).toUpperCase(),row]));

  for(const item of feed.items||[]){
    const code=text(item.code).toUpperCase();
    if(!code)continue;
    const result=resultValue(item.result||item.status);
    const settlement=item.settlement&&typeof item.settlement==='object'?item.settlement:{};
    const verification=verificationValue(settlement.verification_status);
    const existing=entryMap.get(code);

    if(result!=='pending'&&verification==='verified'){
      const row={
        code,
        title:text(item.title)||existing?.title||'Public code',
        source:text(item.author)||existing?.source||'Public Code Hub',
        result,
        odds:number(item.odds)||number(existing?.odds)||null,
        selections:Math.floor(number(item.selections)||number(existing?.selections))||null,
        settled_at:safeDate(item.settled_at)||safeDate(settlement.verified_at)||existing?.settled_at||generatedAt,
        verified_at:safeDate(settlement.verified_at)||safeDate(item.settled_at)||generatedAt,
        verification_status:'verified',
        method:text(settlement.method)||'source-feed',
        evidence_url:publicEvidence(settlement.evidence_url||item.source_url),
        first_recorded_at:existing?.first_recorded_at||generatedAt,
        last_confirmed_at:generatedAt
      };
      row.proof_id=proofId(row);
      item.settlement={...settlement,verification_status:'verified',method:row.method,verified_at:row.verified_at,evidence_url:row.evidence_url,proof_id:row.proof_id};
      entryMap.set(code,row);
      continue;
    }

    if(result!=='pending'&&verification==='needs_review'&&!existing?.proof_id){
      entryMap.set(code,{
        code,
        title:text(item.title)||existing?.title||'Public code',
        source:text(item.author)||existing?.source||'Public Code Hub',
        result:null,
        odds:number(item.odds)||number(existing?.odds)||null,
        selections:Math.floor(number(item.selections)||number(existing?.selections))||null,
        settled_at:null,
        verified_at:null,
        verification_status:'needs_review',
        method:text(settlement.method)||'manual-override',
        evidence_url:null,
        proof_id:null,
        first_recorded_at:existing?.first_recorded_at||generatedAt,
        last_confirmed_at:generatedAt
      });
    }
  }

  const entries=[...entryMap.values()]
    .map(row=>({...row,verification_status:verificationValue(row.verification_status)}))
    .sort((a,b)=>String(b.verified_at||b.last_confirmed_at||'').localeCompare(String(a.verified_at||a.last_confirmed_at||'')))
    .slice(0,2000);
  const verified=entries.filter(row=>row.verification_status==='verified'&&['won','lost','void'].includes(row.result)&&row.proof_id);
  const needsReview=entries.filter(row=>row.verification_status==='needs_review').length;
  const counts={won:0,lost:0,void:0};
  const methods={};
  for(const row of verified){counts[row.result]=(counts[row.result]||0)+1;methods[row.method]=(methods[row.method]||0)+1}
  const ledger={version:1,updated_at:generatedAt,policy:'Only source-confirmed or explicitly verified manual settlements receive a public proof ID.',entries};
  const summary={
    version:1,
    updated_at:generatedAt,
    verified_total:verified.length,
    verified_won:counts.won||0,
    verified_lost:counts.lost||0,
    verified_void:counts.void||0,
    needs_review:needsReview,
    latest_verified_at:verified[0]?.verified_at||null,
    methods
  };
  await Promise.all([writeJson(ledgerPath,ledger),writeJson(summaryPath,summary)]);
  return{ledger,summary};
}
