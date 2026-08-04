import { env, text } from './core.mjs';

const base=()=>env('SUPABASE_URL').replace(/\/+$/,'');
const key=()=>env('SUPABASE_SERVICE_ROLE_KEY');
export const configured=()=>Boolean(base()&&key());
function headers(extra={}){return{apikey:key(),Authorization:`Bearer ${key()}`,'content-type':'application/json',Accept:'application/json',...extra}}
function urlFor(path,query={}){const url=new URL(`${base()}/rest/v1/${path}`);for(const[k,v]of Object.entries(query))if(v!==undefined&&v!==null&&text(v)!=='')url.searchParams.set(k,text(v));return url}
async function request(url,options={}){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),Number(env('SUPABASE_TIMEOUT_MS','10000')));
  try{
    const response=await fetch(url,{...options,signal:controller.signal});const raw=await response.text();
    if(!response.ok)throw new Error(`Database request returned HTTP ${response.status}`);
    if(!raw)return null;try{return JSON.parse(raw)}catch{throw new Error('Database returned unreadable JSON')}
  }catch(error){if(error?.name==='AbortError')throw new Error('Database request timed out');throw error}finally{clearTimeout(timer)}
}
export async function select(table,query={}){if(!configured())return[];return request(urlFor(table,query),{headers:headers()})}
export async function upsert(table,rows,{onConflict='',returning='minimal'}={}){if(!configured())return null;const url=urlFor(table,onConflict?{on_conflict:onConflict}:{});const prefer=[`return=${returning}`,'resolution=merge-duplicates'].join(',');return request(url,{method:'POST',headers:headers({Prefer:prefer}),body:JSON.stringify(Array.isArray(rows)?rows:[rows])})}
export async function insert(table,rows,{returning='representation'}={}){if(!configured())return null;return request(urlFor(table),{method:'POST',headers:headers({Prefer:`return=${returning}`}),body:JSON.stringify(Array.isArray(rows)?rows:[rows])})}
export async function patch(table,query,values){if(!configured())return null;return request(urlFor(table,query),{method:'PATCH',headers:headers({Prefer:'return=representation'}),body:JSON.stringify(values)})}
export async function remove(table,query){if(!configured())return null;return request(urlFor(table,query),{method:'DELETE',headers:headers({Prefer:'return=minimal'})})}

export async function rpc(name,args={}){if(!configured())return null;return request(urlFor(`rpc/${name}`),{method:'POST',headers:headers(),body:JSON.stringify(args)})}
