"use client";

import { Canvas } from "@react-three/fiber";
import { Grid, OrbitControls } from "@react-three/drei";

type BlueprintThreeCanvasProps = {
  className?: string;
  height?: number;
};

/**
 * Minimal R3F + Drei scene for 3D blueprint previews.
 * Import from a Client Component or via `next/dynamic` with `ssr: false` if the parent is a Server Component.
 */
export function BlueprintThreeCanvas({
  className,
  height = 400,
}: BlueprintThreeCanvasProps) {
  return (
    <div className={className} style={{ width: "100%", height }}>
      <Canvas camera={{ position: [4, 4, 4], fov: 50 }}>
        <color attach="background" args={["#f4f4f5"]} />
        <ambientLight intensity={0.55} />
        <directionalLight position={[5, 10, 5]} intensity={0.85} />
        <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
          <boxGeometry args={[2, 1, 1]} />
          <meshStandardMaterial color="#8b7355" roughness={0.7} />
        </mesh>
        <Grid
          infiniteGrid
          fadeDistance={40}
          sectionColor="#a1a1aa"
          cellColor="#d4d4d8"
        />
        <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
      </Canvas>
    </div>
  );
}
