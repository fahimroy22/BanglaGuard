"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, getApiErrorMessage } from "@/lib/api";
import { DEFAULT_CLASSICAL_TRAINING_REQUEST, DEFAULT_TRANSFORMER_TRAINING_REQUEST } from "@/types/experiment-management";
import type { ClassicalTrainingRequest, TransformerTrainingRequest } from "@/types/experiment-management";

type Configuration = ClassicalTrainingRequest | TransformerTrainingRequest;
export type Preflight = {ready:boolean;device:string;checks:{name:string;status:string;detail:string}[];readiness:Record<string,unknown>|null};
const card="rounded-xl border border-border bg-card p-4 space-y-3";
function flatten(value:unknown,prefix=""):Record<string,string> {
  if(value&&typeof value==='object'&&!Array.isArray(value)) return Object.assign({},...Object.entries(value).map(([k,v])=>flatten(v,prefix?`${prefix}.${k}`:k)));
  return {[prefix]:value==null?'Not set':String(value)};
}
export function ExperimentSetupTools({configuration,onApply,duplicateId,preflight,datasetName}:{configuration:Configuration;onApply:(v:Configuration)=>void;duplicateId:string|null;preflight:Preflight|null;datasetName:string}) {
  const [baseline,setBaseline]=useState<Configuration|null>(null);
  const [baselineName,setBaselineName]=useState("");
  const [presetName,setPresetName]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const presets=useQuery({queryKey:['experiment-presets'],queryFn:async()=>(await api.get<{id:string;name:string;payload:Configuration}[]>('/experiment-research/presets')).data,retry:false});
  const original=useQuery({queryKey:['duplicate-experiment',duplicateId],enabled:!!duplicateId,queryFn:async()=>(await api.get<{payload:Configuration;name:string}>(`/experiment-research/${duplicateId}/duplicate`)).data,retry:false});
  const previous=baseline?flatten(baseline):{};
  const current=flatten(configuration);
  const differences=baseline?Array.from(new Set([...Object.keys(previous),...Object.keys(current)])).filter(k=>previous[k]!==current[k]):[];
  function apply(value:Configuration,name:string,isDuplicate=false){
    const next={...structuredClone(value),dataset_version_id:isDuplicate?value.dataset_version_id:configuration.dataset_version_id,experiment_name:isDuplicate?`${value.experiment_name} (copy)`:configuration.experiment_name};
    setBaseline(structuredClone(value));setBaselineName(name);onApply(next);setMessage(`Loaded ${name}. Check preflight after making changes.`);
  }
  const transformer=configuration.model_family==='banglabert_sequence_classification';
  const evaluation=transformer?(configuration as TransformerTrainingRequest).evaluation:null;
  return <section className="my-5 space-y-4" aria-label="Reproducible experiment setup">
    <div className={card}><h2 className="font-semibold">Start from a saved configuration</h2><div className="flex flex-wrap gap-2"><button type="button" className="gh-button" onClick={()=>apply(DEFAULT_CLASSICAL_TRAINING_REQUEST,'Classical baseline')}>Classical baseline</button><button type="button" className="gh-button" onClick={()=>apply(DEFAULT_TRANSFORMER_TRAINING_REQUEST,'BanglaBERT baseline')}>BanglaBERT baseline</button>{original.data&&<button type="button" className="gh-button gh-button-primary" onClick={()=>apply(original.data.payload,original.data.name,true)}>Load copy of {original.data.name}</button>}</div>
      {duplicateId&&original.isPending&&<p>Loading original configuration…</p>}{original.error&&<p role="alert" className="text-destructive">{getApiErrorMessage(original.error)}</p>}
      <div className="flex flex-wrap items-end gap-3"><label className="text-sm">Your named presets<select className="gh-input mt-1 block" value="" onChange={e=>{const selected=presets.data?.find(p=>p.id===e.target.value);if(selected)apply(selected.payload,selected.name);}}><option value="">Choose a preset</option>{presets.data?.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label className="text-sm">Save current settings as<input className="gh-input mt-1 block" maxLength={100} value={presetName} onChange={e=>setPresetName(e.target.value)} placeholder="e.g. BanglaBERT short texts"/></label><button type="button" className="gh-button" disabled={busy||presetName.trim().length<2} onClick={async()=>{setBusy(true);try{await api.post('/experiment-research/presets',{name:presetName,configuration});await presets.refetch();setPresetName('');setMessage('Preset saved to your account.');}catch(e){setMessage(getApiErrorMessage(e));}finally{setBusy(false);}}}>{busy?'Saving…':'Save preset'}</button></div>{presets.error&&<p className="text-destructive">{getApiErrorMessage(presets.error)}</p>}{message&&<p role="status" className="text-sm text-muted-foreground">{message}</p>}
    </div>
    <div className={card}><h2 className="font-semibold">Research question and notes</h2><label className="block text-sm">What does this experiment test?<textarea className="gh-input mt-1 w-full" maxLength={3000} rows={2} value={configuration.research_question??''} onChange={e=>onApply({...configuration,research_question:e.target.value})} placeholder="Does character-level input improve performance on spelling variations?"/></label><label className="block text-sm">Method and expected outcome<textarea className="gh-input mt-1 w-full" maxLength={10000} rows={2} value={configuration.research_notes??''} onChange={e=>onApply({...configuration,research_notes:e.target.value})}/></label></div>
    {baseline&&<details className={card} open><summary className="cursor-pointer font-semibold">Configuration differences from {baselineName} · {differences.length}</summary><div className="max-h-72 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>Setting</th><th>Original</th><th>New run</th></tr></thead><tbody>{differences.map(k=><tr key={k} className="border-t border-border"><td className="p-2">{k.replaceAll('_',' ')}</td><td className="max-w-72 break-words p-2">{previous[k]??'Not set'}</td><td className="max-w-72 break-words p-2">{current[k]??'Not set'}</td></tr>)}</tbody></table>{!differences.length&&<p>No settings changed.</p>}</div></details>}
    <div className={card}><h2 className="font-semibold">Run summary</h2><p className="text-sm">Train {transformer?'BanglaBERT':'TF-IDF with logistic regression'} using {datasetName||'the selected dataset'}. {evaluation?.load_best_model_at_end?`Select the best checkpoint using validation ${evaluation.metric_for_best_model.replaceAll('_',' ')}.`:transformer?'Use the final checkpoint; validation does not select the checkpoint with these settings.':'Use validation results to compare configurations.'} Reserve the test split for final evaluation.</p><p className="text-xs text-muted-foreground">Tune using validation results. This run evaluates the test split after training; do not use repeated test scores to choose settings. Seed, dataset file checksums, code revision, package versions and device are recorded when the worker starts.</p></div>
    {preflight&&<div className={card}><h2 className="font-semibold">Preflight checks</h2>{preflight.checks.map((c,i)=><div key={i} className="flex gap-3 border-t border-border pt-3"><span className={c.status==='blocked'?'text-destructive':c.status==='warning'?'text-amber-600':'text-emerald-600'}>{c.status==='passed'?'✓':c.status==='blocked'?'✕':'!'}</span><div><p className="text-sm font-medium">{c.name} · {c.status}</p><p className="text-sm text-muted-foreground">{c.detail}</p></div></div>)}</div>}
  </section>;
}
