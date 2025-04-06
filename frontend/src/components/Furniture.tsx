import { useRef, useEffect, useState } from 'react';
import { useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { GLTF } from 'three/examples/jsm/loaders/GLTFLoader';
import { DesignItem } from '../services/designService';

interface FurnitureProps {
  item: DesignItem;
  position: [number, number, number];
  scale?: number;
}

const Furniture = ({ item, position, scale = 1 }: FurnitureProps) => {
  const [error, setError] = useState(false);
  const groupRef = useRef<THREE.Group>(null);

  // Try to load the model, fallback to a simple box if it fails
  const gltf = useLoader(
    GLTFLoader,
    `objects/${item.item_id}.glb`,
    (loader) => {
      loader.manager.onError = (url: string) => {
        console.error(`Error loading model: ${url}`);
        setError(true);
      };
    }
  ) as GLTF;

  useEffect(() => {
    if (gltf.scene && groupRef.current) {
      // Center the model
      const box = new THREE.Box3().setFromObject(gltf.scene);
      console.log(box)
      const height = box.max.y - box.min.y;
      const width = box.max.x - box.min.x;
      const depth = box.max.z - box.min.z;
      console.log(height, width, depth)
      groupRef.current.add(gltf.scene);
    } else {
      console.log('Model or group ref not available');
    }
  }, [gltf, item.item_id]);

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
          {item.item_id}
        </Text>
      </group>
    );
  }

  return (
    <group ref={groupRef} position={position} scale={[scale, scale, scale]} />
  );
};

export default Furniture; 