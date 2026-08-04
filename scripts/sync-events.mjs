import { writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getUpcomingEvents } from '../server/lib/data-service.mjs';

const output=resolve(process.env.EVENTS_OUTPUT_PATH||'sportybet-events.json');
try{
  const payload=await getUpcomingEvents({force:true,days:Number(process.env.EVENT_DAYS_AHEAD||3)});
  const temporary=`${output}.tmp`;
  await writeFile(temporary,`${JSON.stringify(payload,null,2)}\n`,'utf8');
  await rename(temporary,output);
  console.log(`Published ${payload.count} upcoming events from ${payload.source}.`);
}catch(error){
  console.error(String(error?.message||error||'Event refresh failed'));
  process.exitCode=1;
}
