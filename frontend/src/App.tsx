import { useState, useCallback } from 'react'
import './App.css'
import RoomVisualizer from './components/RoomVisualizer'
import RoomControls from './components/RoomControls'
import { DoorWindow, RoomSpec } from './types'
import { generateRoomDesign, RoomDesign, DesignItem } from './services/designService'

// Define the result type
interface Result {
  success: boolean;
  message: string;
}

function App() {
  const [roomLength, setRoomLength] = useState(16) // ~5m in feet
  const [roomWidth, setRoomWidth] = useState(13)   // ~4m in feet
  const [doors, setDoors] = useState<DoorWindow[]>([])
  const [windows, setWindows] = useState<DoorWindow[]>([])
  const [description, setDescription] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [design, setDesign] = useState<RoomDesign | undefined>(undefined)
  const [selectedFurniture, setSelectedFurniture] = useState<DesignItem | null>(null)

  const handleAddDoor = (door: DoorWindow) => {
    setDoors([...doors, door])
  }

  const handleAddWindow = (window: DoorWindow) => {
    setWindows([...windows, window])
  }

  const handleRemoveDoor = (index: number) => {
    setDoors(doors.filter((_, i) => i !== index))
  }

  const handleRemoveWindow = (index: number) => {
    setWindows(windows.filter((_, i) => i !== index))
  }

  const handleFurnitureSelect = (item: DesignItem | null) => {
    console.log("handleFurnitureSelect item: ", item)
    setSelectedFurniture(item)
  }

  const handleFurniturePositionChange = (itemId: string, position: [number, number, number]) => {
    if (design) {
      const updatedItems = design.items.map(item => {
        if (item.item_id === itemId) {
          // Convert world position to grid position
          const halfLength = roomLength / 2;
          const halfWidth = roomWidth / 2;
          const gridX = position[0] + halfLength;
          const gridY = position[2] + halfWidth;
          
          // Calculate the size of the furniture
          const sizeX = Math.abs(item.end[1] - item.start[1]);
          const sizeY = Math.abs(item.end[0] - item.start[0]);
          
          // Update the start and end positions based on the center position
          return {
            ...item,
            start: [gridY - sizeY/2, gridX - sizeX/2] as [number, number],
            end: [gridY + sizeY/2, gridX + sizeX/2] as [number, number]
          };
        }
        return item;
      });
      
      setDesign({ ...design, items: updatedItems });
    }
  }

  const handleSubmit = useCallback(async () => {
    // Prepare the data to send to the backend
    const roomSpec: RoomSpec = {
      length: roomLength,
      width: roomWidth,
      doors,
      windows,
      description
    }

    setIsLoading(true)
    setDesign(undefined)
    setSelectedFurniture(null)
    
    try {
      const generatedDesign = await generateRoomDesign(roomSpec)
      setDesign(generatedDesign)
      setResult({
        success: true,
        message: 'Successfully generated interior design recommendations.'
      })
    } catch (error) {
      console.error('Error generating recommendations:', error)
      setResult({
        success: false,
        message: 'An error occurred while generating recommendations.'
      })
    } finally {
      setIsLoading(false)
    }
  }, [roomLength, roomWidth, doors, windows, description])

  return (
    <div className="app">
      <header>
        <h1>InteriorRec</h1>
        <h2>Interior Design Recommendation</h2>
      </header>
      
      <main>
        <div className="room-designer">
          <div className="visualizer-container">
            <RoomVisualizer 
              roomLength={roomLength} 
              roomWidth={roomWidth} 
              doors={doors} 
              windows={windows}
              design={design}
              onFurnitureSelect={handleFurnitureSelect}
              selectedFurniture={selectedFurniture}
              onFurniturePositionChange={handleFurniturePositionChange}
            />
          </div>
          
          <div className="controls-container">
            <RoomControls
              roomLength={roomLength}
              roomWidth={roomWidth}
              doors={doors}
              windows={windows}
              onRoomLengthChange={setRoomLength}
              onRoomWidthChange={setRoomWidth}
              onAddDoor={handleAddDoor}
              onAddWindow={handleAddWindow}
              onRemoveDoor={handleRemoveDoor}
              onRemoveWindow={handleRemoveWindow}
              onSubmit={handleSubmit}
              description={description}
              onDescriptionChange={setDescription}
              selectedFurniture={selectedFurniture}
            />
          </div>
        </div>
        
        {isLoading && (
          <div className="loading-overlay">
            <div className="spinner"></div>
            <p>Generating recommendations...</p>
          </div>
        )}
        
        {result && (
          <div className={`result-message ${result.success ? 'success' : 'error'}`}>
            <p>{result.message}</p>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
