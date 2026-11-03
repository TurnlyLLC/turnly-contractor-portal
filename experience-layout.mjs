const month='(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const stamp='(?:'+month+'\\.?\\s+)?(?:19|20)\\d{2}';
const range=new RegExp('\\b'+stamp+'\\s*(?:[-–—]|to)\\s*(?:'+stamp+'|present|current|now)\\b','i');
const shortHeading=s=>s && s.length<120 && !/^[•●▪*-]|[.!?]$/.test(s) && !range.test(s);
export function jobSections(text){
  const lines=text.split('\n').map(s=>s.trim()).filter(Boolean);
  const starts=[];
  lines.forEach((line,i)=>{
    const date=line.match(range);
    if(!date||line.length>150||/^[•●▪]/.test(line))return;
    const sameLine=line.replace(date[0],'').replace(/^[\s|,–—-]+|[\s|,–—-]+$/g,'').trim();
    const floor=starts.length?starts.at(-1).dateIndex+1:0;
    let start=i;
    if(i>floor&&shortHeading(lines[i-1]))start--;
    if(!sameLine && start>floor && shortHeading(lines[start-1]))start--;
    if(start===i&&!sameLine)return;
    starts.push({start,dateIndex:i,date:date[0],headers:[...lines.slice(start,i),...(sameLine?[sameLine]:[])]});
  });
  if(!starts.length)return [{body:lines}];
  const entries=starts[0].start?[{body:lines.slice(0,starts[0].start)}]:[];
  starts.forEach((job,i)=>entries.push({...job,body:lines.slice(job.dateIndex+1,starts[i+1]?.start)}));
  return entries;
}
function node(tag,text,cls){
  const el=document.createElement(tag);el.textContent=text;if(cls)el.className=cls;return el;
}
export function renderHistory(result){
  const fragment=document.createDocumentFragment();
  const sections=result.title==='Work experience'?jobSections(result.text):[{body:result.text.split('\n')}];
  for(const section of sections){
    const card=node('article','','experience-job');
    if(section.headers){
      card.append(node('h4',section.headers[0]));
      for(const detail of section.headers.slice(1))card.append(node('p',detail,'experience-employer'));
      card.append(node('span',section.date,'experience-date'));
    }
    let list=null,lastBullet=null;
    for(const line of section.body){
      if(!line.trim())continue;
      if(/^[•●▪]\s*|^[-*]\s+/.test(line)){
        if(!list){list=document.createElement('ul');card.append(list);}
        lastBullet=node('li',line.replace(/^(?:[•●▪]\s*|[-*]\s+)/,''));
        list.append(lastBullet);
      }else if(lastBullet && !/[.!?]$/.test(lastBullet.textContent) && /^[a-z]/.test(line)){
        lastBullet.append(' '+line);
      }else{
        list=null;lastBullet=null;card.append(node('p',line));
      }
    }
    fragment.append(card);
  }
  return fragment;
}
