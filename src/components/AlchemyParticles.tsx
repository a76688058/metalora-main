import React, { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

export default function AlchemyParticles() {
  const pointsRef = useRef<THREE.Points>(null);
  const { viewport, size } = useThree();
  
  // Particle count based on screen size for performance
  const count = useMemo(() => (size.width < 768 ? 1500 : 3000), [size.width]);
  
  const [positions, sizes, initialPositions] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const s = new Float32Array(count);
    const initPos = new Float32Array(count * 3);
    
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 10;
      const y = (Math.random() - 0.5) * 4; // Constrained to the 12rem height area
      const z = (Math.random() - 0.5) * 5;
      
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      
      initPos[i * 3] = x;
      initPos[i * 3 + 1] = y;
      initPos[i * 3 + 2] = z;
      
      s[i] = Math.random();
    }
    return [pos, s, initPos];
  }, [count]);

  const mouse = useRef({ x: 0, y: 0 });
  const scrollY = useRef(0);
  const lastScrollY = useRef(0);
  const scrollDelta = useRef(0);

  // Handle scroll delta
  React.useEffect(() => {
    const handleScroll = () => {
      scrollY.current = window.scrollY;
      scrollDelta.current = scrollY.current - lastScrollY.current;
      lastScrollY.current = scrollY.current;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Handle mouse/gyro
  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    
    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.beta && e.gamma) {
        // High-pass filter for liquid-smooth movement
        const targetX = (e.gamma / 45);
        const targetY = (e.beta / 45);
        mouse.current.x += (targetX - mouse.current.x) * 0.05;
        mouse.current.y += (targetY - mouse.current.y) * 0.05;
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('deviceorientation', handleOrientation);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, []);

  useFrame((state) => {
    if (!pointsRef.current) return;
    
    const time = state.clock.getElapsedTime();
    const positions = pointsRef.current.geometry.attributes.position.array as Float32Array;
    
    // Smoothly decay scroll delta
    scrollDelta.current *= 0.95;
    
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      
      // Base movement: subtle floating
      positions[i3] = initialPositions[i3] + Math.sin(time * 0.2 + initialPositions[i3]) * 0.1;
      positions[i3 + 1] = initialPositions[i3 + 1] + Math.cos(time * 0.3 + initialPositions[i3 + 1]) * 0.1;
      
      // Interaction: React to scroll delta
      positions[i3 + 1] -= scrollDelta.current * 0.005;
      
      // Interaction: React to mouse/gyro
      positions[i3] += mouse.current.x * 0.02;
      positions[i3 + 1] += mouse.current.y * 0.02;
      
      // Wrap around Y
      if (positions[i3 + 1] > 2) positions[i3 + 1] = -2;
      if (positions[i3 + 1] < -2) positions[i3 + 1] = 2;
    }
    
    pointsRef.current.geometry.attributes.position.needsUpdate = true;
    pointsRef.current.rotation.y = time * 0.05;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-size"
          count={sizes.length}
          array={sizes}
          itemSize={1}
        />
      </bufferGeometry>
      <shaderMaterial
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={{
          uTime: { value: 0 },
          uColor: { value: new THREE.Color('#ffffff') },
        }}
        vertexShader={`
          attribute float size;
          varying float vOpacity;
          void main() {
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = size * (300.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
            vOpacity = 1.0 / (-mvPosition.z * 0.5);
          }
        `}
        fragmentShader={`
          varying float vOpacity;
          uniform vec3 uColor;
          void main() {
            float d = distance(gl_PointCoord, vec2(0.5));
            if (d > 0.5) discard;
            // Enhanced strength for elegant, dreamlike glow
            float strength = 0.08 / d - 0.15;
            gl_FragColor = vec4(uColor, strength * vOpacity * 0.6);
          }
        `}
      />
    </points>
  );
}
