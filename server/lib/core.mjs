import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const text=value=>String(value??'').trim();
export const number=value=>{const n=Number(String(value??'').replace(/,/g,''));return Number.isFinite(n)?n:0};
export const env=(name,fallback='')=>text(process.env[name]??fallback);
export const enabled=(name,fallback=false)=>/^(1|true|yes|on)$/i.test(env(name,fallback?'true':'false'));
export const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export const nowIso=()=>new Date().toISOString();
export const safeDate=value=>{const d=value?new Date(value):null;return d&&Number.isFinite(d.getTime())?d:null};
export const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export const canonical=value=>text(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/&/g,' and ').replace(/\b(fc|cf|sc|afc|club|the)\b/g,' ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
export const hashKey=value=>{let h=2166136261;for(const c of text(value)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return (h>>>0).toString(16)};
export async function readJson(path,fallback){try{return JSON.parse(await readFile(resolve(path),'utf8'))}catch{return fallback}}
export function json(response,status=200,headers={}){return{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers},body:JSON.stringify(response)}}
export function publicError(error){return text(error?.message||error||'Request failed').replace(/https?:\/\/\S+/gi,'configured upstream').replace(/[A-Za-z0-9_-]{28,}/g,'[redacted]').slice(0,220)}
export async function fetchJson(url,options={},timeoutMs=15000){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(url,{...options,signal:controller.signal});const body=await response.text();
    if(!response.ok)throw new Error(`Upstream returned HTTP ${response.status}`);
    try{return JSON.parse(body)}catch{throw new Error('Upstream returned unreadable JSON')}
  }catch(error){if(error?.name==='AbortError')throw new Error('Upstream request timed out');throw error}finally{clearTimeout(timer)}
}
