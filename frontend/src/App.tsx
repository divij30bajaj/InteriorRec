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
  const [roomType, setRoomType] = useState<'livingRoom' | 'bedroom' | 'diningRoom'>('livingRoom')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [design, setDesign] = useState<RoomDesign | undefined>(undefined)
  const [designOptions, setDesignOptions] = useState<RoomDesign[] | undefined>(undefined)
  const [selectedFurniture, setSelectedFurniture] = useState<DesignItem | null>(null)
  const [likedFurniture, setLikedFurniture] = useState<string[]>([])
  const [dislikedFurniture, setDislikedFurniture] = useState<string[]>([])
  const [showPrompt, setShowPrompt] = useState<boolean>(false);

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

  const handleUnselectFurniture = () => {
    setSelectedFurniture(null);
  };

  const handleDislikeFurniture = (itemId: string) => {
    console.log("handleDislikeFurniture itemId: ", itemId)
    setShowPrompt(true);
    setDislikedFurniture([...dislikedFurniture, itemId])
  }   

  const handleLikeFurniture = (itemId: string) => {
    console.log("handleLikeFurniture itemId: ", itemId)
    setLikedFurniture([...likedFurniture, itemId])
  }
  
  // Handler to replace furniture with a similar item
  const handleReplaceFurniture = (oldItemId: string, newItem: any) => {
    if (design) {
      // Find the item to be replaced
      const itemToReplace = design.items.find(item => item.item_id === oldItemId);

      if (!itemToReplace) return;
      handleLikeFurniture(newItem.item_id)

      // Create a deep copy of the current design to avoid side effects
      const updatedDesign: RoomDesign = JSON.parse(JSON.stringify(design));

      // Replace just the specific item
      const itemIndex = updatedDesign.items.findIndex(item => item.item_id === oldItemId);
      if (itemIndex !== -1) {
        // Create a new item with the new ID but keep EXACT same position, size and all other properties
        updatedDesign.items[itemIndex] = {
          ...updatedDesign.items[itemIndex],
          item_id: newItem.item_id,
          object: newItem.description || newItem.object || updatedDesign.items[itemIndex].object
        };

        // Update the design state with the completely new object
        setDesign(updatedDesign);

        // Update the selected furniture if it was the one replaced
        if (selectedFurniture && selectedFurniture.item_id === oldItemId) {
          // Create a new reference for the selected furniture
          const updatedSelectedItem = {
            ...updatedDesign.items[itemIndex]
          };

          // Clear and then set the selected furniture
          setSelectedFurniture(null);
          setTimeout(() => {
            setSelectedFurniture(updatedSelectedItem);
          }, 10);
        }
      }
    }
  };

  const handleSelectDesign = (index: number) => {
    if (designOptions && designOptions.length > index) {
      setDesign(designOptions[index]);
      setDesignOptions(undefined); // Clear options once a design is selected
      setResult({
        success: true,
        message: 'Design selected successfully.'
      });
    }
  };

  const handleSubmit = useCallback(async () => {
    // Prepare the base data to send to the backend
    const baseRoomSpec: RoomSpec = {
      length: roomLength,
      width: roomWidth,
      doors,
      windows,
      roomType
    }

    setIsLoading(true)
    setDesign(undefined)
    setDesignOptions(undefined)
    setSelectedFurniture(null)
    
    try {
      // Generate designs for different styles
      const promises = ['minimal', 'mid-century', 'modern'].map(async (style) => {
        const roomSpec = {
          ...baseRoomSpec, 
          style: style as 'minimal' | 'mid-century' | 'modern'
        };
        return await generateRoomDesign(roomSpec);
      });
      
      const generatedDesigns = await Promise.all(promises);
      setDesignOptions(generatedDesigns);
      
      setResult({
        success: true,
        message: 'Successfully generated design options. Please select a style.'
      });
    } catch (error) {
      console.error('Error generating recommendations:', error)
      setResult({
        success: false,
        message: 'An error occurred while generating recommendations.'
      })
    } finally {
      setIsLoading(false)
    }
  }, [roomLength, roomWidth, doors, windows, roomType])

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
              roomType={roomType}
              onRoomTypeChange={setRoomType}
              selectedFurniture={selectedFurniture}
              onFurniturePositionChange={handleFurniturePositionChange}
              design={design}
              onUnselectFurniture={handleUnselectFurniture}
              onDislikeFurniture={handleDislikeFurniture}
              onLikeFurniture={handleLikeFurniture}
              designOptions={designOptions}
              onSelectDesign={handleSelectDesign}
              likedFurniture={likedFurniture}
              dislikedFurniture={dislikedFurniture}
              onReplaceFurniture={handleReplaceFurniture}
              setShowPrompt={setShowPrompt}
              showPrompt={showPrompt}
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
