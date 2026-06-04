(function(){"use strict";const P=["rgb(60, 20, 80)","rgb(100, 40, 60)","rgb(20, 20, 40)","rgb(40, 40, 90)"],H=`
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`,ve=`
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTexture;
uniform vec2 uTexelSize;
uniform float uOffset;
void main() {
  vec2 ofs = uTexelSize * uOffset;
  vec4 s  = texture2D(uTexture, vUv + vec2(-ofs.x, -ofs.y));
       s += texture2D(uTexture, vUv + vec2( ofs.x, -ofs.y));
       s += texture2D(uTexture, vUv + vec2(-ofs.x,  ofs.y));
       s += texture2D(uTexture, vUv + vec2( ofs.x,  ofs.y));
  gl_FragColor = s * 0.25;
}
`,_e=`
precision highp float;
varying vec2 vUv;

uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform float uMix;
uniform vec2 uResolution;
uniform float uTime;

// iq gradient noise
vec2 hash(vec2 p) {
  p = vec2(dot(p, vec2(2127.1, 81.17)), dot(p, vec2(1269.5, 283.37)));
  return fract(sin(p) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float n = mix(
    mix(dot(-1.0 + 2.0 * hash(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
        dot(-1.0 + 2.0 * hash(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
    mix(dot(-1.0 + 2.0 * hash(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
        dot(-1.0 + 2.0 * hash(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
    u.y);
  return 0.5 + 0.5 * n;
}

mat2 Rot(float a) {
  float s = sin(a);
  float c = cos(a);
  return mat2(c, -s, s, c);
}

void main() {
  vec2 uv = vUv;
  float ratio = uResolution.x / uResolution.y;
  float t = uTime;

  // --- Warp UV ---
  vec2 tuv = uv - 0.5;

  // Noise-driven rotation
  float degree = noise(vec2(t * 0.1, tuv.x * tuv.y));
  tuv.y *= 1.0 / ratio;
  tuv *= Rot(radians((degree - 0.5) * 720.0 + 180.0));
  tuv.y *= ratio;

  // Slow undulating warp — broad curves, not ripples
  float speed = t * 0.8;
  tuv.x += sin(tuv.y * 2.0 + speed) / 50.0;
  tuv.y += sin(tuv.x * 2.5 + speed * 0.9) / 50.0;

  // --- 6 colors sampled from blurred texture on wandering orbits ---
  vec2 s1 = vec2(0.5 + sin(t * 0.013)         * 0.35,
                 0.5 + cos(t * 0.017)         * 0.35);
  vec2 s2 = vec2(0.5 + cos(t * 0.011 + 1.5)  * 0.35,
                 0.5 + sin(t * 0.015 + 2.3)  * 0.35);
  vec2 s3 = vec2(0.5 + sin(t * 0.014 + 3.7)  * 0.35,
                 0.5 + cos(t * 0.012 + 4.1)  * 0.35);
  vec2 s4 = vec2(0.5 + cos(t * 0.016 + 5.2)  * 0.35,
                 0.5 + sin(t * 0.010 + 6.8)  * 0.35);
  vec2 s5 = vec2(0.5 + sin(t * 0.009 + 0.8)  * 0.35,
                 0.5 + cos(t * 0.014 + 5.5)  * 0.35);
  vec2 s6 = vec2(0.5 + cos(t * 0.012 + 3.1)  * 0.35,
                 0.5 + sin(t * 0.008 + 7.4)  * 0.35);

  vec3 c1 = mix(texture2D(uTexB, s1).rgb, texture2D(uTexA, s1).rgb, uMix);
  vec3 c2 = mix(texture2D(uTexB, s2).rgb, texture2D(uTexA, s2).rgb, uMix);
  vec3 c3 = mix(texture2D(uTexB, s3).rgb, texture2D(uTexA, s3).rgb, uMix);
  vec3 c4 = mix(texture2D(uTexB, s4).rgb, texture2D(uTexA, s4).rgb, uMix);
  vec3 c5 = mix(texture2D(uTexB, s5).rgb, texture2D(uTexA, s5).rgb, uMix);
  vec3 c6 = mix(texture2D(uTexB, s6).rgb, texture2D(uTexA, s6).rgb, uMix);

  // --- Flowing smoothstep blending across 6 colors ---
  // Three layers, each split left/right on warped x (reference pattern),
  // then stacked vertically with two separated smoothstep transitions.
  vec2 rtuv = tuv * Rot(radians(-5.0));

  vec3 layer1 = mix(c1, c2, smoothstep(-0.3, 0.2, rtuv.x));
  vec3 layer2 = mix(c3, c4, smoothstep(-0.3, 0.2, rtuv.x));
  vec3 layer3 = mix(c5, c6, smoothstep(-0.3, 0.2, rtuv.x));

  vec3 lower = mix(layer3, layer2, smoothstep(-0.3, 0.1, tuv.y));
  vec3 col = mix(lower, layer1, smoothstep(0.0, 0.35, tuv.y));

  // --- Dark-area processing ---
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  float darkMask = smoothstep(0.12, 0.0, lum);
  col = mix(vec3(lum), col, 1.0 + darkMask * 1.5);
  float peak = max(col.r, max(col.g, col.b));
  vec3 colorDir = col / max(peak, 0.001);
  col = max(col, colorDir * 0.08);

  // Gentle vignette
  vec2 vc = uv - 0.5;
  vc.x *= ratio;
  col *= 1.0 - 0.25 * dot(vc, vc);

  gl_FragColor = vec4(col, 1.0);
}
`;let e=null,f=null,l=null,y=null,Y=null,z=null,V=null,q=null,$=null,K=null,Q=null,j=null,i=null,u=null,B=!1,c=null,E=null,s=1,L=0;const de=.6;let D=0,O=0,p=0,G=!0,w=!1,C=[...P],h=0,b=0;const J=1e3/60,Z=[1,1.5,2,3,4,5,6,8],ee=(r,t)=>{if(!e)return null;const o=e.createShader(r);return o?(e.shaderSource(o,t),e.compileShader(o),e.getShaderParameter(o,e.COMPILE_STATUS)?o:(console.error("Shader:",e.getShaderInfoLog(o)),e.deleteShader(o),null)):null},te=(r,t)=>{if(!e)return null;const o=ee(e.VERTEX_SHADER,r),n=ee(e.FRAGMENT_SHADER,t);if(!o||!n)return null;const a=e.createProgram();return e.attachShader(a,o),e.attachShader(a,n),e.linkProgram(a),e.getProgramParameter(a,e.LINK_STATUS)?a:(console.error("Link:",e.getProgramInfoLog(a)),null)},re=(r,t)=>{if(!e)return null;const o=e.createTexture();e.bindTexture(e.TEXTURE_2D,o),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,r,t,0,e.RGBA,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE);const n=e.createFramebuffer();return e.bindFramebuffer(e.FRAMEBUFFER,n),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,o,0),e.bindFramebuffer(e.FRAMEBUFFER,null),e.bindTexture(e.TEXTURE_2D,null),{fb:n,tex:o}},F=r=>{e&&(e.deleteFramebuffer(r.fb),e.deleteTexture(r.tex))},oe=r=>{if(!e)return;const t=e.getAttribLocation(r,"position");e.bindBuffer(e.ARRAY_BUFFER,y),e.enableVertexAttribArray(t),e.vertexAttribPointer(t,2,e.FLOAT,!1,0,0),e.drawArrays(e.TRIANGLES,0,6)},ne=r=>{if(!e)return null;const t=e.createTexture();return e.bindTexture(e.TEXTURE_2D,t),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,e.RGBA,e.UNSIGNED_BYTE,r),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.MIRRORED_REPEAT),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.MIRRORED_REPEAT),e.bindTexture(e.TEXTURE_2D,null),t},ae=()=>{if(!e)return null;const r=e.createTexture();return e.bindTexture(e.TEXTURE_2D,r),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,1,1,0,e.RGBA,e.UNSIGNED_BYTE,new Uint8Array([0,0,0,255])),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.MIRRORED_REPEAT),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.MIRRORED_REPEAT),e.bindTexture(e.TEXTURE_2D,null),r},le=(r,t,o)=>{if(!e||!f||(c&&F(c),E&&F(E),c=re(t,o),E=re(t,o),!c||!E))return null;e.useProgram(f),e.uniform2f(z,1/t,1/o);let n=r,a=c,R=E;for(let x=0;x<Z.length;x++){e.bindFramebuffer(e.FRAMEBUFFER,a.fb),e.viewport(0,0,t,o),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,n),e.uniform1i(Y,0),e.uniform1f(V,Z[x]),oe(f),n=a.tex;const v=a;a=R,R=v}const T=e.createTexture();e.bindTexture(e.TEXTURE_2D,T),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,t,o,0,e.RGBA,e.UNSIGNED_BYTE,null),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.MIRRORED_REPEAT),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.MIRRORED_REPEAT);const m=n===c.tex?c:E;return e.bindFramebuffer(e.FRAMEBUFFER,m.fb),e.bindTexture(e.TEXTURE_2D,T),e.copyTexImage2D(e.TEXTURE_2D,0,e.RGBA,0,0,t,o,0),e.bindFramebuffer(e.FRAMEBUFFER,null),e.bindTexture(e.TEXTURE_2D,null),F(c),F(E),c=null,E=null,T},ge=r=>{const a=new OffscreenCanvas(70,60).getContext("2d"),R=Math.max(70/r.width,60/r.height),T=r.width*R,m=r.height*R,x=(70-T)/2,v=(60-m)/2;a.drawImage(r,x,v,T,m);const _=a.getImageData(0,0,70,60).data,d=70/7,ce=60/6,g=512,Te=new OffscreenCanvas(g,g),fe=Te.getContext("2d"),Ee=g/7,Re=g/6;for(let U=0;U<6;U++)for(let A=0;A<7;A++){let I=0,S=0,M=0,X=0;const he=Math.floor(A*d),be=Math.floor(U*ce),Fe=Math.floor((A+1)*d),Ie=Math.floor((U+1)*ce);for(let N=be;N<Ie;N++)for(let W=he;W<Fe;W++){const k=(N*70+W)*4;I+=_[k],S+=_[k+1],M+=_[k+2],X++}I=Math.round(I/X),S=Math.round(S/X),M=Math.round(M/X),fe.fillStyle=`rgb(${I},${S},${M})`,fe.fillRect(Math.floor(A*Ee),Math.floor(U*Re),Math.ceil(Ee),Math.ceil(Re))}const xe=new OffscreenCanvas(g,g),me=xe.getContext("2d");return me.filter="saturate(1.5)",me.drawImage(Te,0,0),xe},ie=(r,t,o)=>{if(!e)return null;const n=new OffscreenCanvas(t,o),a=n.getContext("2d");if(!a)return null;const R=r.length>0?r:P,T=t/7,m=o/6;let x=0;for(let _=0;_<6;_++)for(let d=0;d<7;d++)a.fillStyle=R[x%R.length],a.fillRect(Math.floor(d*T),Math.floor(_*m),Math.ceil(T),Math.ceil(m)),x++;const v=ne(n);if(!v)return null;const ue=le(v,t,o);return e.deleteTexture(v),ue},De=()=>!e||(y=e.createBuffer(),e.bindBuffer(e.ARRAY_BUFFER,y),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),e.STATIC_DRAW),f=te(H,ve),l=te(H,_e),!f||!l)?!1:(Y=e.getUniformLocation(f,"uTexture"),z=e.getUniformLocation(f,"uTexelSize"),V=e.getUniformLocation(f,"uOffset"),q=e.getUniformLocation(l,"uTexA"),$=e.getUniformLocation(l,"uTexB"),K=e.getUniformLocation(l,"uMix"),Q=e.getUniformLocation(l,"uResolution"),j=e.getUniformLocation(l,"uTime"),i=ae(),u=ae(),!0),Ue=r=>{if(!e)return;const t=ge(r),o=ne(t);if(!o)return;const n=le(o,512,512);e.deleteTexture(o),n&&(u&&e.deleteTexture(u),u=i,i=n,B=!0,s=0,L=D*.001)},Ae=r=>{if(C=r,!B){const t=ie(r,256,256);t&&(u&&e.deleteTexture(u),u=i,i=t,B=!1,s=0,L=D*.001)}},pe=r=>{if(!e||!l||!i||!u||r-p<J)return;p=r-(r-p)%J;const t=r-O;O=r,G&&!w&&(D+=t);const o=D*.001;if(s<1){const n=o-L;s=Math.min(1,n/de),s=s*s*(3-2*s)}e.bindFramebuffer(e.FRAMEBUFFER,null),e.viewport(0,0,e.canvas.width,e.canvas.height),e.useProgram(l),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,i),e.uniform1i(q,0),e.activeTexture(e.TEXTURE1),e.bindTexture(e.TEXTURE_2D,u),e.uniform1i($,1),e.uniform1f(K,s),e.uniform2f(Q,e.canvas.width,e.canvas.height),e.uniform1f(j,o),oe(l)},se=r=>{pe(r),self.requestAnimationFrame(se)};self.onmessage=r=>{const{data:t}=r;if(t.type==="init"&&t.canvas){if(e=t.canvas.getContext("webgl",{alpha:!1,antialias:!1,preserveDrawingBuffer:!1}),!e){console.error("WebGL not available");return}if(h=t.width??t.canvas.width,b=t.height??t.canvas.height,t.canvas.width=h,t.canvas.height=b,!De()){console.error("Pipeline init failed");return}C=t.colors??P;const o=ie(C,256,256);o&&(i&&e.deleteTexture(i),i=o),s=1,O=performance.now(),p=performance.now(),D=0,G=!0,w=!1,self.requestAnimationFrame(se);return}if(e){if(t.type==="resize"&&typeof t.width=="number"&&typeof t.height=="number"){h=t.width,b=t.height,e.canvas.width=h,e.canvas.height=b;return}if(t.type==="colors"&&t.colors){Ae(t.colors);return}if(t.type==="play"&&typeof t.isPlaying=="boolean"){G=t.isPlaying;return}t.type==="pause"&&typeof t.paused=="boolean"&&(w=t.paused),t.type==="coverImage"&&t.imageData&&Ue(t.imageData)}}})();
