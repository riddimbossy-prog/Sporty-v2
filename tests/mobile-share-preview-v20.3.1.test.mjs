import fs from 'node:fs';
const css=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const required=[
  'v20.3.1 — phone portrait share preview repair',
  '@media (max-width:599px) and (orientation:portrait)',
  'width:min(100%,360px)!important',
  'height:auto!important',
  'overflow-y:auto',
  'position:sticky'
];
for(const text of required){
  if(!css.includes(text)) throw new Error(`Missing mobile share fix: ${text}`);
}
console.log('v21.0.0 mobile share preview checks passed');
