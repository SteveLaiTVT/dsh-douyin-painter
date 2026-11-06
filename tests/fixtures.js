import omggif from 'omggif';import {deflateSync} from 'node:zlib';
function crc(b){let c=-1;for(const x of b){c^=x;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^-1)>>>0;}
function chunk(t,b){const x=Buffer.concat([Buffer.from(t),b]);const n=Buffer.alloc(4),z=Buffer.alloc(4);n.writeUInt32BE(b.length);z.writeUInt32BE(crc(x));return Buffer.concat([n,x,z]);}
export function png(w=1,h=1){const ih=Buffer.alloc(13);ih.writeUInt32BE(w);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',ih),chunk('IDAT',deflateSync(Buffer.alloc((w*4+1)*h,0))),chunk('IEND',Buffer.alloc(0))]);}
export function gif(frames=6,w=2,h=2,delay=20){const b=Buffer.alloc(10000);const writer=new omggif.GifWriter(b,w,h,{palette:[0x000000,0xffffff],loop:0});for(let i=0;i<frames;i++)writer.addFrame(0,0,w,h,new Uint8Array(w*h).fill(i%2),{delay,disposal:1});return b.subarray(0,writer.end());}
