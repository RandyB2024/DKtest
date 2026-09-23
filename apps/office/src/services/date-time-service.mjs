const zone='Europe/Amsterdam';
export class DateTimeService {
  constructor(now=()=>new Date()){this.nowProvider=now}
  now(){return this.nowProvider()}
  iso(){return this.now().toISOString()}
  date(){const p=Object.fromEntries(new Intl.DateTimeFormat('nl-NL',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(this.now()).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}`}
  formatDate(value=this.now()){return new Intl.DateTimeFormat('nl-NL',{timeZone:zone,day:'numeric',month:'long',year:'numeric'}).format(new Date(value))}
  formatDateTime(value=this.now()){return `${this.formatDate(value)} · ${new Intl.DateTimeFormat('nl-NL',{timeZone:zone,hour:'2-digit',minute:'2-digit'}).format(new Date(value))}`}
  greeting(){const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',hour12:false}).format(this.now()));return hour<12?'Goedemorgen':hour<18?'Goedemiddag':'Goedenavond'}
  year(){return Number(new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric'}).format(this.now()))}
  month(){return Number(new Intl.DateTimeFormat('en-GB',{timeZone:zone,month:'numeric'}).format(this.now()))}
  quarter(){return Math.ceil(this.month()/3)}
  startOfYear(){return `${this.year()}-01-01`}
  ageInDays(dueDate){const today=new Date(`${this.date()}T12:00:00Z`),due=new Date(`${dueDate}T12:00:00Z`);return Math.max(0,Math.floor((today-due)/86400000))}
  agingBucket(dueDate){const d=this.ageInDays(dueDate);return d===0?'Niet vervallen':d<=30?'1–30 dagen':d<=60?'31–60 dagen':d<=90?'61–90 dagen':'Meer dan 90 dagen'}
  addDays(days){const d=this.now();d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
}
export const dateTime=new DateTimeService();
