import {SpeechService, MiniMaxProvider, type MiniMaxOptions, type SpeechRequest, type SpeechStream, type CloseOptions} from '@stevelife/speech-generation';
import {localized} from './service-errors.js';
export {VOICE_PRESETS} from '@stevelife/speech-generation';
type Options=Partial<MiniMaxOptions>&{timeoutMs?:number;maxStreamBytes?:number};
type Input=Omit<SpeechRequest,'voice'>&{voiceId?:string;signal?:AbortSignal};
export class MiniMaxSpeech {
 readonly service:SpeechService;
 constructor(options:Options={}) {
  this.service=new SpeechService({providers:[new MiniMaxProvider({...options,apiKey:options.apiKey??'',model:options.model??'speech-2.8-hd',voiceId:options.voiceId??'Chinese_worker_male',maxAudioBytes:options.maxStreamBytes})],concurrency:2,maxPending:8,timeoutMs:options.timeoutMs??60000,maxAudioBytes:options.maxStreamBytes});
 }
 async synthesize(input:Input) {
  try{const result=await this.service.synthesize({text:input.text,voice:input.voiceId},{signal:input.signal});return {...result,bytes:Buffer.from(result.bytes)};}
  catch(error){throw localized(error,'speech');}
 }
 async openStream(input:Input):Promise<SpeechStream> {
  try {
   const stream=await this.service.stream({text:input.text,voice:input.voiceId},{signal:input.signal});
   const completion=stream.completion.catch(error=>{throw localized(error,'speech');});void completion.catch(()=>{});
   const chunks=(async function*(){try{for await(const chunk of stream.chunks)yield chunk;}catch(error){throw localized(error,'speech');}})();
   return {...stream,chunks,completion};
  }catch(error){throw localized(error,'speech');}
 }
 close(options:CloseOptions={mode:'cancel'}){return this.service.close(options);}
}
