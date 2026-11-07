import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config.js';
import { createApplication } from '../src/bootstrap.js';
const root=fileURLToPath(new URL('..',import.meta.url));
try {
 const runtime=await createApplication(loadConfig({root}));
 console.log(`每日主题大赛已启动\n操作台：${runtime.server.origin}/control\n舞台：  ${runtime.server.origin}/stage\n仅本机访问，无需登录。首次连接直播间会自动准备采集器。`);
 let closing=false;const stop=async()=>{if(closing)return;closing=true;await runtime.close();process.exit(0);};process.on('SIGINT',stop);process.on('SIGTERM',stop);
} catch(e){console.error(`启动失败：${e.code==='EADDRINUSE'?'端口已被占用，请关闭旧实例或设置 PAINTER_PORT':e.message}`);process.exitCode=1;}
