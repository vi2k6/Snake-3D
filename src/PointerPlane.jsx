
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
export default function PointerPlane({ onMove }){
  const { size, camera, gl } = useThree();
  const ray = useMemo(()=>new THREE.Raycaster(),[]);
  const plane = useMemo(()=>new THREE.Plane(new THREE.Vector3(0,1,0),0),[]);
  useEffect(()=>{
    const dom = gl.domElement;
    const handle = (e)=>{
      const clientX = e.touches?e.touches[0].clientX:e.clientX;
      const clientY = e.touches?e.touches[0].clientY:e.clientY;
      const x = (clientX/size.width)*2 - 1;
      const y = -(clientY/size.height)*2 + 1;
      ray.setFromCamera({x,y}, camera);
      const point = new THREE.Vector3();
      ray.ray.intersectPlane(plane, point);
      if(point) onMove(point);
    };
    dom.addEventListener('pointermove', handle, {passive:true});
    dom.addEventListener('touchmove', handle, {passive:true});
    return ()=>{ dom.removeEventListener('pointermove', handle); dom.removeEventListener('touchmove', handle); };
  },[onMove, size, camera, gl, ray, plane]);
  return null;
}
