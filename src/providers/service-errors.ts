// UI localization belongs to the application. SDK diagnostics remain typed.
import {SDKError} from '@stevelife/speech-generation';
import {SDKError as ImageSDKError} from '@stevelife/image-generation';
export function localized(error: unknown, kind: 'speech'|'image'): Error {
 if(!(error instanceof SDKError)&&!(error instanceof ImageSDKError)){
  // Raw provider errors are not sanitized for display. Keep the UI text generic,
  // but retain the original error on cause and in server logs for diagnosis.
  console.error(`[${kind}] 生成服务出现非 SDK 异常`,error);
  return new Error(kind==='speech'?'语音服务未完成':'图片服务未完成',{cause:error});
 }
 const label=kind==='speech'?'语音':'图片';
 let message:string;
 switch(error.code){
  case 'AUTH':message=`请核对 ${kind==='speech'?'MINIMAX_API_KEY':'OPENAI_API_KEY'} 和${label}认证权限`;break;
  case 'RATE_LIMIT':message=`${label}请求受限，请稍后重试`;break;
  case 'CANCELLED':message=`${label}请求已取消`;break;
  case 'TIMEOUT':message=`${label}请求超时，请手动重试`;break;
  case 'QUEUE_FULL':message=`${label}队列已满，请稍后重试`;break;
  case 'INVALID_INPUT':message=kind==='speech'?'语音内容、音色或格式无效':'图片描述、格式或参考图无效';break;
  case 'INVALID_RESPONSE':message=kind==='speech'?(/large|limit/i.test(error.message)?'语音流响应过大':/aggregate/i.test(error.message)?'语音流汇总音频不一致':'语音返回格式无效，流未完整结束'):'图片/GIF 动图或参考图返回格式无效';break;
  case 'NETWORK':message=`${label}网络连接失败，请检查网络及服务地址`;break;
  default:message=`${label}服务未完成`;break;
 }
 // Provider diagnostics are SDK-authored safe text; retain numeric business codes only.
 const code=error.message.match(/\b\d{3,6}\b/)?.[0];if(code)message+=`（错误码 ${code}）`;
 return new SDKError(error.code,message,{provider:error.provider,taskId:error.taskId,attempt:error.attempt,retryable:error.retryable,requestDisposition:error.requestDisposition,retryAfterMs:error.retryAfterMs});
}
