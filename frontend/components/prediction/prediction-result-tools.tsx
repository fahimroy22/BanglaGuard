"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, getApiErrorMessage } from "@/lib/api";
import type { PredictionRead } from "@/types/prediction";

type Runtime={needs_review?:boolean;prediction_ms?:number;explanation_ms?:number;model_load_ms?:number;explanation_requested?:boolean;model_selection?:string;model_name?:string;model_version?:string;normalized_text?:string;model_input_preview?:string;truncated?:boolean;original_tokens?:number;processed_tokens?:number;maximum_tokens?:number;preview_note?:string};
const ms=(n:number|undefined)=>n==null?"Unavailable":`${n.toFixed(1)} ms`;
export function PredictionResultTools({result, section = "all"}:{result:PredictionRead; section?: "all" | "feedback" | "technical"}){
 const runtime=(result.explanation?.runtime??{}) as Runtime;
 const scores=Object.values(result.probabilities??{}).sort((a,b)=>b-a);
 const needsReview=runtime.needs_review??(result.confidence<.6||scores.length<2||scores[0]-scores[1]<.15);
 const [verdict,setVerdict]=useState("incorrect");const [corrected,setCorrected]=useState("");const [comment,setComment]=useState("");
 const feedback=useMutation({mutationFn:()=>api.post("/feedback",{prediction_id:result.id,verdict,corrected_label:verdict==="incorrect"?corrected:null,comment:comment||null})});
 return <div className="space-y-3 text-sm">
 {section !== "feedback" && <>
 <div className="flex flex-wrap items-center gap-3"><span className={`rounded-full border px-3 py-1 text-xs font-medium ${needsReview?"bg-amber-500/10 text-amber-700 dark:text-amber-300":"bg-muted"}`}>{needsReview?"Needs review":"Review threshold not triggered"}</span><span>{runtime.model_selection==="production_default"?"Production default used":runtime.model_selection==="selected_for_request"?"Model selected for this request":"Saved result model"}: {runtime.model_name??result.model_version_id}{runtime.model_version?` v${runtime.model_version}`:""}</span></div>
 <p className="text-xs text-muted-foreground">Review policy v1: confidence below 60%, a lead below 15 percentage points, or missing class scores. The model’s prediction and scores are retained; this is a review rule, not a correctness guarantee.</p>
 <div className="flex flex-wrap gap-4 text-xs"><span>Prediction: {ms(runtime.prediction_ms)}</span><span>Explanation: {runtime.explanation_requested===false?"Off · 0 ms":ms(runtime.explanation_ms)}</span><span>Model loading: {ms(runtime.model_load_ms)}</span></div>
 <details className="rounded-lg border p-3"><summary className="cursor-pointer font-medium">Input-processing preview {runtime.truncated?"· Truncated":""}</summary><p className="mt-2 text-xs text-muted-foreground">{runtime.original_tokens!=null?`${runtime.processed_tokens} of ${runtime.original_tokens} tokens processed; maximum ${runtime.maximum_tokens}. `:""}{runtime.preview_note}</p><p className="mt-2 text-xs font-medium">Normalized text</p><p className="mt-1 whitespace-pre-wrap break-words">{runtime.normalized_text??result.normalized_text??"Not retained under the text-storage policy."}</p>{runtime.model_input_preview&&<><p className="mt-2 text-xs font-medium">Model input {runtime.truncated?"after truncation":"preview"}</p><p className="mt-1 whitespace-pre-wrap break-words">{runtime.model_input_preview}</p></>}</details>
 </>}
 {section !== "technical" && <details className="rounded-lg border p-3"><summary className="cursor-pointer font-medium">Report result</summary>{feedback.isSuccess?<p role="status" className="mt-3 text-emerald-700">Feedback submitted for review.</p>:<div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs">Verdict<select className="gh-input mt-1 w-full" value={verdict} onChange={e=>setVerdict(e.target.value)}><option value="incorrect">Incorrect</option><option value="correct">Correct</option><option value="unsure">Unsure</option></select></label>{verdict==="incorrect"&&<label className="text-xs">Correct label<select className="gh-input mt-1 w-full" value={corrected} onChange={e=>setCorrected(e.target.value)}><option value="">Choose label</option>{Object.keys(result.probabilities??{}).map(l=><option key={l}>{l}</option>)}</select></label>}<label className="text-xs sm:col-span-2">Notes<textarea className="gh-input mt-1 w-full" value={comment} onChange={e=>setComment(e.target.value)} maxLength={2000}/></label><button className="gh-button" disabled={feedback.isPending||(verdict==="incorrect"&&!corrected)} onClick={()=>feedback.mutate()}>{feedback.isPending?"Submitting…":"Submit feedback"}</button>{feedback.isError&&<p role="alert" className="text-destructive sm:col-span-2">{getApiErrorMessage(feedback.error,"Could not submit feedback.")}</p>}</div>}</details>}
 </div>;
}
