"use client";

import { useState } from "react";

type Point = {id:string;characters:number;words:number;label:string;split:string;text:string};
export type EdaVisualization = {points:Point[];total:number;label_splits:Record<string,Record<string,number>>};
const colors = ["#3b82f6", "#14b8a6", "#f59e0b", "#a855f7", "#ef4444", "#ec4899"];
const card = "rounded-xl border border-border bg-card p-4 space-y-3";
const bins = ["0–50", "51–150", "151–300", "301–1000", "1001+"];

export function DatasetEdaCharts({data,lengths}:{data:EdaVisualization;lengths:Record<string,number>}) {
  const [label,setLabel] = useState("");
  const [split,setSplit] = useState("");
  const [log,setLog] = useState(false);
  const [selected,setSelected] = useState<Point|null>(null);
  const labels = Object.keys(data.label_splits).sort();
  const splits = Array.from(new Set(Object.values(data.label_splits).flatMap(v=>Object.keys(v)))).sort();
  const points = data.points.filter(p=>(!label||p.label===label)&&(!split||p.split===split));
  const transform = (n:number)=>log?Math.log10(n+1):n;
  const maxX = Math.max(1,...points.map(p=>p.characters));
  const maxY = Math.max(1,...points.map(p=>p.words));
  const x = (n:number)=>64+transform(n)/transform(maxX)*650;
  const y = (n:number)=>310-transform(n)/transform(maxY)*270;
  const color = (l:string)=>colors[labels.indexOf(l)%colors.length];
  const largestBin = Math.max(1,...Object.values(lengths));
  return <section className="space-y-4" aria-label="Dataset visual exploration">
    <div><h3 className="text-lg font-semibold">Visual exploration</h3><p className="text-sm text-muted-foreground">Explore length patterns, unusual rows, and class balance across splits.</p></div>
    <div className={card}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-semibold">Text length scatter plot</h4><p className="text-sm text-muted-foreground">Each point is one row. Select a point to inspect its text.</p></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={log} onChange={e=>setLog(e.target.checked)}/>Logarithmic axes</label></div>
      <div className="flex flex-wrap gap-3"><label className="text-sm">Label<select className="gh-input ml-2" value={label} onChange={e=>{setLabel(e.target.value);setSelected(null);}}><option value="">All labels</option>{labels.map(l=><option key={l} value={l}>{l||"Missing label"}</option>)}</select></label><label className="text-sm">Split<select className="gh-input ml-2" value={split} onChange={e=>{setSplit(e.target.value);setSelected(null);}}><option value="">All splits</option>{splits.map(s=><option key={s}>{s}</option>)}</select></label></div>
      <div className="overflow-x-auto"><svg viewBox="0 0 760 365" className="w-full min-w-[460px]" role="group" aria-label="Scatter plot: character count on horizontal axis, whitespace-separated word count on vertical axis">
        {[0,.25,.5,.75,1].map(t=>{const vx=log?10**(transform(maxX)*t)-1:maxX*t;const vy=log?10**(transform(maxY)*t)-1:maxY*t;return <g key={t}><line x1="64" x2="714" y1={310-t*270} y2={310-t*270} stroke="currentColor" opacity=".12" strokeDasharray="4 4"/><text x="55" y={314-t*270} textAnchor="end" fill="currentColor" fontSize="11">{Math.round(vy).toLocaleString()}</text><text x={64+t*650} y="330" textAnchor="middle" fill="currentColor" fontSize="11">{Math.round(vx).toLocaleString()}</text></g>;})}
        <text x="390" y="356" textAnchor="middle" fill="currentColor" fontSize="12">Characters{log?" · log scale":""}</text><text transform="translate(15 175) rotate(-90)" textAnchor="middle" fill="currentColor" fontSize="12">Words{log?" · log scale":""}</text>
        {points.map(p=><circle key={p.id} cx={x(p.characters)} cy={y(p.words)} r={selected?.id===p.id?6:4} fill={color(p.label)} fillOpacity=".65" stroke={selected?.id===p.id?"currentColor":"transparent"} tabIndex={0} role="button" aria-label={`${p.id}, ${p.label}, ${p.characters} characters, ${p.words} words`} onClick={()=>setSelected(p)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setSelected(p);}}} className="cursor-pointer focus:outline focus:outline-2"><title>{p.id} · {p.label} · {p.split}: {p.characters} characters, {p.words} words</title></circle>)}
      </svg></div>
      <div className="flex flex-wrap gap-3 text-xs">{labels.map(l=><span key={l} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{background:color(l)}}/>{l||"Missing label"}</span>)}</div>
      <p className="text-xs text-muted-foreground">Showing {points.length.toLocaleString()} filtered points from {data.points.length.toLocaleString()} deterministically sampled rows of {data.total.toLocaleString()}. At most 1,500 rows are plotted; overlapping points may hide each other. Words use whitespace splitting, not model tokenization.</p>
      {!points.length&&<p className="text-sm">No sampled rows match these filters.</p>}
      {selected&&<div className="rounded-lg border border-border bg-muted/40 p-3"><p className="text-sm font-medium">{selected.id} · {selected.label||"Missing label"} · {selected.split}</p><p className="text-xs text-muted-foreground">{selected.characters.toLocaleString()} characters · {selected.words.toLocaleString()} words</p><p className="mt-2 break-words text-sm">{selected.text}{selected.characters>300?"…":""}</p></div>}
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <div className={card}><h4 className="font-semibold">Text length distribution</h4><p className="text-sm text-muted-foreground">Row counts in character-length ranges · all rows</p><svg viewBox="0 0 500 290" className="w-full" role="img" aria-label="Character length distribution column chart">
        {[0,.5,1].map(t=><g key={t}><line x1="55" x2="480" y1={235-t*190} y2={235-t*190} stroke="currentColor" opacity=".12"/><text x="48" y={239-t*190} textAnchor="end" fill="currentColor" fontSize="11">{Math.round(largestBin*t).toLocaleString()}</text></g>)}
        {bins.map((b,i)=>{const n=lengths[b]||0;const h=n/largestBin*190;return <g key={b}><rect x={70+i*82} y={235-h} width="48" height={h} rx="4" fill="#3b82f6"><title>{b} characters: {n.toLocaleString()} rows</title></rect><text x={94+i*82} y={227-h} textAnchor="middle" fill="currentColor" fontSize="11">{n.toLocaleString()}</text><text x={94+i*82} y="257" textAnchor="middle" fill="currentColor" fontSize="11">{b}</text></g>;})}<text x="270" y="283" textAnchor="middle" fill="currentColor" fontSize="11">Characters · unequal-width ranges</text>
      </svg></div>
      <div className={card}><h4 className="font-semibold">Class balance by split</h4><p className="text-sm text-muted-foreground">Each bar represents 100% of a split. Counts include every row.</p>{splits.map(s=>{const total=labels.reduce((n,l)=>n+(data.label_splits[l][s]||0),0);return <div key={s}><p className="mb-2 flex justify-between text-sm"><span>{s}</span><span>{total.toLocaleString()} rows</span></p><div className="flex h-8 overflow-hidden rounded-md bg-muted" role="img" aria-label={`${s}: ${labels.map(l=>`${l||'Missing label'} ${data.label_splits[l][s]||0}`).join(', ')}`}>{labels.map(l=>{const n=data.label_splits[l][s]||0;return <div key={l} style={{width:`${total?n/total*100:0}%`,background:color(l)}} title={`${l||"Missing label"}: ${n} (${total?(n/total*100).toFixed(1):0}%)`}/>;})}</div></div>;})}<div className="overflow-auto"><table className="w-full text-left text-xs"><caption className="sr-only">Exact label counts by split</caption><thead><tr><th className="py-2">Label</th>{splits.map(s=><th key={s}>{s}</th>)}</tr></thead><tbody>{labels.map(l=><tr key={l}><th className="py-2 font-normal"><span style={{color:color(l)}}>●</span> {l||"Missing label"}</th>{splits.map(s=><td key={s}>{(data.label_splits[l][s]||0).toLocaleString()}</td>)}</tr>)}</tbody></table></div></div>
    </div>
  </section>;
}
