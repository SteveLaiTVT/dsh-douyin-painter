import {randomBytes,timingSafeEqual} from 'node:crypto';
import {id,requireThat} from './util.js';
const secret=()=>randomBytes(32).toString('base64url');
const eq=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export class Auth{
 constructor(port,clock=()=>performance.now()){this.host=`127.0.0.1:${port}`;this.origin=`http://${this.host}`;this.clock=clock;this.oneTime=secret();this.expires=clock()+300000;this.sessions=new Map();}
 source(h,write=false){requireThat(h.host===this.host,'forbidden');requireThat(write?h.origin===this.origin:(!h.origin||h.origin===this.origin),'forbidden');}
 exchange(h,token){this.source(h,true);requireThat(this.oneTime&&this.clock()<this.expires&&eq(this.oneTime,token),'forbidden');this.oneTime=null;const session={token:secret(),csrf:secret(),binding:secret(),operator:id()};this.sessions.set(session.token,session);return {token:session.token,csrf:session.csrf,operator:session.operator,cookie:`painter=${session.binding}; HttpOnly; SameSite=Strict; Path=/api/`};}
 authorize(h,method='GET'){this.source(h,method!=='GET');const token=h.authorization?.match(/^Bearer ([\w-]+)$/)?.[1];const s=this.sessions.get(token);requireThat(s,'forbidden');if(method!=='GET'){requireThat(eq(h['x-csrf-token'],s.csrf)&&h.cookie?.split(/;\s*/).some(c=>eq(c,`painter=${s.binding}`)),'forbidden');}return s;}
 logout(h){const s=this.authorize(h,'POST');this.sessions.delete(s.token);}
 close(){this.oneTime=null;this.sessions.clear();}
}
