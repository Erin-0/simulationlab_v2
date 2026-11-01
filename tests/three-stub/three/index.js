/* --- mini algèbre matricielle (le stub doit composer les transformations) --- */
const IDENTITY = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
function mat4(){ return IDENTITY.slice(); }
function mulMat(a,b){
  const o=new Array(16);
  for(let c=0;c<4;c++) for(let r=0;r<4;r++){
    o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];
  }
  return o;
}
function composeMat(m,pos,rot,scl){
  const cx=Math.cos(rot.x||0), sx=Math.sin(rot.x||0);
  const cy=Math.cos(rot.y||0), sy=Math.sin(rot.y||0);
  const cz=Math.cos(rot.z||0), sz=Math.sin(rot.z||0);
  const Rx=[1,0,0,0, 0,cx,sx,0, 0,-sx,cx,0, 0,0,0,1];
  const Ry=[cy,0,-sy,0, 0,1,0,0, sy,0,cy,0, 0,0,0,1];
  const Rz=[cz,sz,0,0, -sz,cz,0,0, 0,0,1,0, 0,0,0,1];
  const S=[scl.x||1,0,0,0, 0,scl.y||1,0,0, 0,0,scl.z||1,0, 0,0,0,1];
  const r=mulMat(Ry, mulMat(Rx, mulMat(Rz, S)));
  r[12]=pos.x||0; r[13]=pos.y||0; r[14]=pos.z||0;
  for(let i=0;i<16;i++) m[i]=r[i];
  return m;
}
function invertRigid(m){
  const r=m.slice();
  const t=[m[12],m[13],m[14]];
  for(let c=0;c<3;c++) for(let rr=0;rr<3;rr++) r[c*4+rr]=m[rr*4+c];
  r[12]=-(r[0]*t[0]+r[4]*t[1]+r[8]*t[2]);
  r[13]=-(r[1]*t[0]+r[5]*t[1]+r[9]*t[2]);
  r[14]=-(r[2]*t[0]+r[6]*t[1]+r[10]*t[2]);
  return r;
}
export class Vector3 { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;} set(x,y,z){this.x=x;this.y=y;this.z=z;return this;} copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;} clone(){return new Vector3(this.x,this.y,this.z);} add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;} sub(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this;} addScaledVector(v,s){this.x+=v.x*s;this.y+=v.y*s;this.z+=v.z*s;return this;} subVectors(a,b){this.x=a.x-b.x;this.y=a.y-b.y;this.z=a.z-b.z;return this;} cross(){return this;} normalize(){return this;} lengthSq(){return 0;} length(){return 0;} lerp(){return this;} multiplyScalar(){return this;} applyMatrix4(){return this;} applyQuaternion(){return this;} setFromUnitVectors(){return this;} distanceTo(){return 0;} }
export class Quaternion {}
export class Matrix4 { copy(){return this;} invert(){return this;} }
export class Euler {}
export class Object3D {
  constructor(){
    this.position=new Vector3(); this.rotation=new Vector3(); this.children=[];
    this.userData={}; this.parent=null; this.visible=true; this.renderOrder=0;
    this.scale=new Vector3(1,1,1); this.scale.setScalar=(v)=>{this.scale.x=this.scale.y=this.scale.z=v;return this.scale;};
    this.matrix=mat4(); this.matrixWorld=mat4(); this.matrixWorldNeedsUpdate=true;
    this.quaternion=new Quaternion();
  }
  clone(){ const o=new this.constructor(); o.position.copy(this.position); o.rotation.copy(this.rotation); o.scale.copy(this.scale); return o; }
  add(...o){ o.forEach(c=>{ if(c){ c.parent=this; if(this.children.indexOf(c)<0) this.children.push(c);} }); return this; }
  remove(...o){ o.forEach(c=>{ const i=this.children.indexOf(c); if(i>=0) this.children.splice(i,1); if(c) c.parent=null; }); return this; }
  traverse(f){ f(this); this.children.forEach(c=>c.traverse&&c.traverse(f)); }
  getWorldPosition(t){ this.updateMatrixWorld(true); return t.set(this.matrixWorld[12], this.matrixWorld[13], this.matrixWorld[14]); }
  getWorldQuaternion(q){ return q||{}; }
  updateMatrixWorld(force){
    /* Comportement fidèle à Three.js : on remonte d'abord jusqu'à la racine
       pour que les parents aient une matrixWorld à jour. */
    if (this.parent && this.parent.updateMatrixWorld && this.parent.matrixWorldNeedsUpdate)
      this.parent.updateMatrixWorld(force);
    if (this.matrixWorldNeedsUpdate || force) {
      composeMat(this.matrix, this.position, this.rotation, this.scale);
      const p = this.parent && this.parent.matrixWorld ? this.parent.matrixWorld : IDENTITY;
      this.matrixWorld = mulMat(p, this.matrix);
      this.matrixWorldNeedsUpdate = false;
      for (const c of this.children) if (c && c.updateMatrixWorld) c.updateMatrixWorld(force);
    }
  }
  getWorldDirection(t){ return t.set(0,0,-1); }
}
export class Group extends Object3D {}
export class Scene extends Object3D { constructor(){super();this.background=null;this.fog=null;} }
export class Mesh extends Object3D { constructor(g,m){super();this.geometry=g;this.material=m;this.castShadow=false;this.receiveShadow=false;} }
export class Points extends Object3D { constructor(g,m){super();this.geometry=g;this.material=m;this.isPoints=true;} }
export class Sprite extends Object3D { constructor(m){super();this.material=m;this.isSprite=true;} }
export class PerspectiveCamera extends Object3D { constructor(){super();this.fov=72;this.aspect=1;this.updateProjectionMatrix=()=>{};} }
export class WebGLRenderer { constructor(){this.toneMapping=0;this.toneMappingExposure=1;this.domElement={appendChild(){},addEventListener(){},style:{}};this.shadowMap={};this.setSize=()=>{};this.setPixelRatio=()=>{};this.setAnimationLoop=()=>{};this.render=()=>{};} }
export class Raycaster { constructor(){this.far=100;this.ray={origin:new Vector3(),direction:new Vector3(),at:(d,t)=>t.set(0,0,-d),intersectPlane:()=>null};} setFromCamera(){} intersectObjects(){return [];} set(){} }
export class Plane { setFromNormalAndCoplanarPoint(){return this;} }
const _B3_HALF = {
  BoxGeometry: p => [p.width/2, p.height/2, p.depth/2],
  RoundedBoxGeometry: p => [p.width/2, p.height/2, p.depth/2],
  PlaneGeometry: p => [p.width/2, p.height/2, 0],
  CircleGeometry: p => [p.radius, p.radius, 0],
  RingGeometry: p => [p.outerRadius, p.outerRadius, 0],
  SphereGeometry: p => [p.radius, p.radius, p.radius],
  CylinderGeometry: p => { const r=Math.max(p.radiusTop||0,p.radiusBottom||0); return [r,(p.height||0)/2,r]; },
  ConeGeometry: p => [p.radius||0,(p.height||0)/2,p.radius||0],
  TorusGeometry: p => [p.radius+p.tube, p.tube, p.radius+p.tube],
  CapsuleGeometry: p => [p.radius, p.length/2+p.radius, p.radius]
};
export class Box3 {
  constructor(){ this.min=new Vector3(Infinity,Infinity,Infinity); this.max=new Vector3(-Infinity,-Infinity,-Infinity); }
  makeEmpty(){ this.min.set(Infinity,Infinity,Infinity); this.max.set(-Infinity,-Infinity,-Infinity); return this; }
  isEmpty(){ return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z; }
  expandByPoint(p){ this.min.set(Math.min(this.min.x,p.x),Math.min(this.min.y,p.y),Math.min(this.min.z,p.z));
                    this.max.set(Math.max(this.max.x,p.x),Math.max(this.max.y,p.y),Math.max(this.max.z,p.z)); return this; }
  /* boîte englobante monde : mêmes `parameters` de géométrie que Three.js */
  setFromObject(root){
    this.makeEmpty();
    const pts=[[-1,-1,-1],[1,-1,-1],[-1,1,-1],[1,1,-1],[-1,-1,1],[1,-1,1],[-1,1,1],[1,1,1]];
    root.traverse(o=>{
      const g=o.geometry; if(!g) return;
      const f=_B3_HALF[g.type]; if(!f) return;
      const h=f(g.parameters||{}); if(!h) return;
      o.updateMatrixWorld(true);
      const e=o.matrixWorld.elements||o.matrixWorld;
      for(const [sx,sy,sz] of pts){
        const x=sx*h[0], y=sy*h[1], z=sz*h[2];
        this.expandByPoint({ x:e[0]*x+e[4]*y+e[8]*z+e[12],
                             y:e[1]*x+e[5]*y+e[9]*z+e[13],
                             z:e[2]*x+e[6]*y+e[10]*z+e[14] });
      }
    });
    return this;
  }
  getSize(t){ return t.set(this.max.x-this.min.x, this.max.y-this.min.y, this.max.z-this.min.z); }
  getCenter(t){ return t.set((this.max.x+this.min.x)/2,(this.max.y+this.min.y)/2,(this.max.z+this.min.z)/2); }
}
export class BufferGeometry {
  constructor(){ this._attrs={}; this.drawRange={count:Infinity}; }
  setAttribute(n,a){ this._attrs[n]=a; return this; }
  getAttribute(n){ return this._attrs[n]; }
  setDrawRange(s,c){ this.drawRange={start:s,count:c}; }
  dispose(){}
  get attributes(){ return this._attrs; }
}
export class BufferAttribute {
  constructor(arr,itemSize){ this.array=arr||new Float32Array(0); this.itemSize=itemSize||1; this.count=this.array.length/this.itemSize; this.needsUpdate=false; }
  getX(i){ return this.array[i*this.itemSize]; }
  getY(i){ return this.array[i*this.itemSize+1]; }
  getZ(i){ return this.array[i*this.itemSize+2]; }
  setX(i,v){ this.array[i*this.itemSize]=v; return this; }
  setY(i,v){ this.array[i*this.itemSize+1]=v; return this; }
  setZ(i,v){ this.array[i*this.itemSize+2]=v; return this; }
}
export class Float32BufferAttribute extends BufferAttribute {}
export class CatmullRomCurve3 { constructor(p){this.points=p;} }
export class TubeGeometry extends BufferGeometry {}
export class CanvasTexture { constructor(image){this.image=image;this.colorSpace='';this.wrapS=this.wrapT='';this.repeat={set(){}};this.anisotropy=1;this.needsUpdate=false;} dispose(){} }
export class Color {
  constructor(c){ this.c=c; this.r=1; this.g=1; this.b=1; }
  set(v){ this.c=v; return this; }
  setHex(h){ this.c=h; return this; }
  setScalar(v){ this.r=this.g=this.b=v; return this; }
  setRGB(r,g,b){ this.r=r;this.g=g;this.b=b; return this; }
  clone(){ const k=new Color(this.c); k.r=this.r;k.g=this.g;k.b=this.b; return k; }
  copy(k){ this.c=k&&k.c; this.r=k?k.r:1;this.g=k?k.g:1;this.b=k?k.b:1; return this; }
  multiplyScalar(){ return this; }
  lerp(){ return this; }
  getHexString(){ return '22d3ee'; }
}
export const SRGBColorSpace='srgb', RepeatWrapping=1000, ClampToEdgeWrapping=1001, AdditiveBlending=2, PCFSoftShadowMap=2, PCFShadowMap=1, ACESFilmicToneMapping=4, FogExp2=class{constructor(){this.density=0;}};
export const MathUtils={clamp:(v,a,b)=>Math.max(a,Math.min(b,v))};

/* --- classes supplémentaires (stub) --- */
export class Material {
  constructor(p){
    Object.assign(this,p||{});
    this.userData={};
    if(this.color!==undefined && !(this.color instanceof Color)) this.color=new Color(this.color);
    if(this.emissive!==undefined && !(this.emissive instanceof Color)) this.emissive=new Color(this.emissive);
  }
  dispose(){} clone(){return new Material(this);} setValues(o){Object.assign(this,o);}
}
export class MeshBasicMaterial extends Material {}
export class MeshStandardMaterial extends Material {
  constructor(p){ super(p); if(this.emissive===undefined) this.emissive=new Color(0); }
}
export class MeshPhysicalMaterial extends Material {}
export class SpriteMaterial extends Material {}
export class PointsMaterial extends Material {}
/* Chaque géométrie mémorise ses `parameters` et son `type`, comme dans
   Three.js : indispensable pour mesurer les encombrements dans les tests. */
export class BoxGeometry extends BufferGeometry {
  constructor(width=1,height=1,depth=1,ws=1,hs=1,ds=1){ super(); this.type='BoxGeometry';
    this.parameters={width,height,depth,widthSegments:ws,heightSegments:hs,depthSegments:ds}; }
}
export class PlaneGeometry extends BufferGeometry {
  constructor(width=1,height=1,ws=1,hs=1){ super(); this.type='PlaneGeometry';
    this.parameters={width,height,widthSegments:ws,heightSegments:hs}; }
}
export class CircleGeometry extends BufferGeometry {
  constructor(radius=1,segments=8){ super(); this.type='CircleGeometry'; this.parameters={radius,segments}; }
}
export class RingGeometry extends BufferGeometry {
  constructor(innerRadius=0.5,outerRadius=1,seg=8){ super(); this.type='RingGeometry';
    this.parameters={innerRadius,outerRadius,thetaSegments:seg}; }
}
export class SphereGeometry extends BufferGeometry {
  constructor(radius=1,ws=12,hs=8){ super(); this.type='SphereGeometry'; this.parameters={radius,widthSegments:ws,heightSegments:hs}; }
}
export class CylinderGeometry extends BufferGeometry {
  constructor(radiusTop=1,radiusBottom=1,height=1,radialSeg=8){ super(); this.type='CylinderGeometry';
    this.parameters={radiusTop,radiusBottom,height,radialSegments:radialSeg}; }
}
export class ConeGeometry extends BufferGeometry {
  constructor(radius=1,height=1,radialSeg=8){ super(); this.type='ConeGeometry'; this.parameters={radius,height,radialSegments:radialSeg}; }
}
export class TorusGeometry extends BufferGeometry {
  constructor(radius=1,tube=.4,radialSeg=8,tubularSeg=6,arc=Math.PI*2){ super(); this.type='TorusGeometry';
    this.parameters={radius,tube,radialSegments:radialSeg,tubularSegments:tubularSeg,arc}; }
}
export class CapsuleGeometry extends BufferGeometry {
  constructor(radius=1,length=1,capSeg=4,radialSeg=8){ super(); this.type='CapsuleGeometry'; this.parameters={radius,length,capSegments:capSeg,radialSegments:radialSeg}; }
}
/* Les lumières mémorisent leurs paramètres de construction (comme Three.js) :
   les tests vérifient l'ouverture du cône, la pénombre, la distance… */
export class HemisphereLight extends Object3D { constructor(color,ground,intensity){super();this.color=color;this.groundColor=ground;this.intensity=intensity||0;} }
export class SpotLight extends Object3D { constructor(color,intensity,distance,angle,penumbra,decay){super();this.color=color;this.intensity=intensity||0;this.distance=distance;this.angle=angle;this.penumbra=penumbra;this.decay=decay;this.shadow={mapSize:{set(){}},camera:{},map:null,bias:0};this.target=new Object3D();} }
export class PointLight extends Object3D { constructor(color,intensity,distance,decay){super();this.color=color;this.intensity=intensity||0;this.distance=distance;this.decay=decay;} }
export class AmbientLight extends Object3D {}
export class Clock { constructor(){this.elapsedTime=0;} getDelta(){return 0.016;} getElapsedTime(){return this.elapsedTime;} }
