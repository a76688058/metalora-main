import React, { useRef, useEffect, useMemo, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, PerformanceMonitor, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import gsap from 'gsap';
import { CustomEase } from 'gsap/CustomEase';

gsap.registerPlugin(CustomEase);
CustomEase.create('luxury', '0.23, 1, 0.32, 1');

// --- Utility: Low-pass filter for Gyro ---
const lowPassFilter = (currentValue: number, targetValue: number, alpha: number) => {
  return currentValue + alpha * (targetValue - currentValue);
};

// --- Component: The Interactive Mesh ---
const InteractiveMesh = ({ isHighEnd }: { isHighEnd: boolean }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  
  // [REQUIREMENT] KTX2 Loader를 통한 텍스처 압축 해제 처리
  // 실제 KTX2 에셋이 없으므로, useTexture와 Data URI를 사용하여 로직을 시뮬레이션합니다.
  // 실제 환경에서는 다음과 같이 사용합니다:
  // const [anisotropyMap, normalMap] = useKTX2([
  //   isHighEnd ? '/textures/8k_anisotropy.ktx2' : '/textures/2k_anisotropy.ktx2',
  //   isHighEnd ? '/textures/8k_normal.ktx2' : '/textures/2k_normal.ktx2'
  // ]);
  const [anisotropyMap, normalMap] = useTexture([
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', // White
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='  // Flat Normal
  ]);

  // Performance Isolation (Direct Mutation)
  const mouse = useRef({ x: 0, y: 0 });
  const gyro = useRef({ alpha: 0, beta: 0, gamma: 0 });
  const targetGyro = useRef({ alpha: 0, beta: 0, gamma: 0 });
  const hasGyro = useRef(false);

  // GSAP quickTo for mouse tracking (GC 부담 최소화, 60fps 보장)
  const xTo = useMemo(() => gsap.quickTo(mouse.current, "x", { duration: 0.5, ease: "luxury" }), []);
  const yTo = useMemo(() => gsap.quickTo(mouse.current, "y", { duration: 0.5, ease: "luxury" }), []);

  useEffect(() => {
    // Mouse Interaction
    const handleMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = -(e.clientY / window.innerHeight) * 2 + 1;
      xTo(x);
      yTo(y);
    };

    // Dynamic Roughness & High-End Physics
    const handlePointerDown = () => {
      if (materialRef.current) {
        gsap.to(materialRef.current, {
          roughness: 0.1, // 날카로운 정반사
          duration: 0.6,
          ease: "luxury"
        });
      }
    };

    const handlePointerUp = () => {
      if (materialRef.current) {
        gsap.to(materialRef.current, {
          roughness: 0.4, // 은은한 광택
          duration: 0.8,
          ease: "luxury"
        });
      }
    };

    // Mobile Gyro Sensor
    const handleDeviceOrientation = (event: DeviceOrientationEvent) => {
      if (event.alpha !== null && event.beta !== null && event.gamma !== null) {
        hasGyro.current = true;
        targetGyro.current.alpha = event.alpha;
        targetGyro.current.beta = event.beta;
        targetGyro.current.gamma = event.gamma;
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('touchstart', handlePointerDown);
    window.addEventListener('touchend', handlePointerUp);
    window.addEventListener('deviceorientation', handleDeviceOrientation);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('touchstart', handlePointerDown);
      window.removeEventListener('touchend', handlePointerUp);
      window.removeEventListener('deviceorientation', handleDeviceOrientation);
    };
  }, [xTo, yTo]);

  useFrame(() => {
    if (!meshRef.current) return;

    // Mobile Gyro & LOD System - Low-pass Filter 적용
    if (hasGyro.current) {
      const alpha = 0.05; // 급격한 노이즈 차단을 위한 필터 계수
      gyro.current.beta = lowPassFilter(gyro.current.beta, targetGyro.current.beta, alpha);
      gyro.current.gamma = lowPassFilter(gyro.current.gamma, targetGyro.current.gamma, alpha);

      // 자이로 데이터를 회전값으로 변환 (디바이스 방향에 맞게 조정)
      meshRef.current.rotation.x = THREE.MathUtils.degToRad(gyro.current.beta - 90) * 0.5;
      meshRef.current.rotation.y = THREE.MathUtils.degToRad(gyro.current.gamma) * 0.5;
    } else {
      // 마우스 좌표 기반 회전
      meshRef.current.rotation.x = mouse.current.y * 0.5;
      meshRef.current.rotation.y = mouse.current.x * 0.5;
    }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[2, 64, 64]} />
      {/* Physical Shader Implementation (PBR) */}
      <meshPhysicalMaterial
        ref={materialRef}
        color="#ffffff"
        metalness={1.0}
        roughness={0.4}
        anisotropy={isHighEnd ? 1.0 : 0.0} // 고사양 기기에서만 이방성 셰이더 적용
        anisotropyMap={isHighEnd ? anisotropyMap : undefined}
        normalMap={normalMap}
        clearcoat={0.1}
        clearcoatRoughness={0.1}
      />
    </mesh>
  );
};

// --- Main Container: LOD System & Canvas ---
export default function AnisotropicHybrid() {
  const [dpr, setDpr] = useState(1.5);
  const [isHighEnd, setIsHighEnd] = useState(true);

  return (
    <div className="w-full h-screen bg-black overflow-hidden relative">
      <div className="absolute top-8 left-8 z-10 text-white/50 text-sm font-mono pointer-events-none">
        <p>ANISOTROPIC HYBRID INTERACTION</p>
        <p>LOD TIER: {isHighEnd ? 'HIGH-END (8K)' : 'LOW-END (2K)'}</p>
        <p>INTERACT: CLICK / TOUCH / GYRO</p>
      </div>
      
      {/* Lighthouse TBT 최적화를 위한 Canvas 설정 */}
      <Canvas 
        dpr={dpr} 
        camera={{ position: [0, 0, 6], fov: 45 }}
        gl={{ powerPreference: "high-performance", antialias: false }}
      >
        <color attach="background" args={['#050505']} />
        
        {/* Fallback (LOD) System */}
        <PerformanceMonitor
          onIncline={() => {
            setDpr(Math.min(2, window.devicePixelRatio));
            setIsHighEnd(true);
          }}
          onDecline={() => {
            setDpr(1);
            setIsHighEnd(false);
          }}
        >
          <React.Suspense fallback={null}>
            <InteractiveMesh isHighEnd={isHighEnd} />
            <Environment preset="studio" />
          </React.Suspense>
        </PerformanceMonitor>
      </Canvas>
    </div>
  );
}
