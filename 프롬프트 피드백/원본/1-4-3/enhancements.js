// 공유 전자쌍 수와 비공유 전자쌍을 함께 나타내는 루이스 개념 모형.
let bondOrder=1;
const originalDraw=draw, originalSelect=selectType;
function updateBondCopy(){
  const atom=['','H','O','N'][bondOrder], formula=['','H₂','O₂','N₂'][bondOrder];
  const name=['','단일','이중','삼중'][bondOrder];
  $('pairCount').textContent=`공유 전자쌍 ${bondOrder}개 · 공유 전자 ${bondOrder*2}개`;
  if(type!=='covalent')return;
  $('sceneTitle').textContent=`${formula} · ${name} 결합 시뮬레이션`;
  $('description').textContent=`두 ${atom==='H'?'수소':atom==='O'?'산소':'질소'} 원자가 각각 전자 ${bondOrder}개를 내어 전자쌍 ${bondOrder}개를 공유합니다. ${bondOrder===1?'수소는 첫 번째 전자 껍질에 전자 2개를 채웁니다.':'각 원자는 공유 전자를 함께 세어 최외각에 전자 8개를 갖는 것으로 설명합니다.'}`;
  $('principle').textContent=`${name} 결합 = 공유 전자쌍 ${bondOrder}개 (${bondOrder*2}전자)`;
}
draw=function(){
  originalDraw();if(type!=='covalent')return;
  const t=p/100,atom=['','H','O','N'][bondOrder],a=mix(210,290,t),b=mix(490,410,t);
  let s=circle(a,145,83,'#698af315','#b9cbf3')+circle(b,145,83,'#49ae9115','#acd8cc');
  if(t>.25)s+=`<ellipse cx="350" cy="145" rx="${95*t}" ry="78" fill="#f4b33912" stroke="#efc86d" stroke-dasharray="5 5"/>`;
  for(let j=0;j<bondOrder;j++){
    const y=145+(j-(bondOrder-1)/2)*40;
    if(t>.78)s+=`<line x1="${a+27}" y1="${y}" x2="${b-27}" y2="${y}" stroke="#a9b7d1" stroke-width="3"/>`;
    s+=electron(mix(a+65,340,t),y-8*t)+electron(mix(b-65,360,t),y+8*t,'#e59a3d');
  }
  const lone=bondOrder===1?0:bondOrder===2?2:1;
  for(let j=0;j<lone;j++)for(let side of [-1,1]){
    const x=side<0?a-53:b+53,y=145+(j-(lone-1)/2)*50;
    s+=electron(x,y-9,'#8ca2c4')+electron(x,y+9,'#8ca2c4');
  }
  s+=circle(a,145,24,'#5c84f5')+circle(b,145,24,'#49ae91')+text(a,152,atom,'white')+text(b,152,atom,'white');
  s+=text(350,270,`${atom}${['','—','=','≡'][bondOrder]}${atom} · 공유 전자쌍 ${bondOrder}개`,'#4263eb',18);
  if(lone)s+=text(350,295,`회청색 점: 원자당 비공유 전자쌍 ${lone}개`,'#718096',12);
  $('visual').innerHTML=s;
  const n=p<28?0:p<78?1:2;
  $('stepTitle').textContent=['01 · 각 원자의 최외각 전자','02 · 전자쌍을 함께 공유','03 · '+['','단일','이중','삼중'][bondOrder]+' 결합 형성'][n];
  $('stepDesc').textContent=[`각 원자가 결합에 참여할 전자 ${bondOrder}개를 가지고 접근합니다. 노란색은 공유에 참여할 전자입니다.`,`전자 ${bondOrder*2}개가 두 원자 사이에 함께 분포하여 공유 전자쌍 ${bondOrder}개를 만듭니다.`,`결합선 ${bondOrder}개는 공유 전자쌍 ${bondOrder}개를 뜻합니다. 점의 위치는 전자의 실제 궤도가 아닌 개념 표현입니다.`][n];
};
selectType=function(v){originalSelect(v);$('bondTools').hidden=v!=='covalent';updateBondCopy();if(v!=='covalent'){$('latticeKind').value=v;window.rebuildLattice?.();}};
$('bondOrder').onchange=e=>{bondOrder=+e.target.value;p=0;playing=false;$('play').textContent='▶ 재생';updateBondCopy();draw();};
updateBondCopy();

// Three.js와 OrbitControls는 동일한 고정 버전을 사용합니다.
(async()=>{
  try{
    const THREE=await import('three');
    const {OrbitControls}=await import('three/addons/controls/OrbitControls.js');
    const host=$('latticeView'),scene=new THREE.Scene();scene.background=new THREE.Color('#101e34');
    const camera=new THREE.PerspectiveCamera(42,1,.1,100);
    const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    renderer.domElement.setAttribute('aria-label','마우스로 조작할 수 있는 3차원 결정 격자');
    host.append(renderer.domElement);
    const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=4;controls.maxDistance=25;
    scene.add(new THREE.HemisphereLight(0xffffff,0x334466,2.5));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(4,7,5);scene.add(light);
    let group=new THREE.Group(),electrons=[];
    const sphere=new THREE.SphereGeometry(1,24,16);
    const mats=[0x648bfa,0x4fc6a5,0xf9c344].map(color=>new THREE.MeshStandardMaterial({color,roughness:.35,metalness:.15}));
    function ball(x,y,z,r,mat){const m=new THREE.Mesh(sphere,mat);m.position.set(x,y,z);m.scale.setScalar(r);group.add(m);return m;}
    function resetCamera(){camera.position.set(8,6,9);controls.target.set(0,0,0);controls.update();}
    function rebuild(){
      scene.remove(group);group.traverse(o=>{if(o.isLineSegments){o.geometry.dispose();o.material.dispose();}});group=new THREE.Group();electrons=[];
      const ionic=$('latticeKind').value==='ionic',points=[];
      if(ionic){
        for(let x=0;x<5;x++)for(let y=0;y<5;y++)for(let z=0;z<5;z++){
          ball((x-2)*1.25,(y-2)*1.25,(z-2)*1.25,(x+y+z)%2?.36:.25,mats[(x+y+z)%2]);
          for(let d of [[1,0,0],[0,1,0],[0,0,1]])if(x+d[0]<5&&y+d[1]<5&&z+d[2]<5)points.push(new THREE.Vector3((x-2)*1.25,(y-2)*1.25,(z-2)*1.25),new THREE.Vector3((x+d[0]-2)*1.25,(y+d[1]-2)*1.25,(z+d[2]-2)*1.25));
        }
      }else{
        for(let x=0;x<5;x++)for(let y=0;y<5;y++)for(let z=0;z<5;z++)if((x+y+z)%2===0)ball((x-2)*1.1,(y-2)*1.1,(z-2)*1.1,.34,mats[0]);
        for(let i=0;i<36;i++){let m=ball(0,0,0,.075,mats[2]);electrons.push({m,phase:i*2.399,speed:.4+(i%5)*.07});}
      }
      if(points.length)group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0x7186a6,transparent:true,opacity:.27})));
      scene.add(group);
      $('latticeCaption').textContent=ionic?'파란색: Na⁺ · 초록색: Cl⁻. '+'각 이온의 가장 가까운 이웃 6개는 반대 전하의 이온입니다. 표면에서는 잘라낸 격자 밖의 이웃이 생략됩니다.':'파란색: 금속 양이온 · 노란색: 자유 전자. 면심 입방 배열의 일부를 표현했습니다. 전자는 특정 이온 주위를 도는 것이 아니라 결정 전체에 퍼져 이동합니다. 전자 수와 운동은 개념 표현입니다.';
    }
    window.rebuildLattice=rebuild;$('latticeKind').onchange=rebuild;$('cameraReset').onclick=resetCamera;
    function zoom(factor){const offset=camera.position.clone().sub(controls.target);offset.setLength(THREE.MathUtils.clamp(offset.length()*factor,controls.minDistance,controls.maxDistance));camera.position.copy(controls.target).add(offset);controls.update();}
    $('zoomIn').onclick=()=>zoom(.8);$('zoomOut').onclick=()=>zoom(1.25);
    new ResizeObserver(()=>{const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}).observe(host);
    resetCamera();rebuild();$('latticeStatus').hidden=true;
    renderer.setAnimationLoop(ms=>{const t=ms*.001;electrons.forEach(({m,phase,speed})=>m.position.set(2.6*Math.sin(t*speed+phase),2.6*Math.sin(t*speed*1.31+phase*2),2.6*Math.cos(t*speed*.83+phase*3)));controls.update();renderer.render(scene,camera);});
  }catch(error){$('latticeStatus').textContent='3D 모형을 불러올 수 없습니다. 인터넷 연결과 브라우저의 WebGL 지원을 확인한 후 새로고침해 주세요. 전자 이동 시뮬레이션은 계속 이용할 수 있습니다.';}
})();
