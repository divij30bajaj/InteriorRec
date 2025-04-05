import { useRef, useEffect, useState } from 'react';
import { useLoader } from '@react-three/fiber';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader';
import { Text } from '@react-three/drei';
import * as THREE from 'three';

interface FurnitureProps {
  itemId: string;
  position: [number, number, number];
  scale?: number;
}

const Furniture = ({ itemId, position, scale = 0.0254 }: FurnitureProps) => {
  const [error, setError] = useState(false);
  const groupRef = useRef<THREE.Group>(null);

  // Try to load the model, fallback to a simple box if it fails
  const gltf = useLoader(
    GLTFLoader,
    `http://localhost:5000/models/${itemId}.glb`,
    undefined,
    (error) => {
      console.error(`Error loading model:`, error);
      setError(true);
    }
  ) as GLTF;

  useEffect(() => {
    if (gltf?.scene && groupRef.current) {
      // Center the model
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const center = box.getCenter(new THREE.Vector3());
      gltf.scene.position.sub(center);
      
      // Add the model to the group
      groupRef.current.add(gltf.scene);
    }
  }, [gltf]);

  if (error) {
    // Fallback to a simple box with the item ID as text
    return (
      <group position={position} scale={[scale, scale, scale]}>
        <mesh>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#666666" />
        </mesh>
        <Text
          position={[0, 0.6, 0]}
          fontSize={0.2}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
        >
          {itemId}
        </Text>
      </group>
    );
  }

  return (
    <group ref={groupRef} position={position} scale={[scale, scale, scale]} />
  );
};

export default Furniture; 