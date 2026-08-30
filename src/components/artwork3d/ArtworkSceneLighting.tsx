import { Environment } from '@react-three/drei';

interface ArtworkSceneLightingProps {
  environmentIntensity?: number;
}

/** Static scene lighting bundle — no useFrame; parent may own Environment instead */
export default function ArtworkSceneLighting({ environmentIntensity = 0.3 }: ArtworkSceneLightingProps) {
  return (
    <>
      <ambientLight intensity={0.2} />
      <directionalLight position={[5, 5, 5]} intensity={0.3} castShadow={false} />
      <directionalLight position={[-5, -5, -5]} intensity={0.15} />
      <pointLight position={[0.8, 0.4, 1.4]} intensity={0.2} color="#ffffff" />
      <Environment preset="studio" environmentIntensity={environmentIntensity} />
    </>
  );
}
