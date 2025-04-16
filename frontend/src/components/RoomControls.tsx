import { useState } from 'react';
import { DoorWindow } from '../types';
import { DesignItem, RoomDesign } from '../services/designService';
import SearchModal from './SearchModal';

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
  onDislikeFurniture?: (itemId: string) => void;
  onLikeFurniture?: (itemId: string) => void;
  designOptions?: RoomDesign[];
  onSelectDesign?: (index: number) => void;
  likedFurniture?: string[];
  dislikedFurniture?: string[];
  onFurnitureSelect?: (item: DesignItem | null) => void;
  setShowPrompt: (showPrompt: boolean) => void;
  showPrompt?: boolean
  replaceFurniture?: (oldItemId: string, newItem: any) => void;
  onReplace: (replaced: boolean) => void;
}


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
  onDislikeFurniture,
  onLikeFurniture,
  designOptions,
  onSelectDesign,
  likedFurniture = [],
  dislikedFurniture = [],
  setShowPrompt,
  showPrompt,
  onReplace,
  replaceFurniture
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

  const [isModalOpen, setModalOpen] = useState<boolean>(false);
  const currentScene = design?.items.map((item) => item.item_id);

  const currentPosition = getFurniturePosition();

  // Helper functions to check if an item is liked or disliked
  const isItemLiked = (itemId: string): boolean => {
    return likedFurniture.includes(itemId);
  };

  const isItemDisliked = (itemId: string): boolean => {
    return dislikedFurniture.includes(itemId);
  };

  // Function to replace selected furniture with a similar item
  const replaceFurnitureWithSimilarItem = (similarItem: any) => {
    if (!selectedFurniture || !design) return;
    
    if (replaceFurniture) {
      replaceFurniture(selectedFurniture.item_id, similarItem);
      onReplace(true);
    }
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

  // Handle like/dislike actions
  const handleLikeToggle = (itemId: string) => {
    if (onLikeFurniture && !isItemLiked(itemId)) {
      onLikeFurniture(itemId);
    } else if (onDislikeFurniture && isItemLiked(itemId)) {
      onDislikeFurniture(itemId);
    }
  };

  const handleDislikeToggle = (itemId: string) => {
    if (onDislikeFurniture && !isItemDisliked(itemId)) {
      onDislikeFurniture(itemId);
    } else if (onLikeFurniture && isItemDisliked(itemId)) {
      onLikeFurniture(itemId);
    }
  };

  const handlePromptConfirm = () => {
    // User confirms prompt; show the search modal.
    setModalOpen(true);
    setShowPrompt(false);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
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
                    min={-roomLength / 2 + 1}
                    max={roomLength / 2 - 1}
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
                    min={-roomWidth / 2 + 1}
                    max={roomWidth / 2 - 1}
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
          <div className="button-group">
            {isItemLiked(selectedFurniture.item_id) ? (
              <button
                className="liked-button"
                onClick={() => handleDislikeToggle(selectedFurniture.item_id)}
              >
                Liked ✓
              </button>
            ) : isItemDisliked(selectedFurniture.item_id) ? (
              <button
                className="disliked-button"
                onClick={() => handleLikeToggle(selectedFurniture.item_id)}
              >
                Disliked ✗
              </button>
            ) : (
              <>
                <button
                  className="dislike-button"
                  onClick={() => onDislikeFurniture?.(selectedFurniture.item_id)}
                >
                  Dislike
                </button>
                <button
                  className="like-button"
                  onClick={() => onLikeFurniture?.(selectedFurniture.item_id)}
                >
                  Like
                </button>
              </>
            )}
          </div>
          {isItemDisliked(selectedFurniture.item_id) && (
            <div className="prompt">
              <p style={{fontStyle: "oblique"}}>Would you like to search for your favourite object?</p>
              <button onClick={handlePromptConfirm} style={{"margin": "10px 0"}}>
                Yes, show me the search!
              </button>
            </div>
          )}
          {currentScene && 
            <SearchModal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                selectedItemId={selectedFurniture.item_id}
                likedFurniture={likedFurniture}
                dislikedFurniture={dislikedFurniture}
                currentScene={currentScene}
                replaceFurniture={replaceFurnitureWithSimilarItem}
            />
          }
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