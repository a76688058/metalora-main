import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { MeshTransmissionMaterial, Environment, Float, RoundedBox, SpotLight, useTexture } from '@react-three/drei';
import { useRef, useLayoutEffect } from 'react';
import * as THREE from 'three';

function Poster() {
  const meshRef = useRef<THREE.Group>(null);
  const baseRef = useRef<THREE.Mesh>(null);
  const { viewport, mouse } = useThree();
  
  // Load a high-quality texture for the poster art
  const texture = useTexture('https://picsum.photos/seed/cinematic/1000/1500');
  texture.colorSpace = THREE.SRGBColorSpace;

  // Compute tangents for Anisotropy
  useLayoutEffect(() => {
    if (baseRef.current && baseRef.current.geometry) {
      baseRef.current.geometry.computeTangents();
    }
  }, []);

  useFrame((state) => {
    if (!meshRef.current) return;
    
    // Parallax effect based on mouse position
    // Smoothly interpolate rotation and position
    
    // Subtle rotation based on mouse
    // X axis rotation (looking up/down) - inverted mouse.y
    meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, -mouse.y * 0.15, 0.1);
    // Y axis rotation (looking left/right) - mouse.x
    meshRef.current.rotation.y = THREE.MathUtils.lerp(meshRef.current.rotation.y, mouse.x * 0.15, 0.1);
    
    // Z-axis depth reaction - "Breathing" towards the camera based on cursor proximity to center
    const dist = Math.sqrt(mouse.x * mouse.x + mouse.y * mouse.y);
    // When mouse is at center (dist=0), zShift is higher.
    const targetZ = THREE.MathUtils.lerp(0.2, 0, dist); 
    meshRef.current.position.z = THREE.MathUtils.lerp(meshRef.current.position.z, targetZ, 0.05);
  });

  return (
    <group ref={meshRef}>
      <Float speed={2} rotationIntensity={0.1} floatIntensity={0.2} floatingRange={[-0.05, 0.05]}>
        {/* The Aluminum Base Plate with Anisotropic Edge */}
        <RoundedBox 
          ref={baseRef}
          args={[3, 4.5, 0.1]} 
          radius={0.02} // Sharper radius for "cut" look
          smoothness={4} 
          castShadow 
          receiveShadow
        >
          <meshPhysicalMaterial
            color="#2a2a2a"
            metalness={1.0}
            roughness={0.4}
            clearcoat={0.5}
            clearcoatRoughness={0.1}
            anisotropy={0.5} // Simulating brushed metal direction
            anisotropyRotation={Math.PI / 2} // Vertical brushing
            envMapIntensity={1.5}
          />
        </RoundedBox>

        {/* The Artwork Plane (slightly in front) */}
        <mesh position={[0, 0, 0.051]} castShadow receiveShadow>
          <planeGeometry args={[2.96, 4.46]} /> {/* Slightly smaller than base to show edge */}
          <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>

        {/* The Gloss Coating (Glass/Acrylic Layer) */}
        <RoundedBox args={[3, 4.5, 0.02]} radius={0.02} smoothness={4} position={[0, 0, 0.06]}>
          <MeshTransmissionMaterial
            backside
            samples={8} // Higher quality
            thickness={0.2}
            chromaticAberration={0.03}
            anisotropy={0.1}
            distortion={0.0}
            distortionScale={0.1}
            temporalDistortion={0.0}
            iridescence={0.0}
            roughness={0.0}
            clearcoat={1}
            clearcoatRoughness={0}
            color="#ffffff"
            background={new THREE.Color('#000000')}
          />
        </RoundedBox>
      </Float>
    </group>
  );
}

function Scene() {
  return (
    <>
      {/* Cinematic Dark Environment */}
      <color attach="background" args={['#050505']} />
      
      {/* Dramatic Lighting - Key Light */}
      <SpotLight
        position={[8, 8, 8]}
        angle={0.15}
        penumbra={1}
        intensity={150}
        castShadow
        shadow-bias={-0.0001}
        color="#ffffff"
      />
      
      {/* Rim Light / Fill Light for the metal edge */}
      <SpotLight
        position={[-8, 0, 5]}
        angle={0.5}
        penumbra={1}
        intensity={80}
        color="#a0a0ff" // Cool tone rim light
      />

      {/* Environment Mapping (HDR) for realistic reflections */}
      <Environment preset="city" blur={0.8} background={false} />
      
      <Poster />
    </>
  );
}

export default function Hero3D() {
  return (
    <div className="w-full h-screen bg-black relative z-0">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [0, 0, 7.5], fov: 35 }} // Adjusted camera
        gl={{ 
          antialias: true, 
          toneMapping: THREE.ACESFilmicToneMapping, 
          toneMappingExposure: 1.0,
          preserveDrawingBuffer: true
        }}
      >
        <Scene />
      </Canvas>
      
      {/* Vignette Overlay for Cinematic Feel */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_20%,rgba(0,0,0,0.8)_100%)]" />
    </div>
  );
}
