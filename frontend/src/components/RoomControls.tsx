import { useState, useRef, useEffect } from 'react';
import { DoorWindow } from '../types';
import { API_URL, DesignItem, RoomDesign } from '../services/designService';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

interface RoomControlsProps {
  roomLength: number;
  roomWidth: number;
  doors: DoorWindow[];
  windows: DoorWindow[];
  onRoomLengthChange: (length: number) => void;
  onRoomWidthChange: (width: number) => void;
  onAddDoor: (door: DoorWindow) => void;
  onAddWindow: (window: DoorWindow) => void;
  onRemoveDoor: (index: number) => void;
  onRemoveWindow: (index: number) => void;
  onSubmit: () => void;
  roomType: 'livingRoom' | 'bedroom' | 'diningRoom';
  onRoomTypeChange: (roomType: 'livingRoom' | 'bedroom' | 'diningRoom') => void;
  selectedFurniture: DesignItem | null;
  onFurniturePositionChange?: (itemId: string, position: [number, number, number]) => void;
  design: RoomDesign | undefined;
  onUnselectFurniture?: () => void;
  designOptions?: RoomDesign[];
  onSelectDesign?: (index: number) => void;
}

// Model thumbnail component
const ModelThumbnail = ({ itemId }: { itemId: string }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  
  useEffect(() => {
    if (!canvasRef.current) return;
    
    // Set up scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f3f5);
    
    // Set up camera
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.z = 1.5;
    camera.position.y = 0.5;
    
    // Set up renderer
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
    });
    renderer.setSize(80, 80);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    
    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);
    
    // Load model
    const loader = new GLTFLoader();
    const modelUrl = `http://127.0.0.1:5000/s3-proxy/${itemId}`;
    
    loader.load(
      modelUrl,
      (gltf) => {
        // Center and scale model to fit view
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 1 / maxDim;
        
        gltf.scene.position.x = -center.x * scale;
        gltf.scene.position.y = -center.y * scale;
        gltf.scene.position.z = -center.z * scale;
        gltf.scene.scale.multiplyScalar(scale);
        
        scene.add(gltf.scene);
        
        // Add orbit controls for a bit of movement
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.minDistance = 1;
        controls.maxDistance = 3;
        controls.autoRotate = true;
        controls.autoRotateSpeed = 3;
        
        // Animation loop
        const animate = () => {
          requestAnimationFrame(animate);
          controls.update();
          renderer.render(scene, camera);
        };
        
        animate();
        setLoading(false);
      },
      undefined,
      (error) => {
        console.error(`Error loading model thumbnail: ${error}`);
        setError(true);
        setLoading(false);
      }
    );
    
    // Cleanup
    return () => {
      renderer.dispose();
      scene.clear();
    };
  }, [itemId]);
  
  if (error) {
    return (
      <div className="thumbnail-placeholder">
        <span>No Preview</span>
      </div>
    );
  }
  
  return (
    <>
      {loading && <div className="thumbnail-loading">Loading...</div>}
      <canvas ref={canvasRef} className="model-thumbnail" />
    </>
  );
};

const RoomControls = ({
  roomLength,
  roomWidth,
  doors,
  windows,
  onRoomLengthChange,
  onRoomWidthChange,
  onAddDoor,
  onAddWindow,
  onRemoveDoor,
  onRemoveWindow,
  onSubmit,
  roomType,
  onRoomTypeChange,
  selectedFurniture,
  onFurniturePositionChange,
  design,
  onUnselectFurniture,
  designOptions,
  onSelectDesign
}: RoomControlsProps) => {
  const [newDoor, setNewDoor] = useState<DoorWindow>({
    wall: 'north',
    position: 0.5,
    width: 3.28, // ~1m in feet
    height: 6.56  // ~2m in feet
  });

  const [newWindow, setNewWindow] = useState<DoorWindow>({
    wall: 'north',
    position: 0.5,
    width: 3.28, // ~1m in feet
    height: 3.28  // ~1m in feet
  });

  // Calculate current position for selected furniture
  const getFurniturePosition = (): [number, number, number] | null => {
    if (!selectedFurniture) return null;
    
    // Calculate center position of the furniture
    const centerX = (selectedFurniture.start[1] + selectedFurniture.end[1]) / 2;
    const centerY = (selectedFurniture.start[0] + selectedFurniture.end[0]) / 2;
    
    // Convert to world coordinates
    const halfLength = roomLength / 2;
    const halfWidth = roomWidth / 2;
    
    const x = centerX - halfLength;
    const z = centerY - halfWidth;
    
    return [x, 0, z];
  };

  const [similarItems, setSimilarItems] = useState([]);
    
  const currentPosition = getFurniturePosition();


  const getSimilarItems = async () => {
    const similarItems = await fetch(`${API_URL}/get-similar-items?item_id=${selectedFurniture?.item_id}`,
      {
        headers: {
          'Content-Type': 'application/json'
        },
        method: 'GET'
      }
    );
    const data = await similarItems.json();
    console.log(data);
    setSimilarItems(data);
  };
  
  const handlePositionChange = (axis: 'x' | 'z', value: number) => {
    if (selectedFurniture && onFurniturePositionChange && currentPosition) {
      const newPosition: [number, number, number] = [...currentPosition];
      
      if (axis === 'x') {
        newPosition[0] = value;
      } else if (axis === 'z') {
        newPosition[2] = value;
      }
      
      onFurniturePositionChange(selectedFurniture.item_id, newPosition);
    }
  };

  const handleAddDoor = () => {
    onAddDoor({ ...newDoor });
    // Reset position for next door
    setNewDoor({ ...newDoor, position: 0.5 });
  };

  const handleAddWindow = () => {
    onAddWindow({ ...newWindow });
    // Reset position for next window
    setNewWindow({ ...newWindow, position: 0.5 });
  };

  return (
    <div className="room-controls">
      {/* Selected Furniture Details */}
      {design && selectedFurniture && (
        <div className="control-section">
          <h3>Selected Furniture</h3>
          <div className="furniture-details">
            <p><strong>Item ID:</strong> {selectedFurniture.item_id}</p>
            <p><strong>Object Type:</strong> {selectedFurniture.object}</p>
            <p><strong>Position:</strong> ({selectedFurniture.start[0].toFixed(1)}, {selectedFurniture.start[1].toFixed(1)})</p>
            <p><strong>Size:</strong> {Math.abs(selectedFurniture.end[0] - selectedFurniture.start[0]).toFixed(1)} x {Math.abs(selectedFurniture.end[1] - selectedFurniture.start[1]).toFixed(1)}</p>
            
            {/* Position Controls */}
            <div className="position-controls">
              <h4>Adjust Position</h4>
              
              {/* X Position */}
              <div className="control-group">
                <label htmlFor="furniture-position-x">X Position (Left/Right)</label>
                <div className="slider-container">
                  <input
                    type="range"
                    id="furniture-position-x"
                    min={-roomLength/2 + 1}
                    max={roomLength/2 - 1}
                    step="0.5"
                    value={currentPosition ? currentPosition[0] : 0}
                    onChange={(e) => handlePositionChange('x', parseFloat(e.target.value))}
                  />
                  <span>{currentPosition ? currentPosition[0].toFixed(1) : 0}</span>
                </div>
              </div>
              
              {/* Z Position */}
              <div className="control-group">
                <label htmlFor="furniture-position-z">Z Position (Forward/Back)</label>
                <div className="slider-container">
                  <input
                    type="range"
                    id="furniture-position-z"
                    min={-roomWidth/2 + 1}
                    max={roomWidth/2 - 1}
                    step="0.5"
                    value={currentPosition ? currentPosition[2] : 0}
                    onChange={(e) => handlePositionChange('z', parseFloat(e.target.value))}
                  />
                  <span>{currentPosition ? currentPosition[2].toFixed(1) : 0}</span>
                </div>
              </div>
            </div>
          </div>
          <button className="unselect-button" onClick={onUnselectFurniture}>Unselect</button>
          <hr/>
          <button className="generate-button" onClick={getSimilarItems}>Get Similar Items</button>
          {similarItems.length > 0 && (
            <div className="similar-items-list">
              <h4>Similar Items</h4>
              <ul>
                {similarItems.map((item: any) => (
                  <div className="furniture-details" key={item.item_id}>
                    <div className="similar-item">
                      <div className="thumbnail-container">
                        <ModelThumbnail itemId={item.item_id} />
                      </div>
                      <div className="item-info">
                        <li>{item.item_id} - {item.description}</li>
                      </div>
                    </div>
                  </div>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {design && !selectedFurniture && (
        <div className="control-section">
          <h3>Click on a furniture to select it!</h3>
        </div>
      )}
      
      {!design && (
        <>
        <div className="control-section">
          <h3>Room Type</h3>
          <select
            value={roomType}
            onChange={(e) => onRoomTypeChange(e.target.value as 'livingRoom' | 'bedroom' | 'diningRoom')}
          >
            <option value="livingRoom">Living Room</option>
            <option value="bedroom">Bedroom</option>
            <option value="diningRoom">Dining Room</option>
          </select>
        </div>
        <div className="control-section">
          <h3>Room Dimensions</h3>
          <div className="control-group">
            <label htmlFor="length">Length of room</label>
            <div className="slider-container">
              <input
                type="range"
                id="length"
                min="6"
                max="30"
                step="0.5"
                value={roomLength}
                onChange={(e) => onRoomLengthChange(parseFloat(e.target.value))}
              />
              <span>{roomLength.toFixed(1)}ft</span>
            </div>
          </div>
          
          <div className="control-group">
            <label htmlFor="width">Width of room</label>
            <div className="slider-container">
              <input
                type="range"
                id="width"
                min="6"
                max="30"
                step="0.5"
                value={roomWidth}
                onChange={(e) => onRoomWidthChange(parseFloat(e.target.value))}
              />
              <span>{roomWidth.toFixed(1)}ft</span>
            </div>
          </div>
        </div>

        <div className="control-section">
          <h3>Add Doors/Windows</h3>
          
          {/* Door Controls */}
          <div className="element-controls">
            <h4>Add Door</h4>
            <div className="control-group">
              <label htmlFor="door-wall">Wall</label>
              <select
                id="door-wall"
                value={newDoor.wall}
                onChange={(e) => setNewDoor({ ...newDoor, wall: e.target.value as 'north' | 'east' | 'south' | 'west' })}
              >
                <option value="north">North</option>
                <option value="east">East</option>
                <option value="south">South</option>
                <option value="west">West</option>
              </select>
            </div>
            
            <div className="control-group">
              <label htmlFor="door-position">Position</label>
              <div className="slider-container">
                <input
                  type="range"
                  id="door-position"
                  min="0.1"
                  max="0.9"
                  step="0.05"
                  value={newDoor.position}
                  onChange={(e) => setNewDoor({ ...newDoor, position: parseFloat(e.target.value) })}
                />
                <span>{(newDoor.position * 100).toFixed(0)}%</span>
              </div>
            </div>
            
            <div className="control-group">
              <label htmlFor="door-width">Width</label>
              <div className="slider-container">
                <input
                  type="range"
                  id="door-width"
                  min="2"
                  max="6"
                  step="0.5"
                  value={newDoor.width}
                  onChange={(e) => setNewDoor({ ...newDoor, width: parseFloat(e.target.value) })}
                />
                <span>{newDoor.width.toFixed(1)}ft</span>
              </div>
            </div>
            
            <button className="add-button" onClick={handleAddDoor}>Add Door</button>
          </div>

          {/* Window Controls */}
          <div className="element-controls">
            <h4>Add Window</h4>
            <div className="control-group">
              <label htmlFor="window-wall">Wall</label>
              <select
                id="window-wall"
                value={newWindow.wall}
                onChange={(e) => setNewWindow({ ...newWindow, wall: e.target.value as 'north' | 'east' | 'south' | 'west' })}
              >
                <option value="north">North</option>
                <option value="east">East</option>
                <option value="south">South</option>
                <option value="west">West</option>
              </select>
            </div>
            
            <div className="control-group">
              <label htmlFor="window-position">Position</label>
              <div className="slider-container">
                <input
                  type="range"
                  id="window-position"
                  min="0.1"
                  max="0.9"
                  step="0.05"
                  value={newWindow.position}
                  onChange={(e) => setNewWindow({ ...newWindow, position: parseFloat(e.target.value) })}
                />
                <span>{(newWindow.position * 100).toFixed(0)}%</span>
              </div>
            </div>
            
            <div className="control-group">
              <label htmlFor="window-width">Width</label>
              <div className="slider-container">
                <input
                  type="range"
                  id="window-width"
                  min="2"
                  max="6"
                  step="0.5"
                  value={newWindow.width}
                  onChange={(e) => setNewWindow({ ...newWindow, width: parseFloat(e.target.value) })}
                />
                <span>{newWindow.width.toFixed(1)}ft</span>
              </div>
            </div>
            
            <button className="add-button" onClick={handleAddWindow}>Add Window</button>
          </div>
        </div>

        {/* Lists of added doors and windows */}
        <div className="elements-list">
          <div className="doors-list">
            <h4>Doors ({doors.length})</h4>
            {doors.length === 0 ? (
              <p className="empty-list">No doors added yet</p>
            ) : (
              <ul>
                {doors.map((door, index) => (
                  <li key={`door-${index}`}>
                    {door.wall} wall - pos: {door.position.toFixed(2)}
                    <button className="remove-button" onClick={() => onRemoveDoor(index)}>×</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          
          <div className="windows-list">
            <h4>Windows ({windows.length})</h4>
            {windows.length === 0 ? (
              <p className="empty-list">No windows added yet</p>
            ) : (
              <ul>
                {windows.map((window, index) => (
                  <li key={`window-${index}`}>
                    {window.wall} wall - pos: {window.position.toFixed(2)}
                    <button className="remove-button" onClick={() => onRemoveWindow(index)}>×</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <button className="generate-button" onClick={onSubmit}>Generate</button>
        </>
      )}
      
      {designOptions && designOptions.length > 0 && (
        <div className="design-options">
          <h3>Select a Design Style</h3>
          <div className="style-options">
            <div className="style-option" onClick={() => onSelectDesign && onSelectDesign(0)}>
              <h4>Minimal Style</h4>
              <p>Clean lines and functional simplicity.</p>
              <div className="items-count">{designOptions[0].items.length} items</div>
            </div>
            <div className="style-option" onClick={() => onSelectDesign && onSelectDesign(1)}>
              <h4>Mid-Century Style</h4>
              <p>Rich details and abundant furnishings.</p>
              <div className="items-count">{designOptions[1].items.length} items</div>
            </div>
            <div className="style-option" onClick={() => onSelectDesign && onSelectDesign(2)}>
              <h4>Modern Style</h4>
              <p>Contemporary aesthetics with bold choices.</p>
              <div className="items-count">{designOptions[2].items.length} items</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoomControls; 