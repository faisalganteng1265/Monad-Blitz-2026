'use client';

import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Tethra Logo 3D - Center piece
const TethraLogo3D = () => {
  const groupRef = useRef<THREE.Group>(null);

  const createGridPlane = (width: number, height: number, divisions: number) => {
    return new THREE.PlaneGeometry(width, height, divisions, divisions);
  };

  useFrame(({ clock }) => {
    if (groupRef.current) {
      const time = clock.getElapsedTime();
      groupRef.current.position.y = Math.sin(time * 0.6) * 0.4;
      groupRef.current.rotation.y = time * 0.3;
      groupRef.current.rotation.x = Math.sin(time * 0.4) * 0.2;
    }
  });

  return (
    <group ref={groupRef} position={[0, 0, -3]} scale={1.8}>
      {/* LEFT SIDE - CYAN */}
      <mesh position={[-1.5, 0, 0]} rotation={[0, Math.PI / 6, 0]}>
        <primitive object={createGridPlane(2, 3.5, 12)} />
        <meshStandardMaterial
          color="#06b6d4"
          wireframe
          transparent
          opacity={0.9}
          emissive="#06b6d4"
          emissiveIntensity={0.3}
        />
      </mesh>

      <mesh position={[-1.3, 2.2, 0.5]} rotation={[Math.PI / 3, Math.PI / 8, 0]}>
        <primitive object={createGridPlane(2.5, 1.8, 12)} />
        <meshStandardMaterial
          color="#06b6d4"
          wireframe
          transparent
          opacity={0.9}
          emissive="#06b6d4"
          emissiveIntensity={0.3}
        />
      </mesh>

      {/* RIGHT SIDE - EMERALD */}
      <mesh position={[1.5, 0, 0]} rotation={[0, -Math.PI / 6, 0]}>
        <primitive object={createGridPlane(2, 3.5, 12)} />
        <meshStandardMaterial
          color="#10b981"
          wireframe
          transparent
          opacity={0.9}
          emissive="#10b981"
          emissiveIntensity={0.3}
        />
      </mesh>

      <mesh position={[1.3, 2.2, 0.5]} rotation={[Math.PI / 3, -Math.PI / 8, 0]}>
        <primitive object={createGridPlane(2.5, 1.8, 12)} />
        <meshStandardMaterial
          color="#10b981"
          wireframe
          transparent
          opacity={0.9}
          emissive="#10b981"
          emissiveIntensity={0.3}
        />
      </mesh>
    </group>
  );
};

// 3D Text Component
const Text3D = ({ text, position, color, scale = 1 }: { text: string; position: [number, number, number]; color: string; scale?: number }) => {
  const meshRef = useRef<THREE.Mesh>(null);

  const font = useMemo(() => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 256;

    if (context) {
      context.fillStyle = color;
      context.font = 'bold 120px Arial';
      context.fillText(text, 20, 150);
    }

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }, [text, color]);

  useFrame(({ clock }) => {
    if (meshRef.current) {
      meshRef.current.position.z = Math.sin(clock.getElapsedTime() * 0.5) * 0.5;
    }
  });

  return (
    <mesh ref={meshRef} position={position} scale={scale}>
      <planeGeometry args={[4, 2]} />
      <meshBasicMaterial map={font} transparent opacity={0.9} />
    </mesh>
  );
};

// Floating Particles
const ParticleField = () => {
  const particlesRef = useRef<THREE.Points>(null);
  const particleCount = 200;

  const { positions, colors } = useMemo(() => {
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 40;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 30;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 20;

      const color = i % 2 === 0 ? new THREE.Color('#06b6d4') : new THREE.Color('#3b82f6');
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    return { positions, colors };
  }, []);

  useFrame(({ clock }) => {
    if (particlesRef.current) {
      const positions = particlesRef.current.geometry.attributes.position.array as Float32Array;

      for (let i = 0; i < particleCount; i++) {
        positions[i * 3 + 1] += Math.sin(clock.getElapsedTime() + i) * 0.01;
      }

      particlesRef.current.geometry.attributes.position.needsUpdate = true;
      particlesRef.current.rotation.y = clock.getElapsedTime() * 0.05;
    }
  });

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.08}
        vertexColors
        transparent
        opacity={0.6}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

// Animated Rings
const AnimatedRings = () => {
  const ringsRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (ringsRef.current) {
      ringsRef.current.rotation.x = clock.getElapsedTime() * 0.2;
      ringsRef.current.rotation.y = clock.getElapsedTime() * 0.15;
    }
  });

  return (
    <group ref={ringsRef} position={[0, 0, -5]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[6, 0.08, 16, 100]} />
        <meshStandardMaterial
          color="#06b6d4"
          transparent
          opacity={0.3}
          emissive="#06b6d4"
          emissiveIntensity={0.2}
        />
      </mesh>

      <mesh rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[7, 0.08, 16, 100]} />
        <meshStandardMaterial
          color="#3b82f6"
          transparent
          opacity={0.2}
          emissive="#3b82f6"
          emissiveIntensity={0.2}
        />
      </mesh>
    </group>
  );
};

// Main Scene
interface TethraTradingSceneProps {
  scrollProgress?: number;
}

const TethraTradingScene = ({ scrollProgress = 0 }: TethraTradingSceneProps) => {
  return (
    <Canvas
      camera={{ position: [0, 0, 15], fov: 60 }}
      style={{ background: 'transparent' }}
    >
      <color attach="background" args={['#050a1e']} />

      {/* Lighting */}
      <ambientLight intensity={0.3} />
      <pointLight position={[-8, 8, 8]} intensity={1.2} color="#06b6d4" />
      <pointLight position={[8, -4, 6]} intensity={1.0} color="#3b82f6" />
      <pointLight position={[0, 0, 10]} intensity={0.8} color="#10b981" />

      {/* Scene Elements */}
      <Text3D text="TAP" position={[-8, 6, 2]} color="#06b6d4" scale={1.5} />
      <Text3D text="TRADE" position={[5, -5, 1]} color="#3b82f6" scale={1.5} />

      <TethraLogo3D />
      <AnimatedRings />
      <ParticleField />

      {/* Fog */}
      <fog attach="fog" args={['#050a1e', 10, 35]} />
    </Canvas>
  );
};

export default TethraTradingScene;
