import {endpoint, requestJson} from './http.js';
export interface ClientOptions { apiKey?: string; baseUrl?: string; model?: string; fetchImpl?: typeof fetch; timeoutMs?: number }
export class JsonTextClient {
 constructor(private readonly options: ClientOptions = {}) {}
 async complete(instruction: string, payload: unknown, signal?: AbortSignal, {maxTokens=2500,timeoutMs=this.options.timeoutMs??30000}={}) : Promise<Record<string, unknown>> {
  const result = await requestJson({url:endpoint(this.options.baseUrl??'https://api.deepseek.com','chat/completions'),apiKey:this.options.apiKey,keyName:'DEEPSEEK_API_KEY',label:'DeepSeek',fetchImpl:this.options.fetchImpl??fetch,timeoutMs,signal,body:{model:this.options.model??'deepseek-flash',thinking:{type:'disabled'},stream:false,max_tokens:maxTokens,response_format:{type:'json_object'},messages:[{role:'system',content:instruction},{role:'user',content:JSON.stringify(payload)}]}});
  if(result.choices?.[0]?.finish_reason==='length')throw Error('DeepSeek 返回内容未完成，请缩短输入后重试');
  try {const parsed: unknown=JSON.parse(result.choices?.[0]?.message?.content);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error();return parsed as Record<string,unknown>;}catch{throw Error('DeepSeek 返回格式无效，请重试');}
 }
}
