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
  isSelected?: boolean;
  onSelect?: () => void;
}

const Furniture = ({ 
  item, 
  position, 
  scale = 1, 
  isSelected = false,
  onSelect
}: FurnitureProps) => {
  const [error, setError] = useState(false);
  const groupRef = useRef<THREE.Group>(null);
  
  // Generate proxy URL for the model
  const modelUrl = `http://127.0.0.1:5000/s3-proxy/${item.item_id}`;

  // Try to load the model, fallback to a simple box if it fails
  const gltf = useLoader(
    GLTFLoader,
    modelUrl,
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
      const center = box.getCenter(new THREE.Vector3());
      
      // Center the model
      gltf.scene.position.x = -center.x;
      gltf.scene.position.y = -center.y;
      gltf.scene.position.z = -center.z;
      
      groupRef.current.add(gltf.scene);
    }
  }, [gltf, item.item_id]);

  return (
    <group 
      ref={groupRef}
      onClick={onSelect}
      position={position}
      scale={[scale, scale, scale]}
    >
      {error ? (
        <>
          <mesh>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color={isSelected ? "#4caf50" : "#666666"} />
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
        </>
      ) : null}
      
      {/* Visual indicator for selected items */}
      {isSelected && (
        <mesh position={[0, -0.1, 0]}>
          <circleGeometry args={[1.2, 32]} />
          <meshBasicMaterial color="#4caf50" transparent opacity={0.3} />
        </mesh>
      )}
    </group>
  );
};

export default Furniture; 