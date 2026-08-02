'use strict';
function hex2rgb(h){h=h.replace('#','');return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];}
function rgb2hex(a){return '#'+a.map(function(v){v=Math.round(Math.min(255,Math.max(0,v)));return v.toString(16).padStart(2,'0');}).join('');}
function s2l(c){c/=255;return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4);}
function l2s(c){c=c<=0.0031308?c*12.92:1.055*Math.pow(c,1/2.4)-0.055;return c*255;}
function mul(m,v){return [m[0][0]*v[0]+m[0][1]*v[1]+m[0][2]*v[2],
                          m[1][0]*v[0]+m[1][1]*v[1]+m[1][2]*v[2],
                          m[2][0]*v[0]+m[2][1]*v[1]+m[2][2]*v[2]];}

/* ---------- Vienot / Brettel / Mollon 1999 ---------- */
const RGB2LMS=[[17.8824,43.5161,4.11935],[3.45565,27.1554,3.86714],[0.0299566,0.184309,1.46709]];
const LMS2RGB=[[0.080944447,-0.13050440,0.116721066],
               [-0.0102485335,0.05401932,-0.113614708],
               [-0.000365296938,-0.00412161469,0.693511405]];
function vienot(hex,type){
  const rgb=hex2rgb(hex).map(s2l);
  let lms=mul(RGB2LMS,rgb);
  let [L,M,S]=lms;
  if(type==='deut') M = 0.494207*L + 1.24827*S;
  else if(type==='prot') L = 2.02344*M - 2.52581*S;
  else if(type==='trit') S = -0.395913*L + 0.801109*M;
  const out=mul(LMS2RGB,[L,M,S]).map(l2s);
  return rgb2hex(out);
}
/* ---------- Machado 2009, severity 1.0 (what Chrome/Blink uses) ---------- */
const MACHADO={
 deut:[[0.367322,0.860646,-0.227968],[0.280085,0.672501,0.047413],[-0.011820,0.042940,0.968881]],
 prot:[[0.152286,1.052583,-0.204868],[0.114503,0.786281,0.099216],[-0.003882,-0.048116,1.051998]],
 trit:[[1.255528,-0.076749,-0.178779],[-0.078411,0.930809,0.147602],[0.004733,0.691367,0.303900]]
};
function machado(hex,type){
  const rgb=hex2rgb(hex).map(s2l);
  const out=mul(MACHADO[type],rgb).map(l2s);
  return rgb2hex(out);
}
/* ---------- CIELab + dE ---------- */
function lab(hex){
  const [r,g,b]=hex2rgb(hex).map(s2l);
  let X=r*0.4124564+g*0.3575761+b*0.1804375;
  let Y=r*0.2126729+g*0.7151522+b*0.0721750;
  let Z=r*0.0193339+g*0.1191920+b*0.9503041;
  const wx=0.95047,wy=1.0,wz=1.08883;
  const f=t=>t>Math.pow(6/29,3)?Math.cbrt(t):t/(3*Math.pow(6/29,2))+4/29;
  const fx=f(X/wx),fy=f(Y/wy),fz=f(Z/wz);
  return [116*fy-16,500*(fx-fy),200*(fy-fz)];
}
function de76(a,b){const A=lab(a),B=lab(b);return Math.hypot(A[0]-B[0],A[1]-B[1],A[2]-B[2]);}
function de2000(h1,h2){
  const [L1,a1,b1]=lab(h1),[L2,a2,b2]=lab(h2);
  const C1=Math.hypot(a1,b1),C2=Math.hypot(a2,b2),Cb=(C1+C2)/2;
  const G=0.5*(1-Math.sqrt(Math.pow(Cb,7)/(Math.pow(Cb,7)+Math.pow(25,7))));
  const ap1=(1+G)*a1, ap2=(1+G)*a2;
  const Cp1=Math.hypot(ap1,b1),Cp2=Math.hypot(ap2,b2);
  const hp=(b,a)=>{if(b===0&&a===0)return 0;let h=Math.atan2(b,a)*180/Math.PI;return h<0?h+360:h;};
  const hp1=hp(b1,ap1),hp2=hp(b2,ap2);
  const dL=L2-L1,dC=Cp2-Cp1;
  let dh=0;
  if(Cp1*Cp2!==0){dh=hp2-hp1;if(dh>180)dh-=360;else if(dh<-180)dh+=360;}
  const dH=2*Math.sqrt(Cp1*Cp2)*Math.sin(dh*Math.PI/360);
  const Lb=(L1+L2)/2,Cpb=(Cp1+Cp2)/2;
  let hpb;
  if(Cp1*Cp2===0)hpb=hp1+hp2;
  else{hpb=(hp1+hp2)/2;if(Math.abs(hp1-hp2)>180)hpb+= (hp1+hp2<360)?180:-180;}
  const T=1-0.17*Math.cos((hpb-30)*Math.PI/180)+0.24*Math.cos(2*hpb*Math.PI/180)
          +0.32*Math.cos((3*hpb+6)*Math.PI/180)-0.20*Math.cos((4*hpb-63)*Math.PI/180);
  const dTh=30*Math.exp(-Math.pow((hpb-275)/25,2));
  const Rc=2*Math.sqrt(Math.pow(Cpb,7)/(Math.pow(Cpb,7)+Math.pow(25,7)));
  const Sl=1+(0.015*Math.pow(Lb-50,2))/Math.sqrt(20+Math.pow(Lb-50,2));
  const Sc=1+0.045*Cpb, Sh=1+0.015*Cpb*T;
  const Rt=-Math.sin(2*dTh*Math.PI/180)*Rc;
  return Math.sqrt(Math.pow(dL/Sl,2)+Math.pow(dC/Sc,2)+Math.pow(dH/Sh,2)+Rt*(dC/Sc)*(dH/Sh));
}
function lum(hex){const [r,g,b]=hex2rgb(hex).map(s2l);return 0.2126*r+0.7152*g+0.0722*b;}
function ratio(a,b){const A=lum(a),B=lum(b);return (Math.max(A,B)+0.05)/(Math.min(A,B)+0.05);}
module.exports={vienot,machado,de76,de2000,lum,ratio,lab};
