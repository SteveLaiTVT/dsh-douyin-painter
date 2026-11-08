import {endpoint, requestJson} from './http.js';
import type {ClientOptions} from './text.js';
export interface TranscriptionInput {bytes: Uint8Array; filename?: string; mime?: string; language?: string; signal?: AbortSignal}
/** File transcription; no microphone capture or automatic paid retries. */
export class OpenAITranscription {
 constructor(private readonly options: ClientOptions={}){}
 async transcribe({bytes,filename='audio.wav',mime='audio/wav',language,signal}:TranscriptionInput):Promise<{text:string}>{
  if(!bytes.length||bytes.length>25*1024*1024)throw Error('音频不能为空，且不得超过25MB');
  if(signal?.aborted)throw Error('语音识别请求已取消');
  const form=new FormData();form.set('file',new Blob([new Uint8Array(bytes)],{type:mime}),filename);form.set('model',this.options.model??'gpt-transcribe');if(language)form.set('language',language);
  const result=await requestJson({url:endpoint(this.options.baseUrl??'https://api.openai.com/v1','audio/transcriptions'),apiKey:this.options.apiKey,keyName:'OPENAI_API_KEY',label:'语音识别',body:form,fetchImpl:this.options.fetchImpl??fetch,timeoutMs:this.options.timeoutMs??60000,signal});
  if(typeof result.text!=='string')throw Error('语音识别返回格式无效');return {text:result.text};
 }
}
