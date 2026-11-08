import * as THREE from '../vendor/three.module.js';
export const SHAPES = { sphere: 'Сфера', cube: 'Куб', pyramid: 'Пирамида', crystal: 'Кристалл', star: 'Звезда', torus: 'Тор' };

function starRadius(angle) {
  const step = Math.PI / 5;
  const a = ((angle - Math.PI / 2) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  const sector = Math.floor(a / step);
  const t = a - sector * step;
  const r1 = sector % 2 ? .72 : 1.65;
  const r2 = sector % 2 ? 1.65 : .72;
  return r1 * r2 * Math.sin(step) / (r2 * Math.sin(step - t) + r1 * Math.sin(t));
}

function point(shape, u, v) {
  const a = u * Math.PI * 2, b = v * Math.PI;
  const x = Math.sin(b) * Math.cos(a), y = Math.cos(b), z = Math.sin(b) * Math.sin(a);
  let r = 1.3;
  if (shape === 'cube') r = .98 / Math.max(Math.abs(x), Math.abs(y), Math.abs(z));
  if (shape === 'pyramid') {
    r = 100;
    for (const [nx, ny, nz, d] of [[1,.65,0,1.04],[-1,.65,0,1.04],[0,.65,1,1.04],[0,.65,-1,1.04],[0,-1,0,.9]]) {
      const dot = nx*x + ny*y + nz*z;
      if (dot > .00001) r = Math.min(r, d/dot);
    }
    r *= .8;
  }
  if (shape === 'crystal') r = 1 / (Math.abs(y) / 1.8 + Math.max(Math.abs(x), Math.abs(z), (Math.abs(x)+Math.abs(z)) * .7071) / 1.24);
  if (shape === 'star') {
    const radius = starRadius(Math.atan2(y,x));
    r = 1 / Math.sqrt((x*x+y*y)/(radius*radius) + z*z/.17);
  }
  if (shape === 'torus') {
    const t = v * Math.PI * 2, radius = 1.02 + .43 * Math.cos(t);
    return [radius*Math.cos(a), radius*Math.sin(a), .43*Math.sin(t)];
  }
  return [x*r,y*r,z*r];
}

export function createMorphGeometry() {
  const columns = 80, rows = 40;
  const uv = [], barycentric = [];
  for (let j=0;j<rows;j++) for (let i=0;i<columns;i++) {
    for (const [dx,dy,k] of [[0,0,0],[1,0,1],[1,1,2],[0,0,0],[1,1,1],[0,1,2]]) {
      uv.push((i+dx)/columns,(j+dy)/rows);
      barycentric.push(k===0?1:0,k===1?1:0,k===2?1:0);
    }
  }
  const targets = {};
  for (const name of Object.keys(SHAPES)) {
    const array = new Float32Array(uv.length/2*3);
    for(let i=0;i<uv.length;i+=2) array.set(point(name,uv[i],uv[i+1]),i/2*3);
    targets[name] = array;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(targets.crystal.slice(),3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('targetPosition',new THREE.BufferAttribute(targets.crystal.slice(),3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('barycentric',new THREE.Float32BufferAttribute(barycentric,3));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(),2.4);
  return { geometry, targets };
}
