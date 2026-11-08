import {ImageService, OpenAICompatibleImageProvider, type ImageRequest, type OpenAICompatibleImageOptions, type CloseOptions, SDKError} from '@stevelife/image-generation';
import {buildArtPrompt} from '../art-direction.js';
import {localized} from './service-errors.js';
type Options = OpenAICompatibleImageOptions & {timeoutMs?:number};
type Input = ImageRequest & {signal?:AbortSignal;originalText?:string;theme?:string;style?:string;artDirected?:boolean};
export class OpenAIImage {
 readonly service:ImageService;
 private readonly format: ImageRequest['format'];
 constructor(options:Options={}) {
  this.format=options.format??'png';
  this.service=new ImageService({providers:[new OpenAICompatibleImageProvider({...options,model:options.model??'gpt-image-2.6-flare',capabilities:{...options.capabilities,gif:true,references:true}})],concurrency:1,maxPending:8,timeoutMs:options.timeoutMs??120000});
 }
 async generate(input:Input) {
  try {
   const format=input.format??this.format;
   if(format!=='png'&&format!=='gif')throw new SDKError('INVALID_INPUT','Unsupported image format');
   const prompt=input.artDirected===true?input.prompt:buildArtPrompt({...input,format});
   const result=await this.service.generate({prompt,format,references:input.references},{signal:input.signal});
   return {bytes:result.bytes,mime:result.mime,...(result.mime==='image/gif'?{info:result.info}:result.info?.referenceCount?{info:{referenceCount:result.info.referenceCount}}:{})};
  }
  catch(error){throw localized(error,'image');}
 }
 close(options:CloseOptions={mode:'cancel'}){return this.service.close(options);}
}
