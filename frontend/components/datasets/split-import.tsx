"use client";
import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { api, getApiErrorMessage } from "@/lib/api";
import type { DatasetVersionRead } from "@/types/dataset-management";

export function SplitImport() {
  const cache = useQueryClient();
  const [files, setFiles] = useState<Record<string, File | null>>({train:null, validation:null, test:null});
  const [name, setName] = useState("SentNoB");
  const [version, setVersion] = useState("1.0.0");
  const [task, setTask] = useState("sentiment");
  const [textColumn, setTextColumn] = useState("Data");
  const [labelColumn, setLabelColumn] = useState("Label");
  const [mapping, setMapping] = useState('{"0":"neutral","1":"positive","2":"negative"}');
  const [source, setSource] = useState("SentNoB");
  const [url, setUrl] = useState("https://github.com/KhondokerIslam/SentNoB");
  const [license, setLicense] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DatasetVersionRead | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();setError("");
    const data = new FormData();
    for(const key of ["train", "validation", "test"]) { const file=files[key];if(!file){setError("Select all three CSV files.");return;}if(file.size > 50*1024*1024){setError("Each CSV must be 50 MB or smaller.");return;}data.append(key,file); }
    if(new Set(Object.values(files)).size !== 3){setError("Choose a different CSV for each split.");return;}
    try {const parsed=JSON.parse(mapping);if(!parsed || Array.isArray(parsed) || typeof parsed!=="object") throw Error();}catch {setError("Enter a valid JSON label mapping, or {} to keep existing labels.");return;}
    for(const [key,value] of Object.entries({name,version,task,text_column:textColumn,label_column:labelColumn,label_mapping:mapping,source_name:source,source_url:url,license_name:license})) if(value) data.append(key,value);
    setBusy(true);
    try {const response=await api.post<DatasetVersionRead>("/datasets/import-splits",data,{timeout:0});setResult(response.data);await cache.invalidateQueries({queryKey:["datasets"]});}
    catch(e){setError(getApiErrorMessage(e));}finally{setBusy(false);}
  }
  const overlaps = result?.preprocessing_config?.overlapping_text_counts;
  const overlapEntries = overlaps && typeof overlaps === "object" ? Object.entries(overlaps).filter(([, count]) => typeof count === "number" && count > 0) : [];
  if(result) return <section className="mx-auto max-w-[1400px] p-5"><h1 className="text-2xl font-semibold">Dataset splits imported</h1><p className="mt-2 text-sm">{result.name} · {result.total_samples.toLocaleString()} rows</p><div className="my-4 grid grid-cols-3 gap-3">{[["Training",result.train_samples],["Validation",result.validation_samples],["Test",result.test_samples]].map(([label,count])=><div key={label} className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-semibold">{count.toLocaleString()}</p></div>)}</div><p className="mb-4 text-sm text-muted-foreground">Original splits were preserved. Review Quality before starting training; no duplicate or noisy rows were automatically removed.</p>{overlapEntries.length > 0 ? <div role="status" className="mb-4 rounded-xl border border-border bg-card p-4 text-sm"><p className="font-semibold">Repeated text across splits</p><p className="mt-1">{overlapEntries.map(([pair, count]) => `${pair.replaceAll("_", " / ")}: ${count}`).join(" · ")}</p><p className="mt-1 text-muted-foreground">Shared texts can inflate evaluation scores. Original splits are preserved; review this overlap when reporting research results.</p></div> : null}<Link className="gh-button gh-button-primary" href={`/datasets/${result.id}`}>Review dataset</Link></section>;
  return <form onSubmit={submit} className="mx-auto max-w-[1400px] space-y-4 p-5"><header><h1 className="text-2xl font-semibold">Import existing dataset splits</h1><p className="mt-1 text-sm text-muted-foreground">Extract the ZIP first, then select Train.csv, Val.csv, and Test.csv. Rows stay in their original splits.</p></header><fieldset disabled={busy} className="space-y-4">
    <div className="grid gap-3 md:grid-cols-3">{[["train","Training CSV"],["validation","Validation CSV"],["test","Test CSV"]].map(([key,label])=><label key={key} className="rounded-xl border border-border bg-card p-4 text-sm font-medium">{label}<input required type="file" accept=".csv,text/csv" className="mt-3 block w-full min-w-0 text-xs" onChange={(e)=>setFiles({...files,[key]:e.target.files?.[0]??null})} /></label>)}</div>
    <section className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-2">
      {[["Dataset name",name,setName],["Version",version,setVersion],["Text column",textColumn,setTextColumn],["Label column",labelColumn,setLabelColumn],["Source name",source,setSource],["Source URL",url,setUrl],["License (if known)",license,setLicense]].map(([label,value,setter])=><label className="text-sm" key={label as string}>{label as string}<input className="gh-input mt-1" value={value as string} required={["Dataset name","Version","Text column","Label column"].includes(label as string)} onChange={(e)=>(setter as (value:string)=>void)(e.target.value)} /></label>)}
      <label className="text-sm">Task<select className="gh-input mt-1" value={task} onChange={(e)=>setTask(e.target.value)}><option value="sentiment">Sentiment</option><option value="hate_speech">Hate speech</option></select></label>
      <label className="text-sm md:col-span-2">Label mapping<textarea className="gh-input mt-1 font-mono" rows={2} value={mapping} onChange={(e)=>setMapping(e.target.value)} /><span className="mt-1 block text-xs text-muted-foreground">SentNoB preset: 0 → neutral, 1 → positive, 2 → negative. Use {'{}'} to preserve text labels from another dataset.</span></label>
    </section>
    <button type="submit" className="gh-button gh-button-primary">{busy?"Importing…":"Import and preserve splits"}</button>
    </fieldset>{error?<p role="alert" className="text-sm text-destructive">{error}</p>:null}</form>;
}
