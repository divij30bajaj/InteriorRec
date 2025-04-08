import { useRef, useEffect, useState } from 'react';
import { useLoader, useFrame, ThreeEvent } from '@react-three/fiber';
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
  onPositionChange?: (position: [number, number, number]) => void;
  onDragStateChange?: (isDragging: boolean) => void;
}

const Furniture = ({ 
  item, 
  position, 
  scale = 1, 
  isSelected = false,
  onSelect,
  onPositionChange,
  onDragStateChange
}: FurnitureProps) => {
  const [error, setError] = useState(false);
  const groupRef = useRef<THREE.Group>(null);
  const isDragging = useRef(false);
  const originalPosition = useRef(position);
  const [furniturePosition, setFurniturePosition] = useState(position);

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

  useEffect(() => {
    // Update position when the prop changes, but not during dragging
    if (!isDragging.current) {
      setFurniturePosition(position);
      originalPosition.current = position;
    }
  }, [position]);

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (isSelected) {
      e.stopPropagation();
      isDragging.current = true;
      if (onDragStateChange) {
        onDragStateChange(true);
      }
    } else if (onSelect) {
      onSelect();
    }
  };

  const handlePointerUp = () => {
    if (isDragging.current) {
      isDragging.current = false;
      if (onPositionChange) {
        onPositionChange(furniturePosition);
      }
      if (onDragStateChange) {
        onDragStateChange(false);
      }
    }
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (isSelected && isDragging.current && groupRef.current) {
      e.stopPropagation();
      
      // Get the movement in the plane
      const movementX = e.movementX * 0.1;
      const movementY = e.movementY * 0.1;
      
      // Update position
      const newPosition: [number, number, number] = [
        furniturePosition[0] + movementX,
        furniturePosition[1],
        furniturePosition[2] + movementY
      ];
      
      setFurniturePosition(newPosition);
    }
  };

  useFrame(() => {
    if (groupRef.current) {
      // Update the position on the ThreeJS object directly
      groupRef.current.position.set(
        furniturePosition[0],
        furniturePosition[1],
        furniturePosition[2]
      );
    }
  });

  return (
    <group 
      ref={groupRef}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerMove={handlePointerMove}
      position={furniturePosition}
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