import { Application } from './app.js';
import { LocalServer } from './server.js';
import { Capture } from './capture.js';
import { DeepSeekText } from './providers/deepseek.js';
import { OpenAIImage } from './providers/openai.js';
import { MiniMaxSpeech, VOICE_PRESETS } from './providers/minimax.js';
export async function createApplication(config,{text,image,speech,capture}={}) {
  const app=await new Application({
    dataDir:config.dataDir,
    config:{deepseek:!!(text||config.deepseekKey),openai:!!(image||config.openaiKey),minimax:!!(speech||config.minimaxKey),voicePresets:VOICE_PRESETS,defaultVoiceId:config.voiceId,outputFormat:config.outputFormat||'gif'},
    text:text||new DeepSeekText({apiKey:config.deepseekKey,baseUrl:config.deepseekBaseUrl,model:config.deepseekModel}),
    image:image||new OpenAIImage({apiKey:config.openaiKey,baseUrl:config.openaiBaseUrl,model:config.imageModel,format:config.outputFormat||'gif'}),
    speech:speech||new MiniMaxSpeech({apiKey:config.minimaxKey,baseUrl:config.minimaxBaseUrl,model:config.speechModel,voiceId:config.voiceId}),
    capture:capture||new Capture({binary:config.captureBinary,cookie:config.cookie}),
  }).open();
  const server=new LocalServer({app});
  try{await server.start(config.port);}catch(e){await app.close();throw e;}
  return {app,server,async close(){await server.close();await app.close();}};
}
