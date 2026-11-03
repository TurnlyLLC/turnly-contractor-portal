import {renderHistory} from './experience-layout.mjs';
const workHeading = /^(?:(?:relevant|related|professional|employment|work|career|cleaning|previous)\s+)*(?:experience|history|employment|positions)(?:\s+history)?\s*:?$/i;
const nextHeading = /^(?:education(?: and training)?|skills(?: and abilities)?|certifications(?: and licenses)?|licenses|languages|references|awards|additional information|projects)\s*:?$/i;
export function extractHistory(lines) {
  const start = lines.findIndex(line => workHeading.test(line));
  if (start >= 0) {
    const history = lines.slice(start + 1);
    const stop = history.findIndex(line => nextHeading.test(line));
    const text = history.slice(0, stop < 0 ? undefined : stop).filter(line=>!workHeading.test(line)).join('\n').trim();
    if (text) return {title:'Work experience',text};
  }
  return {title:'Résumé text · no separate work history heading found',text:lines.join('\n').trim()};
}
async function readResume(url) {
  const pdfjs = await import('./vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.min.mjs',import.meta.url).href;
  const loading = pdfjs.getDocument({url,isEvalSupported:false});
  try {
    const doc = await loading.promise;
    const lines=[];
    for(let n=1;n<=doc.numPages;n++){
      const page=await doc.getPage(n);
      const {items}=await page.getTextContent();
      let line='';
      for(const item of items){
        if(typeof item.str!=='string') continue;
        line += item.str+' ';
        if(item.hasEOL){if(line.trim()) lines.push(line.trim());line='';}
      }
      if(line.trim()) lines.push(line.trim());
      page.cleanup();
    }
    return extractHistory(lines);
  } finally { await loading.destroy(); }
}
const cache=new Map();
export function addExperienceTab(body,a,api) {
  const review=document.createElement('section');
  review.append(...body.childNodes);
  const experience=document.createElement('section');
  experience.hidden=true;
  const heading=document.createElement('h2');
  heading.textContent=a.name;
  const label=document.createElement('h3');
  label.textContent='Résumé experience';
  const content=document.createElement('div');
  content.className='resume-history';
  content.setAttribute('role','status');
  experience.append(heading,label,content);
  if(a.answers?.experience_details){
    const title=document.createElement('h3'),answer=document.createElement('p');
    title.textContent='Experience reported on the application';
    answer.textContent=a.answers.experience_details;
    const details=document.createElement('details'),summary=document.createElement('summary');
    summary.textContent=title.textContent;details.className='experience-application';
    details.append(summary,answer);experience.append(details);
  }
  const nav=document.createElement('div');
  nav.className='candidate-tabs';
  const overview=document.createElement('button'),tab=document.createElement('button');
  overview.textContent='Overview';tab.textContent='Experience';
  const select=show=>{
    review.hidden=show;experience.hidden=!show;
    overview.setAttribute('aria-pressed',String(!show));tab.setAttribute('aria-pressed',String(show));
  };
  overview.onclick=()=>select(false);
  tab.onclick=async()=>{
    select(true);
    if(!a.resume_path){content.textContent='No résumé attached.';return;}
    const key=a.id+'|'+a.resume_path;
    content.textContent='Reading résumé…';
    try {
      if(!cache.has(key)){
        if(cache.size>=20)cache.delete(cache.keys().next().value);
        cache.set(key,api('resume',{id:a.id}).then(r=>readResume(r.url)));
      }
      const result=await cache.get(key);
      label.textContent=result.text?result.title:'Résumé experience';
      if(result.text)content.replaceChildren(renderHistory(result));
      else content.textContent='This résumé has no readable text. Use Download resume in Overview to view the original.';
    } catch {cache.delete(key);content.textContent='Could not read this résumé. Select Experience to retry, or use Download resume in Overview.';}
  };
  nav.append(overview,tab);body.replaceChildren(nav,review,experience);select(false);
}
