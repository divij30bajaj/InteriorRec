import { useRef, useState, useEffect } from 'react';
import { Canvas, useThree, useFrame, useLoader } from '@react-three/fiber';
import { OrbitControls, Box, Plane, Text } from '@react-three/drei';
import * as THREE from 'three';
import { DoorWindow } from '../types';
import Furniture from './Furniture';
import { RoomDesign, DesignItem } from '../services/designService';

interface RoomVisualizerProps {
  roomLength: number;
  roomWidth: number;
  doors: DoorWindow[];
  windows: DoorWindow[];
  design?: RoomDesign;
  onFurnitureSelect?: (item: DesignItem | null) => void;
  selectedFurniture?: DesignItem | null;
  onFurniturePositionChange?: (itemId: string, position: [number, number, number]) => void;
}

// Compass component to show North direction
const Compass = () => {
  const { camera } = useThree();
  const textRef = useRef<THREE.Group>(null);
  
  useFrame(() => {
    if (textRef.current) {
      // Make the text always face the camera
      textRef.current.quaternion.copy(camera.quaternion);
    }
  });

  return (
    <group position={[0, 0.1, -15]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.2, 0.2, 0.05, 32]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.1, 0.3, 32]} />
        <meshStandardMaterial color="#ff0000" />
      </mesh>
      <group ref={textRef}>
        <Text
          position={[0, 0.5, 0]}
          fontSize={0.3}
          color="#000000"
          anchorX="center"
          anchorY="middle"
        >
          N
        </Text>
      </group>
    </group>
  );
};

const Room = ({ 
  roomLength, 
  roomWidth, 
  doors, 
  windows, 
  showWalls = true, 
  design,
  onFurnitureSelect,
  selectedFurniture,
  onFurniturePositionChange
}: RoomVisualizerProps & { showWalls?: boolean }) => {
  // Convert room dimensions from feet to Three.js units (1:1 scale)
  const halfLength = roomLength / 2;
  const halfWidth = roomWidth / 2;
  const wallHeight = 8; // Standard ceiling height in feet
  const wallThickness = 0.5; // Wall thickness in feet

  const floorTexture = useLoader(THREE.TextureLoader, '/textures/floor.jpg');
  floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
  floorTexture.repeat.set(roomLength/2, roomWidth/2);

  // Convert grid position to world position
  const gridToWorld = (gridX: number, gridY: number): [number, number, number] => {
    const cellWidth = 1;
    const cellHeight = 1;
    const x = (gridX - halfLength) * cellWidth; // Center the grid
    const z = (gridY - halfWidth) * cellHeight; // Center the grid
    return [x, 0, z];
  };

  return (
    <group>
      {/* Floor */}
      <Plane 
        args={[roomLength, roomWidth]} 
        rotation={[-Math.PI / 2, 0, 0]} 
        position={[0, 0, 0]}
      >
        <meshStandardMaterial map={floorTexture} />
      </Plane>
      
      {/* Ceiling */}
      <Plane 
        args={[roomLength, roomWidth]} 
        rotation={[Math.PI / 2, 0, 0]} 
        position={[0, wallHeight, 0]}
      >
        <meshStandardMaterial color="#FFFFFF" />
      </Plane>
      
      {showWalls && (
        <>
          {/* North Wall */}
          <Wall 
            length={roomLength} 
            height={wallHeight} 
            thickness={wallThickness}
            position={[0, wallHeight/2, -halfWidth]} 
            rotation={[0, 0, 0]}
            wall="north"
            doors={doors}
            windows={windows}
            color={design?.wallColor || '#e8e8e8'}
          />

          {/* South Wall */}
          <Wall
            length={roomLength}
            height={wallHeight}
            thickness={wallThickness}
            position={[0, wallHeight/2, halfWidth]}
            rotation={[0, Math.PI, 0]}
            wall="south"
            doors={doors}
            windows={windows}
            color={design?.wallColor || '#e8e8e8'}
          />

          {/* East Wall */}
          <Wall
            length={roomWidth}
            height={wallHeight}
            thickness={wallThickness}
            position={[halfLength, wallHeight/2, 0]}
            rotation={[0, -Math.PI/2, 0]}
            wall="east"
            doors={doors}
            windows={windows}
            color={design?.wallColor || '#e8e8e8'}
          />

          {/* West Wall */}
          <Wall
            length={roomWidth}
            height={wallHeight}
            thickness={wallThickness}
            position={[-halfLength, wallHeight/2, 0]}
            rotation={[0, Math.PI/2, 0]}
            wall="west"
            doors={doors}
            windows={windows}
            color={design?.wallColor || '#e8e8e8'}
          />
        </>
      )}

      {/* Add compass */}
      <Compass />

      {/* Add furniture */}
      {design?.items.map((item, index) => {
        const position = gridToWorld((item.start[1]+item.end[1])/2, (item.start[0]+item.end[0])/2);
        return (
          <Furniture
            key={`furniture-${index}`}
            item={item}
            position={position}
            scale={3}
            isSelected={selectedFurniture?.item_id === item.item_id}
            onSelect={() => onFurnitureSelect?.(item)}
          />
        );
      })}
    </group>
  );
};

interface WallProps {
  length: number;
  height: number;
  thickness: number;
  position: [number, number, number];
  rotation: [number, number, number];
  wall: 'north' | 'east' | 'south' | 'west';
  doors: DoorWindow[];
  windows: DoorWindow[];
}

const Wall = ({ length, height, thickness, position, rotation, wall, doors, windows, color }: WallProps) => {
  // Filter doors and windows for this wall
  const wallDoors = doors.filter(door => door.wall === wall);
  const wallWindows = windows.filter(window => window.wall === wall);
  
  return (
    <group position={position} rotation={rotation}>
      {/* Main wall */}
      <Box args={[length, height, thickness]} castShadow receiveShadow>
        <meshStandardMaterial color={color} />
      </Box>
      
      {/* Render doors */}
      {wallDoors.map((door, index) => (
        <Box 
          key={`door-${index}`}
          args={[door.width, door.height, thickness * 1.1]} 
          position={[(door.position - 0.5) * length, (door.height / 2) - (height / 2), 0]}
          castShadow
        >
          <meshStandardMaterial color="brown" />
        </Box>
      ))}
      
      {/* Render windows */}
      {wallWindows.map((window, index) => (
        <Box 
          key={`window-${index}`}
          args={[window.width, window.height, thickness * 1.1]} 
          position={[(window.position - 0.5) * length, (window.height / 2), 0]}
          castShadow
        >
          <meshStandardMaterial color="lightblue" transparent opacity={0.6} />
        </Box>
      ))}
    </group>
  );
};

const RoomVisualizer = ({ 
  roomLength, 
  roomWidth, 
  doors, 
  windows, 
  design,
  onFurnitureSelect,
  selectedFurniture,
  onFurniturePositionChange
}: RoomVisualizerProps) => {
  const [showWalls, setShowWalls] = useState(true);

  return (
    <div style={{ width: '100%', height: '100%', backgroundColor: '#f5f5f5', borderRadius: '16px', overflow: 'hidden', position: 'relative' }}>
      <Canvas shadows camera={{ position: [15, 15, 15], fov: 75 }}>
        <ambientLight intensity={0.3} />
        <directionalLight
          position={[10, 10, 5]}
          intensity={1}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <Room 
          roomLength={roomLength} 
          roomWidth={roomWidth} 
          doors={doors} 
          windows={windows}
          showWalls={showWalls}
          design={design}
          onFurnitureSelect={onFurnitureSelect}
          selectedFurniture={selectedFurniture}
          onFurniturePositionChange={onFurniturePositionChange}
        />
        <OrbitControls makeDefault />
        <gridHelper args={[30, 30, `white`, `gray`]} />
      </Canvas>
      <button
        onClick={() => setShowWalls(!showWalls)}
        style={{
          position: 'absolute',
          bottom: '20px',
          right: '20px',
          padding: '8px 16px',
          backgroundColor: showWalls ? '#ff4757' : '#4caf50',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          zIndex: 10
        }}
      >
        {showWalls ? 'Hide Walls' : 'Show Walls'}
      </button>
    </div>
  );
};

export default RoomVisualizer; 