import { useState } from 'react';
import { DoorWindow } from '../types';

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
  description: string;
  onDescriptionChange: (description: string) => void;
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
  description,
  onDescriptionChange
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

      <div className="control-section">
        <h3>Room Description</h3>
        <textarea
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Describe what you want in this room (e.g., 'A cozy living room with a fireplace and space for a sectional sofa')"
          rows={4}
        />
      </div>

      <button className="generate-button" onClick={onSubmit}>Generate</button>
    </div>
  );
};

export default RoomControls; 