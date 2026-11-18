// Portable SHA-256 for HTTP LAN browsers, where SubtleCrypto is unavailable.
export function digest256(input:Uint8Array){
 const primes:number[]=[];for(let n=2;primes.length<64;n++)if(!primes.some(p=>p*p<=n&&n%p===0))primes.push(n);
 const h=primes.slice(0,8).map(p=>(Math.sqrt(p)%1*4294967296)|0),k=primes.map(p=>(Math.cbrt(p)%1*4294967296)|0);
 const bytes=new Uint8Array(Math.ceil((input.length+9)/64)*64);bytes.set(input);bytes[input.length]=128;const view=new DataView(bytes.buffer);view.setUint32(bytes.length-8,Math.floor(input.length/536870912));view.setUint32(bytes.length-4,input.length*8>>>0);
 const r=(v:number,n:number)=>(v>>>n)|(v<<(32-n)),w=new Int32Array(64);
 for(let off=0;off<bytes.length;off+=64){for(let i=0;i<16;i++)w[i]=view.getInt32(off+i*4);for(let i=16;i<64;i++){const a=w[i-15],b=w[i-2];w[i]=(w[i-16]+(r(a,7)^r(a,18)^(a>>>3))+w[i-7]+(r(b,17)^r(b,19)^(b>>>10)))|0;}let[a,b,c,d,e,f,g,j]=h;for(let i=0;i<64;i++){const t=(j+(r(e,6)^r(e,11)^r(e,25))+((e&f)^(~e&g))+k[i]+w[i])|0,u=((r(a,2)^r(a,13)^r(a,22))+((a&b)^(a&c)^(b&c)))|0;j=g;g=f;f=e;e=(d+t)|0;d=c;c=b;b=a;a=(t+u)|0;}[a,b,c,d,e,f,g,j].forEach((v,i)=>h[i]=(h[i]+v)|0);}
 return h.map(v=>(v>>>0).toString(16).padStart(8,'0')).join('');
}
